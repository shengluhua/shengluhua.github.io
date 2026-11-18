---
title: "第30课｜MESI状态机与协议竞态：Transient State、Invalidate ACK与Directory压力"
track: arch
number: 30
date: 2026-11-18
week: 5
minutes: 18
kind: full
summary: "从两核同时升级同一Line的竞态出发，理解MESI瞬态、失效确认、目录序列化、热点所有权传递和死锁/公平性；再次区分权限、Store Buffer全局可见与TSO。"
tags: [MESI, cache-coherence, transient-state, invalidation-ack, directory, race-condition, false-sharing, deadlock, store-buffer, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第30课
## MESI状态机与协议竞态：Transient State、Invalidate ACK与Directory压力

**2026年11月18日｜第5周第2节｜预计18分钟（讲授，测评另计）**

第29课学了MESI的M/E/S/I四种**稳定状态**及写所有权转移。今天要研究稳定状态图省略的部分：**当Invalidate还在网络上、ACK尚未返回、两个CPU同时申请写同一Line时，硬件处于什么状态？** 这正是Transient State（瞬态）和Directory（目录）控制的核心作用。

目标：能够解释SM、IM等瞬态；推导确认式协议的授权条件与临界路径；追踪并发S→M竞态、目录串行化和False Sharing；最终正确区分**协议写权限、Store Buffer全局可见和DRAM回写**。

## 一、动机：稳定状态图无法描述“正在申请”（约2分钟）

初始Core 0和Core 1都以S状态持有Line X，里面的数据相同。某周期两核**同时执行Store X**。第29课的简图都只有S→M箭头，然而现在两核都想沿着箭头走：

~~~text
             Core 0              Core 1
起点           S                   S
请求           Upgrade X           Upgrade X
疑问           ???                 ???
禁止           M                   M   ← 不能无协调地同时拥有写权限
~~~

必须回答：谁先获得写所有权？另一核在收到Invalidate时如何处理自己尚未完成的升级？怎么知道所有旧副本确实失效？

因此真实协议除了四种稳定状态，还需要**未完成事务状态、消息队列、计数器和重试机制**。

## 二、符号和严格的教学假设（约1分钟）

本课默认普通可缓存、写失效、目录式MESI；一条Line为64B；每核私有L1；目录按**同一Line**序列化冲突写请求；各Invalidation需要确认；忽略传输失败与设备非相干访问。每个讲解Trace明确写出消息到达次序。

| 符号 | 含义 |
|---|---|
| N | 对某Line持有有效共享副本的核数 |
| S(L) | 目录对Line L记录的Sharer集合 |
| Owner(L) | 持有该Line写权限的核（若有） |
| a | 本次升级必须收到的Invalidate ACK数 |
| T_req | 升级请求到达并被目录处理的路径时间 |
| T_ack,j | 从目录发送失效到收到Sharer j确认的时间 |
| T_grant | 收齐所需确认后，Grant送达请求者的时间 |

注意：Directory记录的是**相干协议元数据**，不是软件的页表；MESI的S与程序状态/系统调用的S不是同一个概念。

## 三、Stable State与Transient State（约2分钟）

四种稳定状态M、E、S、I描述的是“已经完成的权限关系”。但Cache还会遇到“消息已经发出，结果尚未来”的时期。

一个便于理解的瞬态命名表如下。不同协议的名字不同；并非所有芯片完全沿用此表。

| 瞬态 | 含义 | 当前可做什么 |
|---|---|---|
| IS | 从I请求读共享数据，等数据返回 | 暂不能把缺失数据当作有效 |
| IM | 从I申请写权限，等必要响应 | 不能提前做不可撤销的写 |
| SM | 已有S副本，申请升级为M，等待确认 | 可继续使用仍有效的读权限，但不能直接写 |
| MI / M_I | Modified副本准备回写/逐出，等待确认 | 必须保护最新数据，不能随意丢弃 |
| IS_I | 读Miss尚未完成，却收到冲突Invalidate | 需要处理乱序到达的消息，避免建立过期副本 |

gem5的官方MESI Two-Level协议清楚列出了IS、IM、SM、IS_I、M_I和等待写回确认等瞬态。更细的教学实现还区分IM_AD（等数据和ACK）、IM_A（只等ACK）、SM_A等。参考：[gem5 MESI Two Level](https://www.gem5.org/documentation/general_docs/ruby/MESI_Two_Level/) 和 [gem5 State Declarations](https://www.gem5.org/documentation/learning_gem5/part3/cache-declarations/)。

**最关键的反例**：处于SM的核已经有正确的Line数据，但此时只有**读权限**，不是“我马上就能写”的通行证。

## 四、为什么需要Invalidate ACK？（约3分钟）

假设C0、C1、C2、C3都以S持有同一Line。C0要写入，目录发送Invalidate给其他3个Sharer，收集ACK后才授予独占写权限。

~~~mermaid
sequenceDiagram
    participant C0 as Core0
    participant D as Directory
    participant C1 as Core1
    participant C2 as Core2
    participant C3 as Core3
    C0->>D: UPGRADE(X)
    D->>C1: INV(X)
    D->>C2: INV(X)
    D->>C3: INV(X)
    C2-->>D: INV_ACK(X)
    C1-->>D: INV_ACK(X)
    C3-->>D: INV_ACK(X)
    D-->>C0: GRANT(X)
    Note over C0: 获得独占写权限，可执行写入
~~~

为什么不能刚发完INV就立刻Grant？因为消息可能在互连上延迟，某个Sharer此时仍然拥有有效读副本，或者有尚未处理的同Line事务。如果协议尚未确认旧副本已经失效，就允许新写者直接写，会破坏所有权安全条件。

教学协议的必要授权条件：

\[
\boxed{a_{\rm remaining}=0\quad\land\quad \text{数据/所有权已就绪}\quad\land\quad \text{该Line的事务获序列化授权}}
\]

其中初始需要确认的副本数通常为：

\[
\boxed{a=|S(L)\setminus\{\text{请求者}\}|}
\]

具体协议可优化ACK路由和计数，不能在未知实现时直接把公式当成所有芯片实际消息数。

### 确认等待的临界路径

在Invalidate**并行**发出的简化模型中：

\[
\boxed{T_{\rm upgrade}\approx T_{\rm req}+\max_j T_{{\rm ack},j}+T_{\rm grant}}
\]

不是把每个核的ACK耗时相加，因为失效确认在互连上可以重叠。

**数值例题**：三个Sharer的ACK分别在发出INV后4、7、11周期返回。若请求送达目录3周期，Grant再需2周期：

\[
T_{\rm upgrade}=3+\max(4,7,11)+2=16\ {\rm cycles}.
\]

这仍是教学延迟模型：真实目录排队、争用、数据转交和网络拥堵可能改变该结果。

## 五、两个核同时升级S→M：完整竞态（约3分钟）

假设只有C0、C1共享Line X，起点(S,S)。二者几乎同时发出UPGRADE。

**一种合法的目录执行**：

~~~text
t0  C0处于S，发UPGRADE(X)，进入SM
t0  C1处于S，发UPGRADE(X)，进入SM

t1  Directory先登记C0请求为该Line当前事务
    C1的请求进入按Line排队的待处理队列

t2  Directory向C1发INV
    C1虽然仍在等待自己的升级，也必须处理冲突INV

t3  C1使旧S副本失效，给Directory发送INV_ACK；
    C1先前的升级需要撤销/重试或继续排队并验证事务代号

t4  Directory确认全部旧副本失效，只向C0发GRANT
    C0允许写X，拥有该Line唯一写权限

t5  Directory之后处理C1请求；需要C0让出写权限，
    如已修改则转交最新数据，取得必要确认，才可能给C1 GRANT
~~~

示意图：

~~~mermaid
flowchart TD
    A["C0和C1：S → SM，并发申请写"] --> D{"目录为同一Line仲裁"}
    D --> W["C0先获处理权；C1排队"]
    W --> I["INV到C1：处理冲突，即使C1处在SM"]
    I --> ACK["C1失效并ACK；旧升级待重新校验"]
    ACK --> G["C0得到Grant → 允许写 → M"]
    G --> NEXT["处理C1的请求：要求C0交出权限和最新数据"]
    NEXT --> F["C1最终可获得M，C0转为I"]
~~~

### 为什么不能简单忽略SM状态下收到的INV？

因为C1不能凭“我已经申请升级”拒绝确认，同时还无限等待C0完成。它必须有明确的竞态解决规则：失效、取消、重试、重新验证事务代号，或者按照协议设计进入更细的瞬态。

一种安全实现还会给事务使用编号/epoch，从而避免**迟到的旧GRANT**被误认成新请求的授权。

以上是合法的一种**教学级时序**，不是对每一种MESI目录的逐周期描述。具体协议的消息、ACK路径和中间状态可能不同。

## 六、安全性、活性和死锁：不要只验证结果正确（约2分钟）

### 安全性 Safety

必须永远成立：

1. **Single Writer / Multiple Readers**：同一Line不能出现两个未经协调的有效独占写者。
2. **最新数据守恒**：不能因Invalidate与Writeback竞争而丢掉最新修改，或者把旧副本重新当成有效数据。
3. **没有过期授权**：旧事务的延迟Grant/ACK不能错误完成另一轮授权。

### 活性 Liveness

还要保证：如果通信可靠、请求持续获得处理机会，没有核永远卡在SM、IM或目录Busy状态。

例如，下游处理响应需要队列资源，而这些队列全部被等待上游ACK的请求占满，就可能形成循环等待。工程上会用独立的请求/响应/转发虚拟通道、预留信用、确定的锁顺序、NACK重试与公平仲裁等设计避免死锁和长期饿死。不是“加无限超时”就自动证明活性。

gem5官方协议示例甚至包含收到另一个核转发请求时恰好等待Writeback ACK的特殊状态，说明竞态不仅存在于两次Upgrade之间，还存在于替换和数据转交之间：[gem5 MESI状态说明](https://www.gem5.org/documentation/general_docs/ruby/MESI_Two_Level/)。

## 七、目录压力与热点Line：定量上界（约2分钟）

假设一条Line起初由N个核共享，一个核需要升级：

- 若发送单播Invalidate，理想情况下需约 \(N-1\) 条INV；
- 若每Sharer分别ACK，还需约 \(N-1\) 条ACK；
- 另有请求与授权消息，以及可能的数据转交。

这不是总线的精确Byte数，但说明**共享者越多，协调扇出可能越大**。

对不同Line，目录可并行处理独立事务；但对**同一条热点Line**，互斥写权限转移存在串行限制。

设每次写权限交接在关键路径上平均暴露H周期，且两次交接不能重叠。连续R次写且每次都换核，则：

\[
\boxed{n_{\rm handoff}=R-1,\quad C_{\rm handoff}=(R-1)H}
\]

例如100次交替写、每次交接60周期：

\[
C_{\rm handoff}=99\times60=5940\text{ cycles}.
\]

如果不同核其实只写**同一64B Line里的不同8B变量**，这就是False Sharing。可尝试分别对齐到不同Line，减少所有权来回转移；但会增加工作集、Cache与TLB压力，必须测量端到端收益。

更合理的实验需要同时记录Invalidate/ACK、目录Busy周期、同Line重试/冲突、Cache-to-Cache传输、HITM、互连流量、IPC和P99。单看总Cache Miss Rate不足以诊断。

## 八、最重要的边界：取得M权限 ≠ Store全局可见（约2分钟）

请区分以下四个阶段：

~~~text
1. STORE从ROB按序退休
             ↓
2. 等待/取得Line的写所有权（如M权限）
             ↓
3. 具体Store从写缓冲传播，达到该内存模型规定的可见点
             ↓
4. 脏Line未来可能写回DRAM
~~~

这只是概念关系，不表示所有实现严格按照图中阶段逐周期串行。处理器可能投机取得所有权，甚至在Store退休之前就准备好某些权限；Store Buffer和Cache之间也可能交错。**任何单一事件都不能无条件替代另一个事件。**

尤其要记住：

\[
\boxed{\text{已经拿到M权限}\not\Rightarrow\text{某条Store已全局可见}}
\]

反过来，最新Store值已通过相干系统对其他核可见，也**不要求**脏数据已写到DRAM。

### 复习TSO Store Buffering

初始X=Y=0：

~~~text
Core 0                     Core 1
STORE X=1                  STORE Y=1
r0=LOAD Y                  r1=LOAD X
~~~

SC要求保留每核的Store→Load程序顺序。若两次Load都读0，则需要：

\[
S_X<L_Y<S_Y<L_X<S_X,
\]

出现不可能的有向环。

但在允许Store→不同地址Load放松的TSO中，两个Store可以分别等待在Store Buffer，Load先读取到对方未传播时的旧值，因此(0,0)可以合法，之后Store再正常通过MESI传播。

**Invalidate ACK保证规定的缓存权限交接已完成；它不自动让所有先前Store Buffer里的写入瞬间全局可见。**

所以：

\[
\boxed{\text{Coherence（单地址副本）}\ne\text{Consistency（跨地址观察顺序）}}
\]

## 九、总结、反例与下一讲（约1分钟）

本课三条关键规则：

\[
\boxed{\text{稳定态不够，真实协议还需要瞬态与重试}}
\]

\[
\boxed{\text{Grant需要满足确认、数据和互斥仲裁条件}}
\]

\[
\boxed{T_{\rm upgrade}\sim T_{\rm req}+\max T_{\rm ack}+T_{\rm grant}}
\]

反例：只有本地数据不代表已有独占写权限；发出INV不代表对方已经失效；收到部分ACK不能立即授予M；所有权正确不代表无死锁；取得M不代表当前Store已跨核可见；DRAM旧值也不必然意味着其他核不能读到更新值。

**下一讲：第31课（2026年11月19日，第5周第3节）——《SC、TSO与内存序：Store Buffering、Fence与Happens-before》**。下一讲将把MESI协议与架构层内存顺序彻底分开，通过Litmus Test推导允许与禁止的结果。

---

## 十、四级分级测评（总分100分）

首次课稿仅提供题目及可选提示。标准答案、数值解释、多选答案和开放题参考思路只保存在独立JSON，不在此公布。

### Lv1｜失效确认与独占写权限（15分｜单选｜预计2分钟）

同一64B Line初始由C0、C1、C2以S状态共享。C0申请S→M，C2已经确认失效，但C1的Invalidate ACK尚未到达。C0已拥有本地数据。按本课严格的确认式目录协议，此时哪种操作合法？

**A.** C0已拥有数据，可以立即写，不必等待其他Sharer。

**B.** C0必须等待所有被要求的失效确认及有效授权后才能写，不能仅凭本地数据判断。

**C.** C0必须等待这条Line被最终写回DRAM，才可能从S转为M。

**D.** 目录发出Invalidate就足以让C0立即写，无需考虑实际确认。

<details><summary>可选提示（不泄露答案）</summary>

区分“已有数据”和“已独占写权限”；失效请求发出与失效已完成不是同一事件。

</details>


### Lv2｜目录ACK并行等待与Grant时刻（20分｜数值｜预计4分钟）

四核C0、C1、C2、C3初始均持有同一Line的S副本。C0在t=0发起UPGRADE。目录向其他三个核发送INV，三个ACK到达目录的时间分别为t=5、t=9、t=14。数据及其他条件已就绪；最后一个必要ACK到达之后，目录处理并把GRANT送到C0还需恰好2周期。规定C0在收到GRANT的时刻即可执行该Line的写入，所有时间均为同一周期坐标。问最早可写时刻t为多少？

**仅填写数值，单位：cycle。**

<details><summary>可选提示（不泄露答案）</summary>

在允许并行收集ACK的协议中，不能把所有ACK到达时间简单相加。最迟那个确认通常决定等待终点。

</details>


### Lv3｜瞬态、竞态与TSO边界（25分｜多选｜预计5分钟）

考虑普通可缓存内存、目录式确认协议及支持TSO Store Buffering的处理器。选择所有正确陈述。

**A.** 两个核几乎同时对同一共享Line发起S→M升级时，目录或等价的序列化机制必须防止两者同时获得冲突的独占写权限。

**B.** 如果目录已向3个Sharer发送INV，只需收到其中任意一个ACK就能无条件授予写权限。

**C.** 处于SM等瞬态的Cache收到另一写者的Invalidate时，可能需要撤销/重试自己的待完成升级，不能只按照稳定态S处理。

**D.** Core 0持有M而DRAM仍存旧值时，其他核GETS只能读取DRAM旧值；相干转发是不允许的。

**E.** 获得某Line的M写权限，不等于本核Store Buffer里某条等待中的Store已经完成架构所要求的全局传播。

**F.** 不同Line的目录事务可以并发处理；同一热点Line的互斥所有权转移可能造成序列化瓶颈。

**G.** MESI的Invalidation ACK规则自动把允许Store Buffering的TSO变成SC，因此经典(0,0)结果被禁止。

<details><summary>可选提示（不泄露答案）</summary>

逐一分开：同Line独占权限、瞬态冲突恢复、脏数据来源、Store传播和不同地址的排序模型。

</details>


### Lv4｜竞争升级、热点性能与SC/TSO证明（40分｜开放推导｜预计10—12分钟）

统一模型：4核C0、C1、C2、C3；64B Line；目录式、写失效、所有权互斥的MESI教学协议。初始一条Line L在4核均为S，修改前必须取得全部必要ACK，目录对同一Line按请求到达顺序仲裁。请完成A—D。

A（12分）：C0与C1几乎同时申请S→M，目录先接受C0再接受C1。画出至少含UPGRADE/GETX、INV、INV_ACK、GRANT、重试或排队步骤的合法执行时间线，并说明失败的一方处于SM瞬态时为何不能无条件接受过期GRANT。写出两个安全不变量及一种防止死锁/饿死的策略。

B（8分）：对C0的第一次升级，目录向C1、C2、C3失效；ACK到达目录的时刻为t=4、t=11、t=7，GRANT再需3周期，且数据已就绪。求最早GRANT时刻、失效消息和ACK消息数量，并说明为什么不是三个ACK延迟之和。

C（10分）：16核反复交替写同一Line，每核每次只写自己不同的8B字段。假设100次写中首次获取所有权成本不计，其余每次都需跨核转移，额外暴露60周期且不重叠。求转移次数与额外周期。把16个字段各放到独立64B Line，比较理想化转移成本与数据容量成本，并解释可能的反例。

D（10分）：证明初始X=Y=0，Core0执行Store X=1; Load Y，Core1执行Store Y=1; Load X时，SC不允许两个Load都读0，而允许Store Buffering的TSO可以。再区分ROB退休、取得M权限、该Store全局可见、脏Line最终写回DRAM四个事件。

<details><summary>可选提示（不泄露答案）</summary>

A将同一Line的授权视为互斥事务，失败请求必须排队/重试并处理旧消息；B按最慢ACK；C数跨核相邻写切换；D从SC全序约束构造有向环，再解释TSO的独立Store Buffer。

</details>

---

## 十一、作答与评分

请按以下格式回答：

~~~text
Lv1：（选择一个字母）
Lv2：（数值）
Lv3：（所有选中字母）
Lv4：
A：
B：
C：
D：
~~~

四题分别为15、20、25、40分，总分100。Lv1—Lv3依据JSON客观判分；Lv4按四部分Rubric分析，**不冒充完全自动评分**。≥80分按既定课号继续第31课；60—79分补一个同Line竞态或ACK算例；低于60分复习第24、29、30课后再练。补练不改变课程日期和编号。

延伸阅读：
- [gem5 MESI Two Level协议及瞬态](https://www.gem5.org/documentation/general_docs/ruby/MESI_Two_Level/)
- [gem5缓存状态机声明（含IM_AD、SM_A）](https://www.gem5.org/documentation/learning_gem5/part3/cache-declarations/)
- [gem5常用相干消息与ACK/NACK](https://www.gem5.org/documentation/general_docs/ruby/cache-coherence-protocols/)
