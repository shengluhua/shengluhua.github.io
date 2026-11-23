---
title: "第35课｜相干、内存模型与NUMA综合复盘：从MESI所有权到跨核可见性和页面放置"
track: arch
number: 35
date: 2026-11-23
week: 5
minutes: 18
kind: full
summary: "第5周复盘：统一MESI状态及瞬态、SC与TSO的Store Buffering证明、LB/MP/IRIW、Release-Acquire、NUMA first-touch与性能上界；用综合案例区分正确性、可见性与性能。"
tags: [coherence, MESI, transient-state, SC, TSO, store-buffer, fence, IRIW, MCA, NUMA, first-touch, review]
diagram: mermaid
---

# 计算机体系结构 · 第35课
## 第5周综合复盘：相干、内存模型与NUMA的统一推理

**2026年11月23日｜第5周第7节（复盘）｜约18分钟（测评另计）**

前六节（第29—34课）分别讨论MESI所有权、协议瞬态、SC/TSO、弱内存模型、IRIW/MCA和NUMA。今天不引入第6周的新知识，而要完成一次跨层整合：**一个多核访问为何有时读旧值、有时变慢、有时必须等待Invalidate ACK？** 这三种现象的因果机制并不相同。

## 一、动机：同样的代码，三个完全不同的问题（2分钟）

两Socket机器，Core 0在Node 0，Core 1在Node 1；双方共享变量，Cache Line为64B。看到下面三个现象时，别急着都归因于“Cache没有同步”：

1. 两个不同地址的Store尚未传播，各核后继Load读到旧值：可能是**内存模型允许的观察**。
2. 一个核正在把共享Line从S升级到M，却等待对方Invalidate ACK：这是**相干协议的写所有权协调**。
3. Node 1线程的数组页面实际位于Node 0，导致访存更慢：这是**NUMA物理放置和互连成本**。

~~~mermaid
flowchart TD
    P["程序：Load / Store / 同步"] --> ISA["ISA与语言内存模型<br/>哪些观察结果允许？"]
    P --> ROB["OoO、ROB、Store Buffer<br/>何时退休、转发、传播？"]
    ROB --> COH["MESI / Directory<br/>谁拥有有效副本和写权限？"]
    COH --> PHY["NUMA物理位置与互连<br/>访问耗时、占用多少带宽？"]
    ISA -.约束.-> ROB
    ISA -.约束.-> COH
~~~

**课程主线：先证明正确性，再定位性能瓶颈；切勿用性能测量反推架构合法性。**

## 二、第29—30课回顾：MESI、瞬态与ACK（3分钟）

MESI四个稳定状态：

| 状态 | 数据与权限 | 本地Store |
|---|---|---|
| M (Modified) | 唯一有效、已修改，内存下层可能旧 | 可直接写 |
| E (Exclusive) | 唯一有效、干净 | 可E→M |
| S (Shared) | 有效、干净，可能有其他共享者 | 必须先获得独占写权限 |
| I (Invalid) | 本核没有有效副本 | 必须获取数据与权限 |

单写者/多读者（SWMR）不变量：对同一Line，任何时刻不能同时存在两个未经协调的独占写者。对普通MESI，(S,S)可以，(M,S)不可以。

典型顺序：初始(I,I)；C0读得(E,I)；C1读得(S,S)；C0写前发送升级，令C1的S失效，完成后得(M,I)；C1再读应通过相干路径获得最新数据，而**不需要等待脏Line最终写回DRAM**。

但是S→M并非一个原子瞬间：请求发出后，直到必要ACK与数据/授权条件满足前，可处于SM等**瞬态**。在严格确认式目录模型中，若三个Sharer的Invalidate ACK往返分别为5、8、13周期，它们并行处理，升级关键路径由最慢ACK决定，不是三者相加。

\[
T_{\rm up}=T_{\rm request}+\max_j T_{{\rm ACK},j}+T_{\rm grant}
\]

这是分阶段、非重叠的教学延迟模型。真实实现可能使用不同ACK路由、协议瞬态及消息合并。

**Safety**：不能双重授权，也不能丢失最新数据；**Liveness**：待处理请求不能永久卡在瞬态。仅有四状态稳态图无法证明后者。

## 三、第31课回顾：SC与TSO的真正区别（3分钟）

经典Store Buffering（SB）：

~~~text
初始 X=Y=0，X/Y是不同物理地址

Core 0                    Core 1
Sx: STORE X=1             Sy: STORE Y=1
Ly: r0=LOAD Y             Lx: r1=LOAD X
~~~

若两个Load均读到0，顺序一致性SC要求同时满足本核程序顺序及读旧值要求：

\[
S_X\prec L_Y,\quad S_Y\prec L_X,\quad L_Y\prec S_Y,\quad L_X\prec S_X
\]

合起来：

\[
\boxed{S_X\prec L_Y\prec S_Y\prec L_X\prec S_X}
\]

形成严格环，SC**禁止**(0,0)。

TSO中每核Store可以先在FIFO Store Buffer里，后继**不同地址**Load可以在该Store传播前读取；因此SB的(0,0)**允许**。本核同址Load还可Store-to-Load Forwarding，不能把“能跨过前序Store”理解为随意读取同址旧值。

**单侧完整Fence为什么不够？** 如果仅Core 0在Store与Load之间插入Store→Load完整Fence，Core 1仍可能延迟自己的Store传播。可构造跨核可见顺序：

\[
L_X\prec S_X\prec L_Y\prec S_Y
\]

而Core 1的Store指令先于Load进入本核缓冲，不违背TSO。若两侧都放置适当完整Fence，两个Store→Load保序约束重新构成上述不可能环，(0,0)被禁止。

别混淆：**Store从ROB退休 ≠ 某次写全局可见 ≠ Dirty Line写回DRAM**；获得M写权限也不证明Store Buffer中任意一条Store已经传播。

## 四、第32—33课回顾：LB、MP、IRIW和同步（3分钟）

### LB与Message Passing

Load Buffering（LB）是两个核分别先Load后Store。在SC或x86-TSO中，两个Load都读到对方后续Store写的新值会构成顺序环，因此被禁止；在某些允许独立Load→Store放松的弱模型中可能允许。不能将常数写入的LB与“无来源凭空创造值”混为一谈。

Message Passing（MP）：Writer先写data，再发布flag；Reader先看到flag，再读data。**C++的Release/Acquire只有当Acquire Load读到了相应Release Store（或其release sequence中适用的值）时，才能建立相应同步关系。** 普通C++非原子数据若发生未经同步的冲突访问，可能有数据竞争和未定义行为。内存屏障也不是把每次写强迫同步到DRAM。

### IRIW：为什么要同时检查MCA和读序？

~~~text
Writer 0: X=1             Writer 1: Y=1
Reader A: a=LOAD X        Reader B: c=LOAD Y
          b=LOAD Y                  d=LOAD X
关注 a=1,b=0,c=1,d=0
~~~

在**多副本原子性（MCA）且两个读者各自Load→Load保序**的前提下，两个观察者反序看见写入要求：

\[
W_X\prec R_{AX}\prec R_{AY}\prec W_Y\prec R_{BY}\prec R_{BX}\prec W_X
\]

又是不可成立的环。但仅有MCA，而无读者Load→Load保序，不能直接复用这个证明。

现代Armv8-A的普通相干内存为other-MCA；RISC-V RVWMO是MCA，但独立Load仍需要检查保序条件。在适当作用域中，Arm DMB ISHLD、RISC-V FENCE R,R可提供相应读侧顺序。注意RISC-V FENCE.TSO**不等同于**提供普通Store→Load边的完整FENCE RW,RW。

| 概念 | 核心保证 | 不自动保证 |
|---|---|---|
| Coherence | 同一地址/Line的数据版本正确 | 所有不同地址的SC顺序 |
| MCA | 写入对其他观察者有一致的逻辑可见性 | 普通独立Load自然保序 |
| Fence / Acquire / Release | 特定访问类型及同步关系的排序 | 立即写回DRAM |
| NUMA | 物理位置和性能成本 | 更改ISA允许的读值结果 |

## 五、第34课回顾：First-touch、迁移与NUMA（3分钟）

双Socket中，线程的执行节点与其数据页节点是两个独立选择。普通匿名内存的malloc通常只预留虚拟地址，实际物理页倾向于在第一次写入触发缺页时按有效mempolicy分配。主线程在Node 0先初始化，Worker后来迁到Node 1，**已有物理页不会仅因绑核而自动迁移**。

对N次完全串行、无法被计算或MLP隐藏的DRAM读Miss，远程比例p，本地延迟\(L_l\)，远程延迟\(L_r\)，可以写：

\[
\boxed{T_{\rm memory}=N[(1-p)L_l+pL_r]}
\]

例：1000次串行DRAM Miss，20%远程，本地90ns、远程170ns：

\[
T=1000(0.8\times90+0.2\times170)=106\ \mu s
\]

如果Miss能重叠，这个和式就不等于墙钟时间。若最多有K个在途Line Miss、Line大小B、平均占用L，还有链路与下级带宽上限：

\[
\boxed{BW\le\min(KB/L,\ BW_{\rm link},\ BW_{\rm DRAM},\ r_{\rm issue}B)}
\]

一次页面迁移成本\(C_{\rm mig}\)，未来R次真正从远程变为本地且不可重叠的访问，每次节省\(\Delta L=L_r-L_l\)，严格值得迁移须满足：

\[
\boxed{R\Delta L>C_{\rm mig}}
\]

这个模型忽略迁移导致的新共享者、缓存污染、TLB影响及动态负载变化；频繁跨核共享的页面可能在两个节点之间来回迁移。

参阅：[Linux NUMA Memory Policy](https://www.kernel.org/doc/html/latest/admin-guide/mm/numa_memory_policy.html)、[RISC-V RVWMO文档](https://docs.riscv.org/reference/isa/v20260120/unpriv/mm-eplan.html)、[C++ memory_order](https://en.cppreference.com/w/cpp/atomic/memory_order)。

## 六、跨层诊断：同样是“程序慢”，你应看什么？（2分钟）

~~~mermaid
flowchart TD
  A["两核应用变慢或观察到旧值"] --> B{"问题是合法读值还是时间增长？"}
  B -->|"合法读值"| C["先明确ISA/语言模型与Litmus"]
  C --> D["SC/TSO/弱模型 + rf/co/po + Fence"]
  B -->|"时间增长"| E{"热点是同一Cache Line？"}
  E -->|"是"| F["看S→M交接、INV/ACK、HITM和False Sharing"]
  E -->|"否或不确定"| G["检查CPU亲和、numa_maps、远程DRAM"]
  G --> H["检查MSHR、带宽、端到端时间"]
~~~

实验应控制输入工作量、编译选项、线程绑核、物理页first-touch与NUMA策略。分开记录Invalidate/HITM、远程DRAM请求、Store Buffer与Fence相关Stall、LLC Miss、IPC、端到端时间及尾延迟。**LLC Miss ≠ Remote DRAM Miss；协议正确 ≠ 性能必然快。**

### 四个典型反例

- Cache已经相干，TSO仍可允许经典SB的(0,0)。
- 数据Line处于M，但DRAM尚未回写；对方仍可经相干路径读取最新值。
- 更激进的远程预取可能降低Demand Miss，却因抢占MSHR和链路带宽使运行时间增加。
- 将共享热点页迁移到某一Node，可能提升一组线程局部性，却损害另一个Node上的读写线程。

## 七、本周总结与下一讲（约1分钟）

复盘后应能够独立回答：

**MESI解决“哪份数据有效、谁能写”；内存模型解决“哪些跨核观察合法”；NUMA解决“访问哪份物理数据需要多少代价”。**

\[
\boxed{\text{Coherence}\ne\text{Consistency}\ne\text{NUMA Performance}}
\]

下一讲为**第36课（2026年11月24日，第6周第1节）《DRAM内部结构：Bank、Row Buffer、ACT/PRE与行命中》**。我们将从远程/本地DRAM的“延迟常数”进一步走入存储阵列内部，解释为何连续访问与随机访问在同一DRAM上也会有不同延迟。

---

# 八、四级分级测评（总分100分）

首次发放只给题面和不泄露答案的提示。前三题客观判分，第四题按分项Rubric审阅评分；不得将开放题显示成自动准确评分。

### Lv1｜MESI、TSO与NUMA三层辨析（15分｜预计2分钟）

双Socket处理器采用相干Cache，Core0持有X的Modified副本但DRAM尚为旧值；另一核可能读取X，另有两个不同地址上的TSO Store Buffering测试。以下哪一项同时正确地解释相干、内存模型与NUMA？
A. 只要有MESI，所有跨地址的Load/Store观察都必须符合SC，NUMA远程访问不影响时间。

B. 修改后的Line可以经相干路径交付最新值而不等DRAM回写；TSO仍可允许SB的(0,0)；NUMA主要改变访问代价而不改变该合法性。

C. Core0持有M说明其所有已退休Store立即对任何核全局可见，也说明Dirty Line已经回写DRAM。

D. 把Core1绑到Node1会自动移动以前在Node0分配的所有页面，因此无需查看页面实际位置。

<details><summary>可选提示（不含答案）</summary>

分别问：最新数据在哪、跨地址读写顺序由谁定义、CPU绑核与页面分配是否同步变化。

</details>

### Lv2｜NUMA延迟与所有权转移联合计算（20分｜预计4分钟）

一个固定工作负载有2400次彼此完全串行的DRAM读Miss，其中25%是远程；本地每次80ns、远程每次160ns。另外有50次写所有权跨核交接，每次额外暴露24ns。假定这些等待与彼此及计算完全不重叠，不计其他成本。求这两类等待的总时间，单位μs。

<details><summary>可选提示（不含答案）</summary>

先对本地与远程读Miss加权，再加50次独立交接成本；最后把ns换成μs。

</details>

### Lv3｜协议确认、Fence、IRIW与页面放置的边界（25分｜预计5分钟）

针对普通相干缓存、题中明确的x86-TSO/现代MCA内存模型，以及默认Linux NUMA行为，选择所有正确的陈述（多选）。
A. 在严格ACK确认式目录MESI模型中，C0已有S副本并发出升级请求，也必须满足必要的失效确认和授权条件才能合法写入。

B. 只要不同核的Cache都符合MESI，经典Store Buffering的(0,0)就在TSO下被禁止。

C. 仅Core0在经典SB的Store与Load之间放置适当完整Fence，仍可能出现两个Load均为0。

D. 若写满足MCA，且IRIW两个读者均保留各自Load→Load顺序，反序观察两个新写入会产生不可满足的顺序环。

E. 仅设置numactl --cpunodebind=1，就必然把应用之前分配在Node0的所有页迁移到Node1。

F. 某Line的最新值只在一个核的Modified Cache副本中而尚未写回DRAM，其他核仍可能通过相干协议取得新值。

G. C++的acquire Load即使读取旧flag，也一定与另一个线程未来的release Store建立synchronizes-with。

<details><summary>可选提示（不含答案）</summary>

独立检查写权限授权、Store→Load放松、IRIW所需的读序边、页面是否已经分配，以及Release/Acquire读自关系。

</details>

### Lv4｜相干状态、跨核Litmus与NUMA收益综合设计（40分｜预计10—12分钟）

统一假设：双Socket、两核C0/C1，各有私有相干L1，普通64B Cache Line，X/Y是不同物理Line。题中所有MESI事务逐步完整结束，采用ACK确认式教学协议；没有其他写者。请分别完成A—D。

A（10分，MESI）：初始X=0、(C0,C1)=(I,I)。依次执行C0读X、C1读X、C1写X=5、C0读X。逐步写出每次完成后的两核MESI状态及Load值，说明写升级为何需Invalidate ACK、最后一次读是否必须等待DRAM写回。

B（12分，内存模型）：初始X=Y=0。经典SB：C0执行Store X=1；完整Fence；r0=Load Y，C1执行Store Y=1；r1=Load X。判断(0,0)在TSO下是否可能，构造一条合法的跨核可见顺序；再在C1的Store和Load之间加同类完整Fence，证明(0,0)是否仍可能。区分Store从ROB退休与跨核可见。

C（12分，NUMA）：Node1上的线程执行6000次完全串行的DRAM Miss，30%是远程，Local=100ns、Remote=180ns。求当前访存总时间（μs）；若通过正确first-touch使所有访问本地，求新时间与加速比。若另一个热点页迁移一次成本15μs，每次未来不可重叠的远程访问变成本地节省80ns，求至少多少次未来访问才能严格划算，指出共享访问的反例。

D（6分，验证）：设计区分“相干争用”“NUMA远程访问”“内存模型合法结果”的实验；列出至少四项数据/控制，并解释不能以一次LLC Miss推断Remote DRAM、或以有限运行中未出现某Litmus结果证明其架构禁止。

<details><summary>可选提示（不含答案）</summary>

A逐步记录有效副本与写者；B把单侧Fence后未Fence核的Store留在Buffer构造顺序，双侧则尝试画环；C用加权串行延迟和严格不等式；D把模型证明与PMU/完成时间测量分开。

</details>

**评分规则：** 80分及以上进入既定第36课；60—79分补一例薄弱环节；低于60分先重点复习对应第29—34课再练。无论成绩，课程日期和编号不变。
