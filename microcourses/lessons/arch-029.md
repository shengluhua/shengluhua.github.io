---
title: "第29课｜MESI协议与缓存行所有权：Invalidation、共享读与写权限转移"
track: arch
number: 29
date: 2026-11-17
week: 5
minutes: 18
kind: full
summary: "从四种MESI稳定状态出发推导共享读、所有权升级、Modified转发与False Sharing；严格区分缓存一致性、Store Buffer全局可见性和SC/TSO内存模型。"
tags: [cache-coherence, MESI, invalidation, ownership, false-sharing, store-buffer, TSO, memory-consistency]
diagram: mermaid
---

# 计算机体系结构 · 第29课
## MESI协议与缓存行所有权：Invalidation、共享读与写权限转移

**2026年11月17日｜第5周第1节｜预计18分钟（讲解与课后测评分开）**

第4周已经学过Write-back、Dirty、Store Buffer、MSHR和Cache污染。从今天开始进入第5周：**缓存一致性（Coherence）、内存模型（Consistency）与NUMA**。本课只专注一个问题：两个核各有L1，如何保证对同一条物理Cache Line的读写不会让其中一个核悄悄读到被淘汰的旧副本？

本课结束后需要能够：画出MESI状态迁移、手算两核Trace、解释False Sharing，并证明为什么**MESI并不自动意味着SC**。

## 一、问题从哪里来？两个L1为何可能同时缓存X（约2分钟）

设共享地址X初始为0，Core 0和Core 1都有私有L1。二者都读取X，两个L1就可能各自保存一份副本。如果随后Core 0执行X=1，Core 1不能无限期地拿自己的旧副本0当作新鲜值使用。

~~~mermaid
flowchart LR
    C0["Core 0"] --> L0["L1_0: X的副本"]
    C1["Core 1"] --> L1["L1_1: X的副本"]
    L0 <-->|"相干消息 / 数据"| COH["Snoop或Directory"]
    L1 <-->|"相干消息 / 数据"| COH
    COH <--> MEM["共享下级Cache / 内存"]
~~~

最简单的思路是Write-update：某核修改X后通知其他副本更新。但常见的**写失效（Write-invalidate）**机制选择另一个办法：写入者获得这条Line的独占写权限，让其他核的旧副本变为Invalid，后续其他核再读时重新获取正确版本。

为何以**Cache Line**为单位而不是以C语言变量为单位？硬件Cache中的相干标记和所有权通常跟随整个Line。例如64B Line里有两个独立8B计数器，写任意一个都可能需要该整行的写所有权。这是后面False Sharing的根源。

## 二、符号、假设与两个关键不变量（约2分钟）

本课构造**两核、64B Line、Write-back、写失效、无自发替换**的教学MESI机器：每个核对指定物理Line X持有一个稳定状态M/E/S/I；相干事务在表格每一行结束时已经完成，暂不画总线竞争及暂态。若要精确模拟真实微架构，还需瞬态状态、请求队列、目录/总线仲裁、确认与重试。**表格中的“W完成”指写操作真正获得相干写权限并更新缓存，不等于仅仅从ROB退休。**

| 状态 | 含义 | 本地读 | 本地写 |
|---|---|---|---|
| **M — Modified** | 唯一可用副本，数据已修改，较旧下层副本可能过时 | Hit | 可继续写 |
| **E — Exclusive** | 唯一可用副本，干净 | Hit | 本地E→M，不必向其他核失效 |
| **S — Shared** | 一份干净、可读的副本，其他缓存可能也持有 | Hit | 先获得独占所有权，其他副本失效 |
| **I — Invalid** | 本级没有可用副本 | 必须获取 | 必须获取写所有权 |

MESI的核心不是记住四个名字，而是两个不变量：

**单写者/多读者（Single Writer or Multiple Readers, SWMR）**：如果某核持有可写的M/E权限，那么其他核不能同时持有该行的有效共享副本；若多个核同时持有有效副本，则应处于允许共享读取的状态，而没有核在无协调情况下单独写入。

**最新值不丢失（Data Value / Write Serialization）**：一个Line可以按协议建立相干的写入顺序，后续合法获取该Line的读者必须得到与其相干顺序相符的版本，不能在另一个缓存持有更新的M数据时，直接从旧DRAM返回过时值。

这两个条件关注**同一物理Line**，不负责直接规定不同地址X、Y之间所有CPU操作的跨核全序。更正式的Memory Consistency还要说明允许哪些Load/Store观察。MIT 6.004教学讲义明确将MESI用来维持共享副本与写失效的关系：https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/pages/c21/c21s1/ 。

## 三、三类关键相干事务：BusRd、BusUpgr、BusRdX（约3分钟）

这是用于推导的**教学简化命名**，真实CPU可能使用Directory请求、层级Snoop或不同事务编码。

1. **BusRd：共享/读请求。** 当前本级I，Core需要读取X。如果没有其他副本，常可取得E；若其他核已有有效副本，则参与者变为S。若另一核持有M，最新数据应通过相干路径提供，并在本课程的简单MESI模型中将双方转为S。
2. **BusUpgr：本地已有S，但要写。** 核已有最新的干净Line，却没有独占权限，需要通知其他共享者失效。获得确认后可以从S→M；不必再次下载一整条数据。
3. **BusRdX / RFO：本地I，但要写。** 需要获取正确Line内容及独占所有权，可能同时触发其他副本失效。数据未必来自DRAM，也可能来自拥有者或LLC。

~~~mermaid
flowchart TD
    I["I：无有效副本"] -->|"本核读 / BusRd"| E["E：唯一干净副本"]
    I -->|"本核读且别核持有 / BusRd"| S["S：共享干净副本"]
    I -->|"本核写 / BusRdX-RFO"| M["M：唯一修改副本"]
    E -->|"本核写 / 无需失效消息"| M
    E -->|"别核读"| S
    S -->|"本核写 / BusUpgr + 其他核Invalidate"| M
    M -->|"别核读 / 提供最新数据"| S
    S -->|"别核取得写所有权"| I
    M -->|"别核取得写所有权 / 数据与权限交接"| I
~~~

图中省略了替换导致的回写、所有远端请求路径，以及同一时刻的瞬态。特别注意：**本地E→M无需新的广播失效**，因为E本来就意味着没有其他有效副本；但S→M通常必须协调。

当Core 1读取Core 0持有的M副本时，Core 0可通过相干系统交付最新数据。为了满足这里S为干净共享副本的简化MESI定义，协议还要使相应下层副本保持一致；这不等于软件必须等待数据写入最底层DRAM芯片后才能读。

## 四、完整两核Trace：状态是如何变化的？（约2分钟）

初始物理X=0，两核对X均为I，所有事务完成后再进行下一步。

| 操作 | Core 0状态 | Core 1状态 | 读取结果/关键事务 |
|---|---|---|---|
| 初始 | I | I | X=0 |
| Core 0读X | **E** | I | 读0；BusRd，无其他副本 |
| Core 1读X | **S** | **S** | 读0；BusRd；Core 0降级 |
| Core 0写X=7 | **M** | **I** | BusUpgr；Core 1失效 |
| Core 1读X | **S** | **S** | 读7；Core 0的M副本提供最新数据 |
| Core 1写X=9 | **I** | **M** | BusUpgr；Core 0失效 |

这里没有任何一步要求Core 0写7后**立刻**把7刷回DRAM，Core 1才有可能拿到7。硬件相干请求能找到最新版本。MIT课程对“修改者提供数据、读者降级为S”有对应Trace：https://computationstructures.org/lectures/parallel/parallel.html 。

容易犯错的判断：“Core 1在Core 0持有M时读取X，会直接命中Core 1原来的共享副本。”不成立：Core 1在Core 0写入时已经被置为I。它必须重新获取有效数据。

## 五、数值案例：为什么False Sharing能拖垮多核吞吐？（约2分钟）

考虑对齐的64B物理Line：

~~~text
字节位置： 0            8                             63
           +------------+------------+----------------+
Line L：   | counter_A  | counter_B  | 其余字段        |
           +------------+------------+----------------+
Core 0反复写counter_A；Core 1反复写counter_B
~~~

A与B是独立8B变量，但位于**同一个64B相干单元**。两个核反复交替写入时，Line的M写权限会在两核之间来回转移：

~~~text
Core 0持有 M
   → Core 1请求写权限：Core 0失效，Core 1获得M
   → Core 0再次请求写权限：Core 1失效，Core 0获得M
   → ...
~~~

这就叫**False Sharing（伪共享）**：不是两个核读写同一个变量，而是修改了不同字段却竞争同一Cache Line的所有权。

数值例题：假设已经完成第一次所有权获取，之后有500次真正发生的跨核所有权转移，每次转移在关键路径额外暴露60周期，并且这些开销完全不重叠，则：

\[
\Delta C=500\times60=30{,}000\text{ cycles}.
\]

把两个频繁写入的独立变量分别放进不同64B Line，能显著减少这类转移。但并非免费：Padding增加数据占用，可能增大Cache和TLB工作集，也可能损害其他访问的局部性。Linux内核官方文档也将不同字段共用相干Line造成的失效与HITM作为重要性能问题：https://www.kernel.org/doc/html/latest/kernel-hacking/false-sharing.html 。

## 六、Snooping与Directory：如何找到要失效的副本？（约2分钟）

**Snooping（侦听式）**：在共享的广播或有序相干互连上，各缓存检查相关事务；对于小规模系统直观，但广播成本可能随核数上升。

**Directory（目录式）**：维护该物理Line的拥有者与共享者信息，写入者只需向已知相关持有者发失效消息（具体编码可能使用Sharer Vector、稀疏目录等）。

~~~mermaid
flowchart LR
    A["Core 0想写Line X"] --> D["Directory：记录X的共享者"]
    D --> I1["Invalidate → Core 1"]
    D --> I2["Invalidate → Core 2"]
    I1 --> ACK["等待必要ACK"]
    I2 --> ACK
    ACK --> G["Core 0获得独占写权限"]
~~~

目录不会自动保证每种访问都比广播快：目录项占空间，热点Line可能需要多个确认，NoC拥塞与寻址延迟也会影响性能。但它可以避免对完全不相关的核心无条件广播。

**性能关键**是“消息开销与同步等待”，而不是单纯的有效Cache副本数量。下一周的NoC专题还会更深入分析互连成本。

## 七、最容易混淆的一点：MESI不等于SC或TSO（约3分钟）

### 7.1 Coherence只解决什么？

Coherence解决同一物理位置/Line的副本协调与写入序列化。例如Core 0写X=7，Core 1后来通过协议获得X时，不能把被淘汰的旧副本当成最新值。

但它**不替你规定**“Store X”和另一个地址“Load Y”是否必须遵循严格的跨核全局操作顺序。这是**Memory Consistency Model**的问题。

### 7.2 为什么SC禁止经典Store Buffering的(0,0)？

初始X=Y=0：

~~~text
Core 0                      Core 1
Sx: STORE X=1               Sy: STORE Y=1
Ly: r0=LOAD Y               Lx: r1=LOAD X
~~~

SC（顺序一致性）要求存在一个保留每核程序顺序的全局串行交错：

\[
S_x<L_y,\qquad S_y<L_x.
\]

如果两次Load都读到初始0，还要求：

\[
L_y<S_y,\qquad L_x<S_x.
\]

联立得到：

\[
\boxed{S_x<L_y<S_y<L_x<S_x}
\]

出现严格顺序环，所以SC下不可能有 \((r_0,r_1)=(0,0)\)。

### 7.3 TSO为什么允许，MESI又为什么没有失效？

在允许Store→不同地址Load放松的TSO教学模型里，两核可以先将Store放入各自Store Buffer：

~~~text
Core 0：X=1仍在本核Store Buffer；之后Load Y读取旧0
Core 1：Y=1仍在本核Store Buffer；之后Load X读取旧0
再往后，两份Store逐渐排出并通过MESI取得写权限
~~~

因而 \((0,0)\) 可成为**合法架构结果**。当这些Store最终进入相干系统时，MESI仍然按规定维护各Line的写入所有权；一致性没有被破坏。

这是第5周必须掌握的三个不同时间点：

\[
\boxed{\text{Store从ROB退休}
\ne\text{相干写入已全局可见}
\ne\text{脏数据已回写到DRAM}.}
\]

更具体地说，**本核Load可以从本核较老同址Store转发新数据**，即使另一个核尚未观察到该Store；别的核只通过相干Cache/内存路径读到旧值，不代表它拥有违反MESI的新旧副本。

缓存一致性的MESI稳定状态并不直接描述Store Buffer中的所有在途写。把“Store已退休”直接等同于“对应Line已经M并可供其他核观察”，会在这一步推理出错。关于Coherence/Consistency区别，可参考上述MIT教材及并行体系结构讲义。

## 八、边界与反例：哪些说法不能直接推广？（约1分钟）

- **M状态不意味着DRAM已经更新。** 最新版本可以保存在拥有者Cache中；别核读时由相干路径取得。
- **E→M通常不需额外失效，但S→M需要协调。** 不要把两个Write Hit当成同样的外部流量。
- **MESI四状态是稳定状态教学模型。** 真实CPU还可能使用MOESI、MESIF、目录、暂态和非包含式LLC，不能直接把图画成产品的逐周期实现。
- **False Sharing不是数据竞争（Data Race）的同义词。** 两个线程即使通过正确同步分别更新自己的独立变量，也可能遭遇Line级乒乓。
- **一致性正确不代表没有内存排序问题。** 多地址的合法观察由ISA和编程语言的内存模型共同决定，必须正确使用同步原语。

## 九、本课总结与下一讲（约1分钟）

需要记住的核心不变量是：

\[
\boxed{\text{Single Writer / Multiple Readers}}
\]

\[
\boxed{\text{获得写所有权之前，竞争副本必须被适当失效}}
\]

\[
\boxed{\text{相干副本正确}\not\Rightarrow\text{所有核的不同地址操作都是SC}}
\]

**下一讲：第30课（2026年11月18日，第5周第2节）《MESI状态机与协议竞态：Transient State、Invalidate ACK与Directory压力》。** 下一讲将回答为什么两个核同时升级共享Line时，不可能只画一个理想的S→M箭头就万事大吉。

## 十、参考资料

- MIT 6.004，Parallel Processing与MESI教学Trace：https://computationstructures.org/lectures/parallel/parallel.html
- MIT OpenCourseWare，MESI与共享读/Invalidate：https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/pages/c21/c21s1/
- Linux Kernel，False Sharing：https://www.kernel.org/doc/html/latest/kernel-hacking/false-sharing.html
- Intel Performance Skills，False Sharing优化案例：https://github.com/intel/intel-performance-skills/blob/main/skills/performance-patterns/patterns/false-sharing.md

## 十一、四级分级测评（100分）

**首次课堂不提供标准答案、解析或参考推导。** Lv1—Lv3客观判分；Lv4根据Rubric人工/自评，网站不应伪称开放题可以全自动证明。建议作答后按Lv1—Lv4顺序提交。

### Lv1｜Modified副本与跨核最新值（15分，单选，预计2分钟）

物理X初始为2。Core 0已通过相干协议完成对X的写入，使其L1持有X=7的Modified（M）副本；DRAM中的X仍可能是2。随后Core 1请求读取X。哪项判断最严谨？

**A.** Core 1必须从DRAM读取2，因为写回尚未发生。

**B.** Core 0已经是M，因此Core 1可以无须相干协议，直接读取自己的过时共享副本。

**C.** 相干系统必须使Core 1取得最新的有效数据版本，可由Modified持有者或相应相干路径提供，不要求程序先等待最终DRAM写回。

**D.** 只要Core 0的一条Store从ROB退休，就说明Core 1在同一周期必然能读到7。

<details><summary>可选提示（不泄露答案）</summary>

把“谁持有最新副本”“DRAM是否更新”和“Store是否仅退休”分成三个问题。

</details>

### Lv2｜MESI两核Trace中的Invalidate次数（20分，数值，预计4分钟）

两核教学MESI：同一物理Line X初始状态为(I,I)，内存X=0；每一步相干事务在下一步之前完成，无自发替换。依次执行：(1) Core0读X；(2) Core1读X；(3) Core0写X=1；(4) Core1读X；(5) Core1写X=2；(6) Core0读X；(7) Core0写X=3。问：整个Trace里使**另一个核原先有效的Line变为I**的所有权升级/失效事务共发生几次？填写整数，不计初始I，也不把正常M→S读降级计为Invalidation。

**作答单位：次；仅填写整数。**

<details><summary>可选提示（不泄露答案）</summary>

每次写之前检查写入者是否持有S、E或M；只有别核持有有效副本而写入者需要独占所有权时才数一次。

</details>

### Lv3｜MESI、不变量、False Sharing与TSO（25分，多选，预计5分钟）

针对本课的普通可缓存内存与两核MESI稳定状态模型，选择**所有**正确说法。

**A.** 本核持有某Line的E副本时，若没有其他并发事务，本核写该Line可E→M，无须向别核额外发送Invalidate。

**B.** 本核对某Line只持有S副本时，要写入一般需要升级写权限并使其他有效共享副本失效。

**C.** 另一个核持有某Line的M副本时，读取者仍可通过相干协议获取最新数据，而不一定等到该Line最终从Cache逐出到DRAM。

**D.** 因为MESI保证同一Line相干，所以它自动禁止TSO经典Store Buffering的(0,0)架构结果。

**E.** 两个线程写不同变量，但变量位于同一64B Cache Line，仍可能不断争用该Line的写所有权。

**F.** 只要Store从ROB退休，该Store就必然已经对所有其他核心全局可见。

<details><summary>可选提示（不泄露答案）</summary>

分开判断单行写所有权、脏副本转发、同Line不同字段，以及不同地址的内存排序。

</details>

### Lv4｜MESI状态追踪、伪共享代价与SC/TSO证明（40分，开放，预计10—12分钟）

统一假设：两个核、64B Line、Write-invalidate教学MESI，所有事务按所列顺序完整结束；无自发驱逐、无其他共享者，所有写入实际取得权限后才记为完成。请完成A—D，写清状态、公式、边界。

**A｜MESI Trace与所有权（12分）** 物理X初始0，双方均I。依次：(1) Core0读X；(2) Core1读X；(3) Core1写X=3；(4) Core0读X；(5) Core0写X=5。逐步列出(Core0,Core1) MESI状态和读出的X值；指出何时发生Invalidate、何时要由修改者提供最新数据。说明这里“M→S”的含义。

**B｜False Sharing与量化代价（10分）** 同一个对齐64B Line里，Core0只写偏移0处的8B计数器a，Core1只写偏移8处的8B计数器b。两核交替共完成400次写，第一笔取得写所有权的成本不计，以后每次核间写所有权交换额外暴露70周期，成本互不重叠。求所有权交换次数和额外周期；把a、b拆到各自独立的Line后，说明在无其他共享者的理想条件下上述交换会如何变化，并讨论额外空间成本。

**C｜内存模型与单侧屏障（10分）** 初始X=Y=0。Core0执行STORE X=1; FENCE; r0=LOAD Y；Core1执行STORE Y=1; r1=LOAD X。假设FENCE在TSO中保证本核较老Store在后继Load之前达到全局可见点，且没有其他写。判断**只有Core0设置FENCE**时(r0,r1)=(0,0)是否可能；再判断**Core1也在Store与Load之间增加同类FENCE**后是否可能。分别用可见顺序或时间线证明，并解释这与MESI及本核同址Store-to-Load Forwarding的关系。

**D｜实验设计与边界（8分）** 为比较“同Line的两个独立计数器”与“分别Cache Line对齐”的实现设计公平实验：固定任务量，给出至少四项应收集的统计（如HITM、Invalidation、缓存Miss、端到端时间、IPC、P99、空间/Cache工作集等），并解释为什么不能只凭总Miss Rate或DRAM内容判断性能与正确性。

<details><summary>可选提示（不泄露答案）</summary>

A依次追踪持有者和读值；B不要计入第一笔初始获取；C对比只有单侧Fence与双侧Fence时能否构造无环的跨核可见顺序；D检查相干流量和端到端时间。

</details>

## 十二、评分规则与下一讲

四题合计15+20+25+40=100分。≥80分按既定课号继续；60—79分补一例MESI状态追踪；低于60分重点复习第24课Write-back/Store Buffer、第28课SC/TSO，再做纠错练习。**补练不改变第30课的日期和编号**。

建议作答格式：

~~~text
Lv1：
Lv2：
Lv3：（写所有选择字母）
Lv4：
A：
B：
C：
D：
~~~
