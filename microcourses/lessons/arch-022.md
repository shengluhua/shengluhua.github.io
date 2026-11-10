---
title: "第22课｜Cache地址分解与多级层次：Tag、Index、Offset与AMAT"
track: arch
number: 22
date: 2026-11-10
week: 4
minutes: 18
kind: full
summary: "用组相联地址映射与多级AMAT解释Cache的命中、冲突、局部和全局Miss Rate及实际CPU性能边界。"
tags: [cache, hierarchy, tag, index, offset, associativity, LRU, AMAT, locality, VIPT, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第22课
## Cache地址分解与多级层次：Tag、Index、Offset、命中率与AMAT

**2026年11月10日｜第4周第1节｜预计18分钟**

昨天第21课完成ROB、LSQ、分支恢复及安全验证的复盘。今天开始第4周的Cache、TLB、预取、Memory-Level Parallelism（MLP）专题。本课目标是从地址一步步找到Cache组、理解为何发生冲突，以及把L1/L2命中率正确换算为平均访存延迟。**Cache命中率、AMAT与处理器IPC分别衡量不同的东西。**

## 一、动机：CPU为什么不能每次都访问DRAM？（2分钟）

ALU执行整数计算通常远快于访问远端内存。若每条Load都必须访问DRAM，增加Issue宽度和ROB容量仍可能被长延迟拖慢。Cache利用时间局部性（刚访问的数据可能再次用到）和空间局部性（附近地址可能很快用到），将以Cache Line为单位的数据保留在靠近CPU的位置。

~~~mermaid
flowchart LR
 C["CPU: Load/Store"] --> A["L1 Cache"]
 A -->|L1 Miss| B["L2 Cache"]
 B -->|L2 Miss| D["LLC / L3（若存在）"]
 D -->|Miss| E["DRAM"]
 E -. "取回数据块" .-> D
 D -. "向上层返回" .-> B
 B -. "返回所需数据" .-> A
~~~

这是教学用串行层次图。实际Cache可能非阻塞，可预取、写缓冲、并行处理多个未命中；不同CPU的LLC还有Inclusive、Exclusive或Non-inclusive等组织方式。单看该图不能推断实际产品访问时延。

假设访问数组A[i]，随后访问A[i+1]。若两个元素位于同一Cache Line，第二次可能直接命中。反例是随机访问大量稀疏地址，提前带入的其他字节可能完全用不到，过大的Cache Line反而浪费带宽和容量。

## 二、地址由哪些位组成？（2分钟）

先使用PIPT（物理索引、物理Tag）教学模型。设物理地址宽度P位；Cache数据容量C字节，每行B字节，A-way组相联，均为2的幂。这里的容量只统计数据存储，不额外计入Tag、Valid、Dirty和ECC元数据。

总Cache Line数、Set数分别是：

\[
N_{\rm lines}=\frac{C}{B},\qquad S=\frac{C}{AB}.
\]

所需位数：

\[
b=\log_2B\quad(\text{Offset}),\qquad
s=\log_2S\quad(\text{Index}),\qquad
t=P-b-s\quad(\text{Tag}).
\]

~~~text
物理地址：高位                                   低位
+-----------------------+--------------+------------+
| Tag（t位）              | Index（s位）  | Offset（b位）|
+-----------------------+--------------+------------+
    组内比较Tag              选择Set        选择行内字节
~~~

设地址为a，低位连续取索引的规则为：

\[
\mathrm{offset}=a\bmod B,\quad
\mathrm{set}=\left\lfloor a/B\right\rfloor\bmod S,\quad
\mathrm{tag}=\left\lfloor a/(BS)\right\rfloor.
\]

如果B和S均为2的幂，可用移位与掩码：

\[
\boxed{\mathrm{set}=(a\gg b)\ \&\ (S-1),\quad
\mathrm{tag}=a\gg(b+s).}
\]

**Set相同不等于Cache Hit，更不等于同一Cache Line。** 命中还必须在该组的某个Way中找到Valid=1且Tag匹配的缓存行。

## 三、完整地址数值例题（2分钟）

假设48位物理地址，32KiB、8-way、64B的L1 Data Cache。

\[
C=32768,\quad B=64,\quad A=8.
\]

总行数512，Set数：

\[
S=32768/(8\times64)=64.
\]

Offset 6位、Index 6位，Tag为48−6−6=36位。

现访问物理地址a=0x1234。

\[
\mathrm{offset}=0x1234\bmod64=0x34=52.
\]

\[
\mathrm{line}=0x1234\gg6=0x48=72,\qquad
\mathrm{set}=72\bmod64=8.
\]

\[
\mathrm{tag}=0x1234\gg12=0x1.
\]

所以这条请求选择Set 8，检查该组最多8个有效Tag，命中后由Offset 52选中行内字节。注意这是一个**物理地址**教学案例；真实处理器的L1常用VIPT并可与TLB翻译重叠，不能无条件断言所有CPU都必须先完成地址翻译再索引。

## 四、组冲突、容量与冷启动Miss（2分钟）

上例Index只取物理地址的第6至11位。地址0x0000、0x1000、0x2000等相隔4096B；由于4096/64=64行，映射到的Set相同，而Tag不同。在8-way Set内可容纳8个不同Block；如果第9个不同Block进入已满的组，必须驱逐某个原有块。

~~~text
Set k：
Way 0 [Valid, Tag_A, Data_A]
Way 1 [Valid, Tag_B, Data_B]
...
Way 7 [Valid, Tag_H, Data_H]
第9个不同Tag出现 → Miss → 选择Victim
~~~

三类常见Miss：Compulsory（首次接触块）；Capacity（整体工作集超过Cache能容纳的量）；Conflict（组映射/有限相联度引发额外竞争）。严格比较时通常用同容量全相联LRU模型区分Capacity与Conflict。特定硬件替换方式会影响这种分类。

提高相联度可能降低冲突Miss，但也可能提高Tag比较成本、能耗和Hit Time；增大Cache Line有助于空间局部性，但可能带来Cache污染。**仅报告Miss Rate下降，不能证明性能一定提高。**

## 五、从期望推导AMAT（3分钟）

令H1表示每次访问都需要付出的L1检查/命中时间，m1表示L1 Miss Rate，P1表示L1 Miss之后的**额外**代价（不重复包括H1）。

如果Hit耗时H1、Miss耗时H1+P1，则：

\[
E[T]=(1-m_1)H_1+m_1(H_1+P_1).
\]

化简得：

\[
\boxed{\mathrm{AMAT}=H_1+m_1P_1.}
\]

假设L1 Miss之后串行访问L2。L2 Hit Time为H2，L2**局部**Miss Rate为m2，若再Miss则需额外DRAM代价PM：

\[
P_1=H_2+m_2P_M.
\]

所以：

\[
\boxed{\mathrm{AMAT}=H_1+m_1(H_2+m_2P_M).}
\]

有L3时可以继续向内嵌套：\(H_1+m_1[H_2+m_2(H_3+m_3P_M)]\)。

### 完整数值例题：局部 vs 全局

假设：

\[
H_1=4,\ m_1=0.08,\ H_2=12,\ m_2=0.25,\ P_M=160.
\]

L1 Miss之后的平均额外访问成本：

\[
P_1=12+0.25\times160=52.
\]

从而：

\[
\boxed{\mathrm{AMAT}=4+0.08\times52=8.16\text{ cycles/access}.}
\]

L2的局部Miss Rate是25%（分母是**访问L2的请求**），而L2的全局Miss Rate为：

\[
\boxed{m_{\mathrm{L2,global}}=m_1m_2=0.08\times0.25=2\%.}
\]

例如10000次L1请求里，800次L1 Miss进入L2，200次再Miss。**不能把“L2局部25%”写成“全部访存的25%进入DRAM”。** 公式假设每次L1 Miss访问L2且各层统计一致；真实硬件预取、回写及旁路会改变计数器分母。

## 六、反例：Miss Rate更低，AMAT却更高（2分钟）

假设L1 Miss之后的平均额外成本固定为52周期。设计A采用4周期Hit Time、5% Miss Rate：

\[
AMAT_A=4+0.05\times52=6.60.
\]

设计B采用更大或更复杂的L1，Miss Rate降到3.5%，但Hit Time增长到6周期：

\[
AMAT_B=6+0.035\times52=7.82.
\]

B命中率较高，但AMAT更差。优化真正要比较的是**命中时间、未命中率、Miss Penalty和真实工作负载**，不是孤立看一个命中率。

AMAT也**不等于CPI**：乱序CPU可以将Load与其他指令重叠执行，多个未命中可借助MSHR与MLP并发；Store可能缓冲；预取会改变请求时间和Miss Rate。只有在“所有相关Miss额外惩罚完全暴露、不重叠”的简化假设下，才能近似写：

\[
\Delta CPI\approx
(\mathrm{loads/inst})\times(\mathrm{misses/load})\times
(\mathrm{exposed\ penalty/miss}).
\]

例如0.3 Load/inst、5% Miss、每次完全暴露40周期，附加CPI约为0.3×0.05×40=0.6。真实IPC还受ROB、数据依赖和内存并行性影响。

## 七、与TLB/VIPT的连接（1分钟）

4KiB页的页内偏移为12位。32KiB、8-way、64B L1具有 \(b+s=6+6=12\)。因此最简单的VIPT设计可以利用页内偏移进行索引，同时由TLB生成物理Tag比较所需信息。若改为64KiB、8-way、64B，则Set数128、\(b+s=6+7=13>12\)；单凭4KiB页内偏移已不足以覆盖所需低位索引，可能涉及同义地址/别名处理或其他硬件技巧。**这不是说较大的VIPT L1无法设计，而是不能忽视地址转换。**

## 八、与ROB和TSO的联系（1分钟）

Store从ROB退休仍可能驻留Store Buffer，尚未对其他核可见；本核年轻Load即使从较老Store直接Forwarding，也不意味着其他核同步看到这个新值。Cache Hit/Miss描述某级缓存对请求的服务情况，TSO描述允许的架构内存排序，一致性协议描述缓存副本的状态与传播。**退休、同核Forwarding、跨核可见不是同一事件。**

同样，Cache状态变化本身也不能证明秘密泄漏，后者需要威胁模型和秘密相关的可观察差异。

## 九、总结与下节预告（1分钟）

今天有三条值得记住的公式：

\[
\boxed{S=C/(AB),\quad b=\log_2B,\quad s=\log_2S,\quad t=P-b-s}
\]

\[
\boxed{\mathrm{set}=(a\gg b)\ \&\ (S-1)}
\]

\[
\boxed{\mathrm{AMAT}=H_1+m_1(H_2+m_2P_M)}
\]

还有三个边界：**Set相同不等于命中；L2局部Miss率不等于全局Miss率；AMAT不等于CPU的CPI。**

**下一讲：第23课（2026年11月11日）——TLB、VIPT与地址别名：为何虚拟索引快，物理Tag仍不可省？** 第28课按计划进行第一轮四周阶段考核。

参考：[UC Berkeley CS61C AMAT讲义](https://notes.cs61c.org/content/caches-intro/amat/)；[Cornell CS3410 Cache课程笔记](https://www.cs.cornell.edu/courses/cs3410/2025fa/notes/caches.html)。本课所有硬件数字均为教学假设，非具体芯片规格。

---

# 十、四级分级测评（总分100分）

首次发送不公开标准答案或参考推导。前三题可客观判分，Lv4采用Rubric人工或自评；仅提供不泄露答案的可选提示。

## Lv1｜组相联与Tag机制辨析（15分｜单选｜预计2分钟）

某物理地址映射到组相联Cache的Set 5，但Set 5内已有一条有效缓存行。以下哪项最准确？

**A.** 只要Set Index相同，新地址必然Hit。

**B.** 仍须在Set内检查有效路的Tag；不同Tag的块可以在不同Way共存，直到该Set容量不足。

**C.** Offset决定Cache总Set数，而Tag仅决定相联度。

**D.** Set相同意味着两个地址一定属于同一条物理Cache Line。

<details>
<summary>可选提示（不泄露答案）</summary>

找到哪一组与这一组里是否已经有我需要的块，是两项不同判断。

</details>


## Lv2｜地址映射数值计算（20分｜数值｜预计4分钟）

一台PIPT教学Cache的数据容量为64KiB、4-way、每行64B，Set索引采用连续物理地址低位，组号从0开始。访问物理地址0x35C0。求十进制Set Index（只填整数）。

<details>
<summary>可选提示（不泄露答案）</summary>

先计算总Set数，将物理地址右移6位得到行号，再对Set数取模。

</details>


## Lv3｜局部/全局Miss率与性能边界（25分｜多选｜预计5分钟）

教学系统统计2000次L1读访问，其中160次L1 Miss且均访问L2；这些L2请求中32次L2 Miss。所有统计口径一致。选择所有正确说法。

**A.** L1 Miss Rate是8%。

**B.** L2局部Miss Rate是1.6%。

**C.** 以全部L1请求为分母的L2全局Miss Rate是1.6%。

**D.** L2 Hit请求数量为128。

**E.** 若一种新L1的Miss Rate下降但Hit Time明显增长，其AMAT仍可能变差。

**F.** 将Cache Line大小翻倍必然使DRAM传输字节数减半。

<details>
<summary>可选提示（不泄露答案）</summary>

明确每个Miss Rate的分母：全部L1请求还是仅L1 Miss后进入L2的请求？

</details>


## Lv4｜地址位分解、LRU Trace与AMAT设计（40分｜开放推导｜预计10分钟）

使用以下统一教学模型完成A—D，写出关键公式与执行过程。

A（12分）：PIPT L1使用48位物理地址、32KiB数据容量、4-way、64B行、连续低位组索引。求Set数，Offset/Index/Tag位数，以及地址0x6000的Set、Tag与Offset。

B（10分）：上述Cache初始为空、组内真LRU。定义块地址A=0x0000、B=0x2000、C=0x4000、D=0x6000、E=0x8000。依次访问A→B→C→D→A→E→B。逐项列出Hit/Miss与替换的Victim，求总Miss次数，并解释为何竞争同一Set。

C（10分）：另一个两级Cache延迟模型有H1=3周期、m1=6%、H2=14周期、L2局部m2=20%、DRAM额外代价180周期。求AMAT与L2全局Miss Rate。若L1 Hit Time变成5周期、m1降至4%，其余不变，比较新旧AMAT。

D（8分）：解释(i) AMAT为何不能直接当作CPU的CPI，(ii) 32KiB 8-way 64B L1为何适合用4KiB页内偏移解释简单VIPT索引，(iii) Store从ROB退休为何不等于立即对其他核可见。

<details>
<summary>可选提示（不泄露答案）</summary>

先算S=C/(AB)和位宽；LRU只在同组中更新；AMAT按H1+m1(H2+m2×PM)计算；边界分析考虑MLP、页内偏移与Store Buffer。

</details>

## 作答与评分

~~~text
Lv1：
Lv2：
Lv3：（所有选中字母）
Lv4：
A：
B：
C：
D：
~~~

四题共100分，分别为15、20、25、40分。得分≥80分按既定日历进入下一专题，60—79分补针对性例题，低于60分回顾Tag/Index/Offset及多级AMAT后再练；**补练不改变课程编号**。开放题依Rubric人工或自评，网站不应伪称全自动评分。
