---
title: "第24课｜Cache写策略与一致性前奏：Write-back、Write-through、Write-allocate、Dirty与Store Buffer"
track: arch
number: 24
date: 2026-11-12
week: 4
minutes: 18
kind: full
summary: "从Store的退休、缓冲、写所有权和Dirty Line出发，辨析Write-back/through与Write-allocate/no-allocate，推导写流量模型和LRU Trace，说明缓存一致性可见性并不等于DRAM回写。"
tags: [cache, write-back, write-through, write-allocate, dirty-bit, store-buffer, RFO, MESI, coherence, TSO, memory-model]
diagram: mermaid
---

# 计算机体系结构 · 第24课
## Cache写策略与一致性前奏：Write-back、Write-through、Write-allocate、Dirty与Store Buffer

**2026年11月12日｜第4周第3节｜约18分钟**

上一课我们知道了TLB负责地址翻译，VIPT利用页内偏移在物理Tag到达之前读取Cache阵列。但**Cache Hit以后，一条Store到底去哪里？** L1写完是否表示DRAM也写完？其他核何时能读到这个值？

本课要把三个经常被误认为同一事件的时刻分开：

> **Store按序退休；写入被相干内存系统中的其他核观察；脏数据最终写回下一级或DRAM。它们并不要求发生在同一周期。**

本讲假设普通、可缓存、硬件相干的内存；多核采用某种MESI风格的写所有权协议。以下流量计算另行采用单核、无额外争用、64B Cache Line和理想整行传输模型，实际处理器可能不同。

## 一、动机：为什么Store不应每次都直写DRAM？（约2分钟）

假设执行循环，对同一个计数器连续更新100次，每次Store写入8B。如果每次都向下一级发送8B，单就这100次写而言，下一级最多可能接收800B数据写入。若L1先获取整条64B Line并一直保存修改，最终只需在合适时机把整条脏Line写回一次，就可能大幅减少数据流量。

然而，写回并非免费：首次写Miss可能需要获取完整旧Line，以保留那些没有被修改的字节；还可能需要向其他缓存请求独占写权限。所以**写策略的优劣依赖访问局部性，而不是只看一次Store的字节数**。

~~~mermaid
flowchart TB
    ST["CPU执行Store"] --> ROB["ROB按程序顺序退休"]
    ROB --> SB["已提交Store Buffer / 写队列"]
    SB --> OWN["获得该Cache Line写权限（如相干RFO）"]
    OWN --> L1["修改L1数据，标记Dirty/Modified"]
    L1 --> PEER["另一核请求时，经一致性协议提供最新数据"]
    L1 --> EV["脏行逐出/降级时，按层次协议传递修改数据"]
    EV --> LOW["下一级Cache / 最终可能写入DRAM"]
~~~

这张图按概念阶段排列，并非宣称所有CPU都严格按图中的周期顺序实现：有些实现的Store可能先取得所有权，Store Buffer也可能与L1流水线高度重叠。核心是**不能用“已经退休”推断“已经写到DRAM”**。

## 二、两条正交的策略轴（约3分钟）

首先定义两条独立选择。

**轴一：写命中（Write Hit）怎么办？**

- **Write-through（写直达）**：更新本级缓存时，也将对应修改发送给下一层内存系统。通常可由Write Buffer缓冲，**并不意味着必须同步等待DRAM落地**。
- **Write-back（写回）**：先在本级缓存保留修改，记录Dirty状态；之后在脏行逐出、失去所有权或协议要求时，向下一级传递最新数据。多次写同一Line可以合并成较少的下行传输。

**轴二：写未命中（Write Miss）怎么办？**

- **Write-allocate（写分配）**：为写入的块分配本级Cache Line；对于只更新部分字节的情况，常需获取原Line及相干写所有权（典型操作称Read For Ownership，RFO）。
- **No-write-allocate / Write-no-allocate（不写分配）**：写Miss不在本级Cache创建该Line，而把写请求交由下一层处理。本级后续再写可能仍然Miss。

| 写命中策略 | 写Miss分配策略 | 典型性质 |
|---|---|---|
| Write-back | Write-allocate | 常见通用CPU数据Cache组合；利于反复修改同一Line |
| Write-through | No-write-allocate | 减少仅写一次时不必要的L1填充，但下层会接收多次写 |
| Write-through | Write-allocate | 也可实现；本级保存副本且修改向下传播 |
| Write-back | No-write-allocate | 在明确Miss写路径的实现中也能设计，需额外说明下层语义 |

**不能把“Write-through”与“No-write-allocate”等同起来。** 一条轴决定命中时如何传播修改，另一条轴决定未命中时是否在本级占用Line。

**Dirty Bit**通常表示该行相对于下一层保存的版本存在尚待传播的修改。Write-back Line收到Store并完成修改后可能变Dirty；清洁（Clean）Line被逐出通常不必将数据本身再写回。Write-through策略的本级Line往往保持Clean，但写缓冲中的待传输修改并不因此消失。

## 三、RFO：写8B为什么可能先读64B？（约2分钟）

现在假设一个64B Line初始不在L1，且Store只覆盖其中8B。对于Write-back + Write-allocate的普通相干Cache，常见流程为：

~~~text
STORE 8B → L1 Write Miss
     ↓
请求该Line的所有权（RFO/升级请求）
     ↓
必要时由下一级或其他缓存提供完整64B旧数据
     ↓
保留未修改的56B，覆盖目标8B
     ↓
Line进入可写/Modified状态，成为Dirty
~~~

为什么需要旧数据？因为Store只修改8B，剩下56B必须保持正确。**但不是所有写Miss都一定读取DRAM完整64B**：目标Line可能已经在其他缓存，可能有特殊全行写、零填充优化，协议消息粒度也可能不同。

另外，RFO中的“Read”主要表示获取适当数据和写所有权，不能机械理解成“每次必须从DRAM读出64B”。

## 四、数值例题：写流量存在交叉阈值（约2分钟）

建立一个非常明确的教学模型：

- 目标64B Line初始不在L1；
- 同一Line被连续写入 \(n\) 次，每次写8B，覆盖相同或不同位置；
- Write-back + Write-allocate（WB+WA）：首次冷写读入64B，最终脏逐出时回写64B；
- Write-through + No-write-allocate（WT+NWA）：每次8B Store向下一级发送8B，不在L1分配；
- 忽略协议控制、下层可能执行的额外读修改写、写合并、其他访存及替换干扰。

于是WB+WA的下一级数据传输：

\[
D_{\mathrm{WB+WA}} = 64+64=128\ \mathrm{B}.
\]

WT+NWA的下一级写数据：

\[
D_{\mathrm{WT+NWA}} = 8n\ \mathrm{B}.
\]

令两者相等：

\[
8n=128\quad\Rightarrow\quad n=16.
\]

在该教学模型中，\(n<16\) 时WT+NWA的数据量较少；\(n>16\) 时WB+WA较少；等于16时相同。

**反例：** 如果只有一次8B冷写、以后再也不访问该Line，直接发送小写请求在本模型下比读整行加最终写回更省数据量；但如果高频重复更新同一Line，WB合并优势就可能突出。

该结论不是对DRAM字节数的普遍预测。下一层可能本身Write-back或需要RFO，写合并也可能降低WT流量。更不能把“传输字节较少”直接等同于“IPC更高”。

## 五、带Dirty状态的LRU执行Trace（约2分钟）

考虑某Set是2-way、真LRU、初始为空，采用WB+WA，Line为64B，块A/B/C均映射到这一Set。用W表示部分字节写、R表示读。

访问序列：

~~~text
W A → R B → W A → W C → R B
~~~

| 访问 | Hit/Miss | 完成后本组MRU→LRU | 被逐出块 | 下一级数据行为 |
|---|---|---|---|---|
| W A | Miss | A(D) | 无 | 读入A 64B |
| R B | Miss | B(C), A(D) | 无 | 读入B 64B |
| W A | Hit | A(D), B(C) | 无 | 无 |
| W C | Miss | C(D), A(D) | B(C) | 读入C 64B，干净逐出不写回 |
| R B | Miss | B(C), C(D) | A(D) | 读入B 64B，回写A 64B |

D表示Dirty，C表示Clean。每一次Miss都完整取回Line，且没有其他相干干扰。本例共4次64B Line Fill和1次64B Dirty Writeback，下一级数据流量为320B。

注意两点：**读Hit会更新LRU次序，但不自动把Dirty改为Clean**；**写Miss可能同时产生Line Fill和Dirty Victim回写两类不同流量，但Clean Victim不必回写数据**。这也是“Miss数量”和“下一级传输字节”不是一一对应的原因。

## 六、Store Buffer为什么是退休与传播之间的桥梁？（约3分钟）

Store通常需要遵守程序的架构提交要求，但不必为了每一条Store都等待全部后续相干传播或DRAM操作完成。

一个常见的乱序CPU会在Store地址和数据准备好、满足按序提交条件后，把该Store放入已提交写队列/Store Buffer，由后端继续获得写权限并推进写入。

**同核读取：** 如果后续Load与本核较老Store访问同一地址并满足转发条件，Load可以从Store Buffer获得新值；这不要求其他核已看到该Store。

**跨核读取：** 一旦Store按该系统的相干和排序规则成为其他相干核心可观察的写入，其他核应能通过协议看到正确值。该数据可能来自拥有最新Dirty副本的Cache，而不需要先写回DRAM。

**内存落地：** 某条Dirty Line最终可能在逐出或相干操作时向下一层传递数据，DRAM中的旧值可以在此之前存在。

~~~mermaid
sequenceDiagram
    participant C0 as Core 0
    participant SB as Store Buffer
    participant L1 as Core 0 L1
    participant COH as 相干系统
    participant C1 as Core 1
    participant MEM as DRAM

    C0->>SB: STORE X=1 退休后排队
    SB->>COH: 申请X的写所有权
    COH-->>L1: 允许修改/必要时提供数据
    SB->>L1: 更新X=1，Line Dirty
    C1->>COH: LOAD X
    COH->>L1: 请求最新X数据
    L1-->>C1: 提供X=1（协议示意）
    Note over L1,MEM: 此刻不要求DRAM已更新
    L1-->>MEM: 以后按层次协议回写/传播
~~~

这里的时间线展示一种**可能实现**，不是声称任何Store一退休就立刻对其他核可见。Store Buffer中的数据何时成为相干域可见，需要符合具体ISA内存模型和协议。

### Store Buffer性能容量

设到达速率为 \(\lambda\)（Store/周期），排出速率为 \(\mu\)。在理想连续速率模型中，尚未满时：

\[
\frac{dQ(t)}{dt}=\lambda-\mu.
\]

如果 \(\lambda>\mu\) 持续存在，队列占用增长，有限容量最终造成反压；如果 \(\lambda<\mu\)，长期平均可能稳定，但突发仍可能短时填满队列。对稳定系统，Little定律给出：

\[
\overline Q=\lambda \overline T.
\]

这里的平均队列长度不能保证某一次高峰不会发生Store Stall；而且实现中的Write Buffer、Store Queue和Dirty Eviction Writeback Buffer是相关但可能不同的硬件结构。

## 七、重点纠错：Write-back Dirty不是“全局不可见”（约2分钟）

考虑两个相干核心，初始X=0。

Core 0写X=1，经过必要缓冲和相干协议后，本核L1拥有X的Modified副本。此时DRAM仍可能保存0。

Core 1随后读X。相干协议可以请求最新数据，由Core 0的修改副本或相应缓存/代理提供1。

因此：

\[
\boxed{\text{DRAM仍保存旧值}\not\Rightarrow\text{其他相干核只能读旧值}}.
\]

缓存一致性约束的是同一地址的有效副本与写入传播关系；内存一致性模型（memory consistency model）还规定跨地址、跨核程序允许的读写排序。两者不是同一个概念。RISC-V特权规范专门区分了Coherence与Memory Consistency。参考：https://docs.riscv.org/reference/isa/priv/machine.html

### 复习TSO Store Buffering

初始 \(X=Y=0\)：

~~~text
Core 0:                    Core 1:
STORE X=1                  STORE Y=1
r0=LOAD Y                  r1=LOAD X
~~~

在SC下，若两个Load都读0，必须同时满足：

\[
S_X<L_Y<S_Y<L_X<S_X,
\]

产生循环，因此SC不允许 \((r_0,r_1)=(0,0)\)。

在允许Store→不同地址Load放松的TSO中，两边Store先留在各自的缓冲、两边Load先读到对方的旧值，因而 \((0,0)\) 可以合法。这是**架构内存排序**，既不要求发生预测错误，也不是Spectre泄漏。

RISC-V的RVWMO规范同样明确讨论本核Store Buffer Forwarding早于跨核全局可见的情形：https://docs.riscv.org/reference/isa/unpriv/rvwmo.html

## 八、适用边界与工程选择（约1分钟）

写策略不是独立于整个内存系统的旋钮。不同Cache层次、是否包含写分配、写缓冲合并、相干状态、非临时写、DMA和设备内存属性都会改变流量与可观察行为。

尤其是**MMIO/设备寄存器**可能具有不可缓存或强顺序要求，不能简单套用普通Write-back Cache模型；某些设备写入必须满足专门的架构可见性约束。

选择策略时至少同时测量：L1写Miss、RFO和所有权升级、Dirty Eviction、Write Buffer占用、下一级读写字节、CPU Store Stall及完整工作负载性能。

最后记住：某条Store从ROB退休，不意味着它马上被其他核观察；某条Write-back Line仍是Dirty，也不意味着其他核永远无法获得最新值。

## 九、课堂总结与下一讲（约1分钟）

本课用两条策略轴组织了四个概念：

\[
\boxed{\text{WB/WT决定Hit时如何处理写}}
\]

\[
\boxed{\text{WA/NWA决定Miss时是否分配Line}}
\]

而Dirty、Store Buffer和缓存一致性描述的是**写入暂存、所有权及传播**。最重要的区别：

\[
\boxed{\text{ROB退休}\ne\text{相干域可见}\ne\text{DRAM完成写回}}.
\]

下一讲为**第25课（2026年11月13日，第4周第4节）《非阻塞Cache与MSHR：Memory-Level Parallelism如何隐藏Miss延迟？》**。第28课进行前四周阶段考核，不因答题成绩更改编号。

参考阅读：[AMD AxCACHE缓存/写分配属性](https://docs.amd.com/r/en-US/am011-versal-acap-trm/AxCACHE)；[RISC-V Coherence与Cacheability PMA](https://docs.riscv.org/reference/isa/priv/machine.html)；[RISC-V RVWMO内存模型](https://docs.riscv.org/reference/isa/unpriv/rvwmo.html)。

---

## 十、四级分级测评（100分）

**首次讲授只提供题面和不泄露标准答案的提示。** Lv1—Lv3客观判分；Lv4按评分要点人工或自评。

### Lv1｜Write-back、Dirty与跨核读取（15分，单选，预计2分钟）

Core 0把X=1写入一个Write-back Cache Line，修改后该行处于有效的独占修改状态，但尚未被逐出、DRAM中仍可能保留旧值。Core 1随后通过正常的缓存一致性协议读取X。以下哪一项最准确？

**A.** Write-back要求每次Store立即同步写完DRAM，因此前提不可能成立。

**B.** 因为DRAM尚未更新，Core 1必然只能读到旧值。

**C.** 一致性协议可以让Core 1获得Core 0修改后的数据；是否发生DRAM写回与该数据能否被一致性域中的其他核正确读取不是同一回事。

**D.** 如果Core 0的Store已经退休，CPU就不需要Store Buffer，也不需要缓存一致性协议。

**可选提示（不泄露标准答案）：** 想想MESI的Modified数据究竟在哪里；另一个核发出读取请求后，是否只能从DRAM读取？

### Lv2｜Write-allocate + LRU脏回写Trace（20分，数值，预计4分钟）

教学用单核Write-back + Write-allocate Cache：每行64B，某Set为2-way、真LRU、初始为空；A/B/C是映射到该Set的三个不同物理块。执行 W A → W B → R A → W C → R B（W为写命中/未命中时写入该块部分字节，R为读）。规定每个读Miss或写分配Miss都从下一级取回完整64B，每次脏块逐出向下一级回写64B；忽略全部控制消息和其他流量。问下一级数据总传输量多少Byte？只填整数。

**可选提示（不泄露标准答案）：** 用MRU→LRU记录每一步的两条Line；先数需要完整取回的Miss，再单独数Dirty Victim。

### Lv3｜写策略、相干可见性与TSO边界（25分，多选，预计5分钟）

针对普通可缓存、相干的内存和本课明确的教学策略，选择所有正确陈述。

**A.** Write-through要求每个Store都必须等DRAM完成实际写入后才能从ROB退休，任何写缓冲都不允许。

**B.** Write-allocate写Miss在部分字节Store时，可能先申请整条Line及写所有权，即使实际只改动8B。

**C.** Write-back中的Dirty Line被逐出时可能产生下一级回写；Clean Line逐出通常不需要写回原数据。

**D.** 如果Core 0的修改尚未写回DRAM，一致性域中的Core 1就不可能读到其新值。

**E.** 允许Store Buffering的TSO中，两个核各自先Store不同地址再Load对方地址，两个Load都读到旧0可以是合法的架构结果。

**F.** No-write-allocate必定降低总访存流量、能耗和延迟，不需要考虑后续写的局部性。

**可选提示（不泄露标准答案）：** 把回写时机、写Miss是否填充、跨核可见性和Store→Load顺序分开；警惕“必须”“不可能”“必定”。

### Lv4｜流量交叉点、Store Buffer与跨核语义联合设计（40分，开放推导，预计10—12分钟）

统一教学场景：普通相干可缓存内存，64B Cache Line，首次写入目标块时L1未命中。方案A是Write-back + Write-allocate：每个冷块先取回64B、最终脏逐出再回写64B；方案B是Write-through + No-write-allocate：每次8B Store向下一级发8B，不在L1分配；忽略额外RFO、写合并、协议控制和其他负载。A（10分）：工作负载包含10个互不相同的冷块：4个块各写入1次8B，另外6个块各重复写入32次8B。分别计算全选方案A、全选方案B、按块选择较省数据流量的混合方案的下一级传输总Byte，并求混合方案相对全A节省多少Byte；解释为何实际硬件不能直接照搬按块切换的模型。B（12分）：按时间线分析Core 0的Store X=1从ROB退休、进入Store Buffer、获得写所有权、更新Dirty Line，以及Core 1经相干协议读到X=1，说明为什么不必等待写回DRAM；再给出经典双核Store Buffering程序的SC/TSO区别。C（10分）：一个12项的已提交Store队列，按连续平均速率模型每周期进入0.55项、排出0.35项，从空队列开始，估算首次达到容量的时间，说明稳态条件和为什么实际突发不能只靠平均值预测。D（8分）：为两种策略设计公平实验，至少包含总线/下一级流量、Miss、Store停顿、正确性与一致性，并给出适用边界（MMIO、预取或其他共享者等）。

**可选提示（不泄露标准答案）：** A把每次小写的数据量与整行填充/最终回写分开；B画出提交、传播、共享读取三个时间点；C使用净入队速率；D不要把下一级传输直接等同于DRAM传输。

---

## 十一、作答与评分

请依次回复：

~~~text
Lv1：
Lv2：（整数，单位B）
Lv3：（所有选中字母）
Lv4：
A：
B：
C：
D：
~~~

Lv1、Lv2、Lv3、Lv4分别为15/20/25/40分，合计100分。80分及以上继续按日历进入下一讲；60—79分补充一例写策略或可见性Trace；低于60分重点回顾Dirty、写Miss所有权和TSO双核顺序。**补练不改变课程编号。**
