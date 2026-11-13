---
title: "第25课｜非阻塞Cache与MSHR：Memory-Level Parallelism如何隐藏Miss延迟？"
track: arch
number: 25
date: 2026-11-13
week: 4
minutes: 18
kind: full
summary: "理解Hit-under-Miss、Miss-under-Miss、MSHR合并与反压，利用Little定律推导MLP吞吐上界，分析指针依赖、ROB/LQ和内存带宽限制，区分AMAT、IPC及TSO。"
tags: [cache, non-blocking-cache, MSHR, MLP, hit-under-miss, miss-under-miss, little-law, ROB, load-queue, pointer-chasing, memory-bandwidth, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第25课
## 非阻塞Cache与MSHR：Memory-Level Parallelism如何隐藏Miss延迟？

**2026年11月13日｜第4周第4节｜预计18分钟**

第22课得到多级Cache的平均访存时间（AMAT），第23课讨论TLB和VIPT，第24课把Store Buffer与Dirty Writeback区分开来。今天研究另一半关键性能问题：**一条Load发生Cache Miss，需要等待100周期，CPU是否必须整整停住100周期？**

答案是：**不一定。一个能追踪多个未完成Miss的非阻塞Cache可以让独立访存重叠，但并发不等于缩短单个Miss本身的物理延迟。**

本课要完成四件事：读懂MSHR状态与请求合并；推导并发容量、延迟和带宽的关系；解释为何依赖性指针追逐无法被大量MSHR“神奇加速”；再把这些知识与ROB、LSQ、Store Buffer和TSO连接起来。

## 一、动机：8次Miss真的要等待800周期吗？（约2分钟）

假设下一级访存的往返延迟为100周期，有8条Load全部发生L1 Miss。

**情形A：串行依赖。**

~~~text
L0: p1 = LOAD [p0]
L1: p2 = LOAD [p1]
L2: p3 = LOAD [p2]
...
~~~

每次下一地址都必须等待前一次Load返回。若没有其他可用独立工作，8个Miss的关键路径约为：

\[
T_{\mathrm{serial}}\approx8\times100=800\ \text{cycles}.
\]

**情形B：地址独立。**

~~~text
L0: x0 = LOAD [A]
L1: x1 = LOAD [B]
...
L7: x7 = LOAD [H]
~~~

若8个不同Line的地址都已知、Cache允许8个未完成Miss、下级不拥塞且请求发出时间可以忽略，则这些Miss能够重叠，最后一个数据理论上约100周期后返回。

**这里的8倍是理想批次完成时间的对比，不是宣称单次DRAM延迟从100降成12.5周期。** 若每周期最多发一条请求，第8条只能在周期7发出，最终完成约在周期107；还有ROB、LQ、下级带宽等约束。

~~~mermaid
flowchart TD
  A["8条Load发生L1 Miss"] --> B{"后续地址依赖前一结果?"}
  B -->|是| C["单条依赖链：逐个等待"]
  B -->|否| D["独立请求可并发"]
  D --> E["MSHR记录多个未完成Line"]
  E --> F["下一级响应可以乱序返回"]
  F --> G["唤醒各自Load与消费者"]
  C --> H["关键路径约为延迟累加"]
  G --> I["关键路径可能接近最慢一次Miss"]
~~~

## 二、Blocking与Non-blocking Cache的准确区别（约2分钟）

**Blocking Cache：** 一个Miss尚未解决时，可能阻塞后续Cache访问。实现简单，但在外部访存延迟较高时会浪费本可进行的独立工作。

**Non-blocking Cache：** 通过MSHR等追踪资源，在某个Miss未完成期间继续服务符合条件的其他请求。常用两个术语：

- **Hit-under-Miss：** 较老Miss仍在等待时，另一条独立的Cache Hit可继续取得数据。
- **Miss-under-Miss：** 较老Miss尚未完成时，再发起另一条不同Line的Miss。

“非阻塞”不意味着永不阻塞。当MSHR已满、Load Queue耗尽、下级端口拥塞，或者请求之间存在数据依赖时，仍然必须等待。某些设计在部分资源满时甚至会反压其他原本可能命中的请求；这取决于结构组织。

[gem5官方Classic Cache文档](https://www.gem5.org/documentation/general_docs/memory_system/classic_caches/)说明，其经典Cache默认使用MSHR和独立Write Buffer支持非阻塞访问。注意：这里的**MSHR不是上一课已经提交Store的Store Buffer，也不是Write-back Buffer**。

## 三、MSHR究竟存什么？为什么能合并两个Load？（约3分钟）

MSHR（Miss Status Holding Register）通常跟踪一个**尚未完成的Cache Block/Line请求**。教学用一个条目表示：

| 字段 | 用途 |
|---|---|
| Block address / Line tag | 标识等待中的物理Cache Line |
| Request state | 是否已向下一级发送、等待哪种响应 |
| Target list | 哪些Load/消费者正在等待该Line |
| Transaction / coherence state | 关联下级请求、权限与协议状态 |
| Completion handling | 数据返回时填入Cache、唤醒相应消费者并释放资源 |

假设两条Load分别访问物理地址0x1048和0x1058，Line大小64B。

\[
\operatorname{block}(a)=\lfloor a/64\rfloor .
\]

两个地址落在同一条0x1040—0x107F的Line里。若第一次Load的Miss仍未完成，第二条可能附加到现有MSHR的Target List，共用一次下级Line填充请求。

~~~text
MSHR #0：Line 0x1040
  ├── Target: LOAD [0x1048]
  └── Target: LOAD [0x1058]

MSHR #1：Line 0x2080
  └── Target: LOAD [0x2088]
~~~

这里有**3条Load指令、2条不同Line的未完成Miss、占用2个MSHR**。合并并不表示所有消费者同一时刻都能使用数据：不同字节、执行依赖、协议权限和目标列表上限还会影响实际唤醒行为。

必须区分三个计数：

\[
\boxed{
N_{\mathrm{Load}}\ne N_{\mathrm{unique\ Line\ fetch}}
\ne N_{\mathrm{MSHR\ allocated\ at\ a\ moment}}
}
\]

更细的gem5实现包括Target/Deferred Target等队列，不是任意两个同Line请求都能无条件合并，例如写权限、无效化和目标容量可能使部分请求延期。源码参考：[gem5 MSHR实现](https://gem5.googlesource.com/public/gem5/+/fd7bfca33b1d2fd9dba1c45ee923f1b731f2d9b3/src/mem/cache/mshr.hh)。

## 四、完整周期Trace：MSHR满时发生什么？（约2分钟）

设教学Cache有2个MSHR，Line Miss服务延迟6周期；响应在分配后的第6周期开始可用，当周期就可复用条目。Load地址均独立，合并目标无限制，不考虑其他延迟。

| 周期 | 到达请求 | 动作 | 未完成MSHR |
|---|---|---|---|
| 0 | A | A Miss，分配#0 | A |
| 1 | B | B Miss，分配#1 | A,B |
| 2 | A同Line | 合并到A的Target List | A,B |
| 3 | C（新Line） | 两个MSHR已满，C等待 | A,B |
| 6 | A返回 | 释放A；C可以发出并占用空位 | B,C |
| 7 | B返回 | 释放B | C |
| 12 | C返回 | 释放C | 空 |

从这个Trace可得到三个结论。

**第一，合并不必新增MSHR。** A的第二个请求不产生新的不同Line下级读取。

**第二，MSHR Full是硬件反压，不意味着Cache完全停止做一切有用工作。** 其他独立Hit是否能继续进行取决于Cache内部仲裁与端口设计。

**第三，新增MSHR可能提高并发，但不能直接改变每个请求的6周期服务时间。**

## 五、利用Little定律推导MLP的吞吐上界（约3分钟）

上面讨论了一批Load的完成时间。现在讨论**长期稳态**：每周期最多能完成多少条不同Line的Miss？

设：

- \(K\)：可同时使用的MSHR条目数；
- \(L\)：每个不同Line Miss占用MSHR的平均周期；
- \(\lambda\)：长期平均完成的不同Line Miss数量（Line/cycle）；
- \(\overline N\)：MSHR中平均在途的不同Line Miss数量。

Little定律给出：

\[
\boxed{\overline N=\lambda L}.
\]

因为MSHR资源最多有K项：

\[
\overline N\le K,
\]

于是：

\[
\boxed{\lambda\le\frac{K}{L}}.
\]

注意：这不是单次访存延迟公式，而是由**在途容量和平均占用时间**推导的吞吐上界。

再设：

- \(r_{\mathrm{issue}}\)：前端/执行系统每周期最多提供多少个不同Line Miss；
- \(r_{\mathrm{mem}}\)：下层每周期最多完成多少个Line Miss；
- \(B\)：每条Line的字节数。

得到教学型稳态约束：

\[
\boxed{
\lambda_{\max}\le
\min\left(
r_{\mathrm{issue}},
\frac{K}{L},
r_{\mathrm{mem}}
\right)
},\qquad
\boxed{BW_{\max}\le B\lambda_{\max}}.
\]

只有当三个约束之外没有其他瓶颈、请求足够独立且系统接近理想工作状态时，才可把这些上界当作可达到的预测。

### 数值例题

假设 \(K=12\)、\(L=120\)周期、\(r_{\mathrm{issue}}=0.25\)Line/cycle、\(r_{\mathrm{mem}}=0.20\)Line/cycle，每Line为64B。

\[
K/L=12/120=0.10\ \text{Line/cycle}.
\]

所以：

\[
\lambda_{\max}\le0.10,\qquad
BW_{\max}\le64\times0.10=6.4\ \text{B/cycle}.
\]

即使内存接口允许0.20 Line/cycle，MSHR仍只能维持0.10 Line/cycle。要在同样的平均延迟120周期下达到0.20 Line/cycle，至少需要：

\[
K\ge0.20\times120=24
\]

条同时在途的不同Line Miss。

但**这24条请求必须真的能够被应用、Load Queue和ROB暴露出来**，不能只增加硬件条目就认为一定达到理论带宽。

### 交互式思考：相同延迟下增加MSHR的意义

下表固定 \(L=100\)周期、每Line为64B，只变化MSHR数；忽略其他限制。

| MSHR数量K | 理想完成率上界(Line/cycle) | 有用Line流量上界(B/cycle) |
|---|---|---|
| 2 | 0.02 | 1.28 |
| 4 | 0.04 | 2.56 |
| 8 | 0.08 | 5.12 |
| 16 | 0.16 | 10.24 |

这张表的意义不是“Miss延迟降低”，而是**更多同时在途请求让单位时间内可能完成的独立访存增多**。如果下级带宽上限只有8B/cycle，最后一行也会被限制到至多8B/cycle。

## 六、为什么有16个MSHR，程序却只用了两个？（约2分钟）

设程序同时只有两条互相独立的指针追逐链：

~~~text
链A：p0 → LOAD [p0] → p1 → LOAD [p1] → p2 → ...
链B：q0 → LOAD [q0] → q1 → LOAD [q1] → q2 → ...
~~~

每条链的下一地址需要上一次结果才能确定。所以**每条链通常只能暴露一个未完成的下一Line请求**。

设单次Miss平均100周期，那么程序依赖自身允许的在途数最多约2：

\[
K_{\mathrm{effective}}\le2.
\]

即使L1有16个MSHR：

\[
\lambda\le\frac{2}{100}=0.02\ \text{Line/cycle}
\]

才是此简化工作负载更紧的上界。

更多MSHR不会凭空创造未知的下一地址。这解释了为什么连续随机指针追逐往往更接近**延迟受限**，而结构化的多条独立数组流可以提高MLP。

还需要考虑ROB、Load Queue（LQ）、Issue带宽和TLB/Page Walk等条件：

\[
\boxed{
K_{\mathrm{effective}}
\le\min(K_{\mathrm{MSHR}},K_{\mathrm{LQ}},K_{\mathrm{ROB}},K_{\mathrm{independence}},\ldots)
}.
\]

其中 \(K_{\mathrm{ROB}}\) 不是简单等于ROB总条目数：一条未完成Load前后还可能占用若干其他指令，且ROB头部较老Miss可能阻塞按序退休，使窗口逐渐填满。

### 一个有用的反例

原程序只暴露2个独立Miss；硬件从8个MSHR升级到16个，**IPC可能没有明显改善**。瓶颈是程序依赖而不是MSHR容量。反过来，具有32条独立流的程序可能显著受限于8个MSHR；但在带宽已经饱和后继续增加MSHR，也可能几乎没有收益。

## 七、AMAT、单次延迟、CPI和带宽到底有什么关系？（约2分钟）

第22课推导：

\[
AMAT=H_1+m_1P_1.
\]

它描述平均一次Cache访问的服务延迟，而不能直接当作每条退休指令的额外停顿。

如果一条Load Miss持续100周期，处理器可能在这段时间里：

1. 执行独立ALU或分支；
2. 发出更多独立Load Miss；
3. 让较年轻操作完成、暂时等待ROB按序退休；
4. 在Load Queue/MSHR/ROB满后才真正停顿。

因此不能直接使用：

\[
\Delta CPI=(\mathrm{Misses/inst})\times100
\]

来估算真实OoO CPU的性能，除非明确假设所有100周期惩罚完全暴露且互不重叠。

更稳妥的实验应报告**固定工作量下的运行周期、IPC、不同Line Miss完成率、MSHR满周期、ROB/LQ占用与数据依赖关键路径**。MSHR条目数、单次Miss延迟、数据带宽和真实暴露给退休路径的停顿，要分别衡量。

## 八、把上一课的Write Buffer与本课MSHR分清（约1分钟）

二者追踪的对象不同。

| 结构 | 通常追踪 | 满时可能引起 |
|---|---|---|
| MSHR | 未完成的Cache Line Miss与等待消费者 | 新独立Miss无法分配、Load侧反压 |
| Writeback Buffer | Dirty逐出/回写等下层写请求 | 后续脏逐出或写回被阻塞 |
| Store Buffer | 已提交或待传播的Store（依实现） | Store提交/后续操作受到反压 |
| ROB / LQ | 程序顺序、Load在途状态 | 无法继续分配/退休和发现新MLP |

在某些实现中，MSHR与Write Buffer的满状态都可迫使Cache反压；gem5官方文档就明确分别提供这些结构。[gem5 Cache组件说明](https://www.gem5.org/documentation/general_docs/memory_system/gem5_memory_system/)。

### 与TSO Store Buffering的联系

初始 \(X=Y=0\)：

~~~text
Core 0                Core 1
STORE X=1             STORE Y=1
r0=LOAD Y             r1=LOAD X
~~~

TSO允许先将各自Store留在写缓冲，再让不同地址的Load观察到旧值，从而可能得到 \((r0,r1)=(0,0)\)。这描述的是**架构允许的跨核内存观察顺序**。

增加MSHR使更多Cache Miss能够重叠，不会自动改变TSO的Store→Load排序规则，也不能把“Store已从ROB退休”改写成“它已经立即对其他核心全局可见”。

\[
\boxed{
\text{MLP吞吐能力}\ne\text{内存模型的顺序保证}
}
\]

## 九、知识边界、反例与下一讲（约1分钟）

**错误一：MSHR翻倍就把DRAM延迟减半。** 它提高可跟踪并发数，不直接缩短一次请求的固有服务时间。

**错误二：两条Load Miss就占两个MSHR。** 同Line可合并；同时也可能受Target数、权限或协议状态限制而无法立即合并。

**错误三：拥有16个MSHR就有16条独立Miss。** 程序依赖、ROB/LQ、地址翻译、请求供应和下级带宽可能更紧。

**错误四：Cache非阻塞意味着永远不会阻塞。** MSHR满、Writeback Buffer满、队列满或依赖链都可能阻塞进展。

**错误五：访存并发改变TSO合法结果。** MLP与Store Buffering属于不同的体系结构层面。

最重要的核心公式：

\[
\boxed{\overline N=\lambda L},\qquad
\boxed{\lambda_{\max}\le\min(r_{\mathrm{issue}},K/L,r_{\mathrm{mem}})}.
\]

**下一讲：第26课（2026年11月14日）——《硬件预取：Stride/Stream预取器、准确率、覆盖率与污染》**。届时研究如何提前预测未来访问，为什么预取可能降低Miss数却增加带宽争用，以及预取请求如何同需求Miss竞争MSHR。

**参考资料：** [gem5 Classic Caches](https://www.gem5.org/documentation/general_docs/memory_system/classic_caches/)；[gem5 MSHR实现](https://gem5.googlesource.com/public/gem5/+/fd7bfca33b1d2fd9dba1c45ee923f1b731f2d9b3/src/mem/cache/mshr.hh)；[gem5内存系统说明](https://www.gem5.org/documentation/general_docs/memory_system/gem5_memory_system/)。

---

## 十、四级分级测评（总分100分）

**课堂首次发送不公布标准答案、解析或参考推导。** Lv1—Lv3为可客观判分题；Lv4按分项Rubric人工或自评。四题分值依次为15、20、25、40分。

### Lv1｜阻塞与非阻塞Cache的区别（15分，单选，预计2分钟）

一条Load在L1发生未命中，尚未返回。关于非阻塞Cache，哪项陈述最严谨？

**A.** 非阻塞Cache保证任何随后的Load都能立刻完成，即使它依赖未命中的返回值。

**B.** 非阻塞Cache可以在资源允许时继续处理独立Hit，甚至并发追踪其他不同Cache Line的Miss，但仍受MSHR、队列和依赖约束。

**C.** 只要MSHR数量达到16，所有程序的访存延迟都会减少到原来的1/16。

**D.** 非阻塞Cache会让Store从ROB退休的瞬间就同时对所有其他核可见。

<details><summary>可选提示（不泄露答案）</summary>
区分“允许其他操作继续”和“保证任何操作都完成”；有依赖和容量两类限制。
</details>

### Lv2｜MSHR容量与稳态带宽上界（20分，数值，预计4分钟）

一台教学CPU的L1有10个MSHR，每个不同Cache Line的Miss从分配到释放恰好占用80周期，每行64B；CPU最多产生0.30条不同Line Miss/周期，下级最多完成0.20条Line/周期。假设长期稳态、所有Miss彼此独立、无合并、无其他限制。问有用数据的最大稳态带宽是多少B/周期？只填写数值。

<details><summary>可选提示（不泄露答案）</summary>
先由Little定律求MSHR最多支持多少条Line/周期，再和请求供给、下级服务上限取最小值，最后乘64B。
</details>

### Lv3｜合并、依赖链和容量边界（25分，多选，预计5分钟）

针对本课普通可缓存的教学模型，选择所有正确说法。

**A.** 一个不同Line的未完成Miss通常需要占用一个MSHR或等价跟踪资源；无空位时新的独立Miss可能被反压。

**B.** 两个Load访问同一条正在填充的Cache Line，必然需要两个下级Line读取请求和两个独立MSHR。

**C.** 如果应用只有两条严格串行的指针追逐链，即使L1有16个MSHR，仅靠这些链通常也无法同时产生16个不同Line的未完成Miss。

**D.** 增加MSHR数量必然线性降低每次DRAM访问的物理往返延迟，不需要考虑带宽与依赖。

**E.** Hit-under-Miss意味着在资源和依赖允许时，另一条独立的L1 Hit可以在较早Miss未完成时被服务。

**F.** TSO允许Store Buffering的(0,0)结果，说明CPU不能同时追踪多个缓存未命中。

<details><summary>可选提示（不泄露答案）</summary>
区分“Load指令数”和“不同Line的未完成下游请求数”；也要区分可用MSHR数与程序能暴露的独立访存数。
</details>

### Lv4｜MLP容量、指针依赖与MSHR时序联合设计（40分，开放推导，预计10—12分钟）

统一教学模型：L1每条Line为64B；每个不同Line Miss从分配到释放占用L=96周期；MSHR容量K=12；处理器最多发出0.25个不同Line Miss/周期；下级服务上限0.20 Line/周期，忽略启动/排空边界、额外带宽竞争和预取。A（12分）：推导长期稳态不同Line的最大Miss完成率（Line/cycle）和相应带宽（B/cycle），并给出处理9600条不同Line Miss所需周期的理想下界。B（10分）：现在程序只有3条独立指针追逐链，每条链的下一地址必须等上一Miss返回才知道；求仅由依赖限制导致的最大在途不同Line数量、完成率上界及带宽上界，解释为何增至24个MSHR未必提高这些数值。C（10分）：另一个完全独立的微型Trace采用K=2、L=10周期，响应恰好在分配后第10周期到达，且完成的MSHR在该周期可以立即复用；t=0请求A，t=1请求B，t=2再次请求A（可合并、目标容量足够），t=3请求C（若无空位则等待并在最早可用周期发出）。按周期写出MSHR占用、合并与阻塞事件，以及C的发出和完成周期。D（8分）：提出验证MLP真正提高了端到端性能的实验：至少区分Load指令数、不同Line下游请求、合并数、MSHR满停顿、ROB/Load Queue限制与IPC；并解释为什么非阻塞Cache不改变TSO Store Buffering的架构允许结果。

<details><summary>可选提示（不泄露答案）</summary>
A使用平均在途量=完成率×服务时间；B每条严格依赖链只能贡献一个未知后继；C同Line请求先查MSHR匹配，空位在响应周期释放；D不要把单次延迟或AMAT直接当成CPI。
</details>

## 十一、作答与评分

~~~text
Lv1：
Lv2：（数值，单位B/cycle）
Lv3：（所有选中字母）
Lv4：
A：
B：
C：
D：
~~~

总分≥80分：进入日历既定的下一课；60—79分：补一个针对性的MSHR/MLP Trace；低于60分：先复习Little定律、程序依赖、ROB与LSQ并针对薄弱点再练。**任何补练都不改变既定课程编号或日期。**
