---
title: "第27课｜Cache替换、预取协同与多核干扰：为什么更高Hit Rate未必带来更高IPC？"
track: arch
number: 27
date: 2026-11-15
week: 4
minutes: 18
kind: full
summary: "用Reuse Distance解释LRU的扫描污染，比较LIP、RRIP和预取插入策略，建立共享LLC下的MPKI、CPI和公平性性能账本，区分缓存相干与TSO可见性。"
tags: [cache, replacement, LRU, reuse-distance, LIP, RRIP, prefetch, pollution, LLC, multicore, MPKI, fairness, CAT, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第27课
## Cache替换、预取协同与多核干扰：为什么更高Hit Rate未必带来更高IPC？

**2026年11月15日｜第4周第6节新课｜预计18分钟**

前几节学过Cache地址分解、VIPT、写策略、MSHR和硬件预取。今天将它们合起来：**当一个Set已经满了，新进来的Demand或Prefetch究竟应当替换哪条Line？多个核心共享LLC时，谁应该得到这些Cache空间？**

本课从真实的替换策略出发，推导Reuse Distance和MPKI性能模型，并证明：**某个程序的Cache命中率提高，不保证它的IPC提高；整个系统Miss减少，也不代表每个租户的延迟都更好。**

## 一、动机：预取“成功”也可能伤害关键数据（2分钟）

假设4-way Cache的某个Set装着四条有用数据A、B、C、D。其中A马上会再次访问。预取器预测将访问P、Q、R、S，于是提前把这四条新Line都装入同一个Set。

如果每次填充都被视为“最近使用”（MRU），那么P、Q、R、S会逐步挤掉A、B、C、D。等到Demand真正访问A，原来的Hit可能变成Miss。

~~~text
4-way Set，初始MRU→LRU：A B C D

预取 P  → P A B C    （D被逐出）
预取 Q  → Q P A B    （C被逐出）
预取 R  → R Q P A    （B被逐出）
预取 S  → S R Q P    （A被逐出）
Demand A → Miss
~~~

这里最重要的是：**预取填充可以改变替换状态，即使预取数据未来真的会被使用。**

预取有三类可能的成本：额外下级带宽、MSHR/队列占用、Cache污染。命中率只观察其中一个结果，无法完整反映性能。

## 二、符号假设：从Cache容量到“下一次使用距离”（2分钟）

本讲默认普通相干可缓存内存、组相联Cache、64B Line、每组A个Way；对具体Trace采用**真LRU**。所有地址都是不同物理Line，除非明确说明相同。忽略多级Cache的特殊旁路和压缩，计算性能时明确给出独立的理想化假设。

定义：

| 符号 | 含义 |
|---|---|
| \(A\) | 每组Way数 |
| \(D(x)\) | 同一块x连续两次访问之间，访问过的**不同同组块**数量（Reuse Distance） |
| \(M\) | Demand Miss数 |
| \(N\) | 退休指令数 |
| \(MPKI=1000M/N\) | 每千条退休指令的Demand Miss数 |
| \(L\) | 一次Miss的额外服务延迟 |
| \(u\) | 每次Miss延迟中不能被OoO/MLP隐藏的平均比例（教学模型） |

**真LRU的堆栈性质**：同组中，若某Line先前存在且两次访问之间的不同其他Line数量为D，则第二次访问命中的条件是

\[
\boxed{D<A}
\]

若 \(D\ge A\)，则原Line已被逐出，会Miss。这个结论依赖真LRU、同一Set、没有额外预取/相干无效化/其他隐式访问；对于伪LRU和RRIP，不能照搬为精确命中判据。

**例题**：4-way Set中，在两次访问A之间只经过B、C、D三个不同同组Line，则 \(D(A)=3<4\)，A可能保留并命中；若中间又引入E，令不同同组块数达到4，则在真LRU下A会被逐出。

## 三、LRU的扫描污染及替换策略为什么要“预测未来”（2分钟）

LRU（Least Recently Used）总是优先逐出最近最久未使用的Line。这在强时间局部性下通常合理，但可能被流式扫描污染：扫描Line仅使用一次，却不断以MRU地位挤掉会重复使用的热点Line。

考虑4-way Set，初始A、B、C、D已在Cache，且A刚刚被访问、为MRU。之后Demand依次扫描E、F、G、H，再访问A。按LRU：

~~~text
初始：     A B C D
E Miss：  E A B C
F Miss：  F E A B
G Miss：  G F E A
H Miss：  H G F E
A Miss：  A H G F
~~~

扫描的4个Line全为一次性访问，却让A失去位置。

从算法角度看，替换算法不是只决定**Victim**，还决定**新Line的插入位置**以及Hit如何更新状态。更好的策略可能为一次性扫描请求赋予较低优先级。

## 四、LIP、BIP、DIP：改变插入位置就能改变结果（2分钟）

传统LRU把新Line插入MRU。LIP（LRU Insertion Policy）把新Line插入LRU附近，但Hit依然提升为MRU。这样，扫描流中新来的Line很容易在下一次插入时被替换，而被反复访问的热点更容易保留。

例如一个2-way Set，初始MRU→LRU为A、B，刚刚Hit A。随后扫描C、D、E、F，最后Demand A：

- 传统MRU插入的LRU：新Line持续挤走旧Line，A最终可能Miss。
- LIP（新Line低优先级插入）：没有再次被使用的扫描Line优先被逐出，A可以在这个教学Trace中保留并Hit。

但LIP也有反例：如果新Line很快会再次被用到，总是放在LRU位置可能导致它尚未获得第二次访问就被逐出。

BIP（Bimodal Insertion Policy）大部分时候采取低优先级插入，少数时候插入MRU；DIP（Dynamic Insertion Policy）通过采样/策略选择在不同插入方案之间自适应。Qureshi等人在ISCA 2007研究了这组方法：

[Adaptive Insertion Policies for High Performance Caching](https://doi.org/10.1145/1273440.1250709)

**重要边界**：低优先级插入和绕过Cache（Bypass）不同。前者仍占一个Way，后者可能完全不放入这一层。

## 五、RRIP：预测“多久后再次访问”，而非只看刚才（3分钟）

RRIP（Re-reference Interval Prediction）为Cache Line存储一个有限位宽的重用距离预测值RRPV。数值越大表示预测在更远未来才被重新访问，因而越容易被驱逐。

以2-bit SRRIP教学实现为例：

- RRPV范围：0、1、2、3；
- 新Line通常以RRPV=2插入（不是最近最应该保留）；
- Hit时将该Line的RRPV设为0；
- 选择Victim时，找RRPV=3的Line；如没有，则对候选行的RRPV饱和加1，直到存在3；
- 逐出选中的Line，新Line再插入。

~~~mermaid
flowchart TD
  N["新Line / Prefetch候选"] --> I["设置插入优先级 RRPV=2"]
  I --> C["Set已满，需要Victim"]
  C --> Q{"存在RRPV=3?"}
  Q -->|是| V["选择允许替换的候选Line"]
  Q -->|否| A["候选RRPV饱和递增"]
  A --> Q
  V --> R["替换并填充"]
  R --> H["以后Demand Hit → RRPV=0"]
~~~

**为什么它更能抵抗扫描？** 一次性Line通常仍保持较远重用预测；真正被重复访问的Line通过Hit获得RRPV=0，较不容易成为Victim。但这不是普遍最优保证，某些访问模式下LRU可能更好。

RRIP论文中的SRRIP、DRRIP提出以很小的每行状态逼近未来重用趋势，而非只记录最近一次使用：[High Performance Cache Replacement Using RRIP, ISCA 2010](https://doi.org/10.1145/1815961.1815971)。

进一步，SHiP用PC、内存区域等Signature学习某类访问是否常常会再次命中，将预测用于插入决策：[SHiP, MICRO 2011](https://doi.org/10.1145/2155620.2155671)。

## 六、预取和替换必须协同：Demand与Prefetch未必同权（2分钟）

如果把所有预取Line都以最高优先级插入LLC，即使预取地址预测准确，也可能污染热点Demand数据。

一种教学设计是**Prefetch-aware Insertion**：

~~~text
Demand Miss → 根据复用历史插入（正常或较高保留优先级）
Prefetch Fill → 默认较低保留优先级
Prefetch Line首次被Demand命中 → 提升优先级
长期未使用的Prefetch Line → 优先成为Victim
~~~

但是无条件压低预取优先级也会失败：例如有稳定流且下一级延迟很高，预取提前很久到达，却因低优先级在Demand到来前被逐出。

因此替换策略需要同时评估：

\[
\boxed{\text{预取及时性}\;+\;\text{再次使用概率}\;+\;\text{Cache占用}\;+\;\text{下级资源成本}}
\]

一种更保守的方法是按PC/地址区域统计预取线被Demand使用的概率、Late Prefetch数量以及污染诱发Miss，再决定插入优先级或是否Bypass。真实控制器还需考虑硬件面积、预测错误与多租户公平性。

## 七、为什么MPKI更低，IPC却可能更差？（2分钟）

上节课强调AMAT不是CPI。今天用一个简化性能账本定量证明。

设没有额外暴露Miss等待时的基线为 \(CPI_0\)。每千条指令有 \(MPKI\) 次Demand Miss，每次额外延迟L，平均只有比例u进入程序关键路径（其余被独立计算或MLP隐藏）。

则在**暴露延迟彼此独立、未重复计费，且工作量和指令数固定**的教学模型中：

\[
\Delta CPI=\frac{MPKI}{1000}\,uL
\]

\[
\boxed{CPI=CPI_0+\frac{MPKI}{1000}uL}.
\]

举例：方案A的MPKI=12，u=0.30；方案B降低到MPKI=8，但因为MSHR竞争和关键路径变化，u=0.70。取L=100周期、共同 \(CPI_0=1\)：

\[
CPI_A=1+0.012\times0.30\times100=1.36
\]

\[
CPI_B=1+0.008\times0.70\times100=1.56.
\]

方案B的Miss更少，却执行得更慢。注意u不是一个无条件固定的硬件常数，尤其不能从单个Miss的物理延迟直接推出。

**另一个反例**：替换策略提高LLC命中率，却使Hit Time增加或导致更大的下层带宽竞争，最终IPC也可能下降。

实验中应至少同时报告：Demand MPKI、Prefetch发出/使用/晚到、Dirty Writeback、下级传输字节、MSHR Full周期、ROB/LQ等待、IPC和固定工作量的完成时间。

## 八、共享LLC：多核干扰与公平性（2分钟）

两个不互信的程序A和B即使各自L1都正常，也可能在共享LLC中竞争Way、替换状态和内存带宽。B的大规模扫描或激进预取可以逐出A的热点Line，使A的P99延迟上升。

~~~mermaid
flowchart LR
  A["Core A：重用热点工作集"] --> L["Shared LLC"]
  B["Core B：扫描 + 预取"] --> L
  L --> E["竞争Set/Way和替换状态"]
  E --> M["额外Miss与下级流量"]
  M --> P["A或B的IPC/P99可能退化"]
~~~

一种常见的系统级工具是按服务类别分配LLC容量，例如Intel RDT中的Cache Allocation Technology（CAT）。它可以帮助缓解一部分共享LLC竞争，但不能把它当成DRAM带宽、互连或所有侧信道的完全隔离。[Intel Resource Director Technology](https://www.intel.com/content/www/us/en/architecture-and-technology/resource-director-technology.html)

### 多核不能只看总Miss或总IPC

定义每个程序独占运行时的IPC为 \(IPC_i^{alone}\)，并发时为 \(IPC_i^{shared}\)。在有意义的相同工作负载及稳定测量条件下，常用：

\[
\boxed{WS=\sum_i\frac{IPC_i^{shared}}{IPC_i^{alone}}}
\]

称为Weighted Speedup；也可用最差减速倍数：

\[
\boxed{S_{\max}=\max_i\frac{IPC_i^{alone}}{IPC_i^{shared}}}.
\]

数值例题：A独占IPC=2.0、并发IPC=1.6；B独占IPC=1.5、并发IPC=0.75。

\[
WS=\frac{1.6}{2.0}+\frac{0.75}{1.5}=1.3,\qquad
S_{\max}=\max(1.25,2)=2.
\]

尽管系统有一定总吞吐能力，B比独占时慢了2倍。**优化平均性能，不代表改善最差租户。** IPC归一化指标也不能代替服务级P99和完成时间的真实测量。

## 九、Cache一致性不等于TSO内存模型（1分钟）

最后回到容易混淆的跨核可见性。

~~~text
初始：X=Y=0
Core 0: STORE X=1; r0=LOAD Y
Core 1: STORE Y=1; r1=LOAD X
~~~

在SC下，两个Load都读取0会与保留程序顺序的全局全序矛盾；但在允许Store→不同地址Load放松的TSO中，两核Store可暂存在各自Store Buffer中，Load读到对方尚未传播的旧值，所以 \((r0,r1)=(0,0)\) 可以是合法架构结果。

注意三个不同性质：**替换策略**决定哪条Cache Line留下来；**一致性协议**保证同一物理地址的缓存副本有正确的数据传播；**内存模型**规定跨核操作可以产生什么架构观察顺序。

\[
\boxed{\text{Store从ROB退休}\ne\text{Store已对其他核全局可见}}
\]

调整LRU/RRIP、预取策略或LLC分区，不会因此任意改变TSO所允许的结果。Cache Miss增加也不自动表示一致性协议失效。

## 十、本课总结与下一讲（1分钟）

今天的三个核心结论是：

\[
\boxed{\text{真LRU同组重用命中：}D<A}
\]

\[
\boxed{\Delta CPI\approx(MPKI/1000)\,uL\quad\text{（限定模型）}}
\]

\[
\boxed{\text{多核需要同时评估吞吐、最差减速与延迟}}
\]

**下一讲：第28课（2026年11月16日，第4周第7节）**是四周阶段考核，将综合定量性能、OoO/ROB、投机恢复、Cache/TLB/MLP、预取与替换；第5周再正式系统学习MESI、SC/TSO和NUMA。

---

# 十一、四级分级测评（总分100分）

首次发放仅提供题目与可选提示，**不公布标准答案和解析**。Lv1—Lv3可客观判分，Lv4按Rubric进行人工或自评。

### Lv1｜预取插入与替换策略辨析（15分，单选，预计2分钟）

某4-way LLC Set已有频繁复用的Demand Line。一个流式预取器预测下一批Line，但这些新Line未来是否会被使用尚不确定。下列哪项最严谨？

**A.** 任何Prefetch Fill都应无条件设为MRU，因为命中率一定提高。
**B.** 只要采用物理Tag，预取就不可能污染Cache。
**C.** 可以结合预取使用反馈对新预取Line赋予较低的初始保留优先级，并在被Demand使用时提升；仍需权衡提前逐出的风险。
**D.** 将新Line低优先级插入就等价于彻底绕过该层Cache，不会占据Way。

*可选提示：区分“已填入但保留优先级低”与“没有分配该层Line”。*

### Lv2｜MPKI、暴露延迟和新CPI（20分，数值，预计4分钟）

教学性能模型：固定工作量、指令数不变，基础 \(CPI_0=0.90\)，单次需求Miss额外延迟80周期，新增暴露延迟完全不重叠。某新替换策略使 \(MPKI=9\)，但由于关键路径及资源竞争，平均每次Miss只有70%的额外延迟被暴露，其余由MLP隐藏。

**问题：新策略的总CPI是多少？** 填写数值，单位cycles/instruction。

*可选提示：把MPKI换算成Misses/instruction，再乘暴露的平均周期，最后加基础CPI。*

### Lv3｜Reuse Distance、RRIP和多核边界（25分，多选，预计5分钟）

在题中明确的组相联、真LRU或标准2-bit SRRIP教学规则下，选择所有正确说法。

**A.** 对于真LRU的A-way Set，某Line两次访问间若出现至少A个不同的同组其他Line，且没有额外隐式访问，则再次访问原Line会Miss。
**B.** 预取准确率较高就保证它不会造成Cache污染，也保证全部Demand的关键路径等待减少。
**C.** 标准SRRIP在Line被Hit时可将其RRPV设置为0，从而提高其近期保留优先级。
**D.** 共享LLC的总Miss减少，仍需分别检查多租户IPC、最差减速或尾延迟，才能判断公平性。
**E.** Intel CAT只要划分LLC Way，就保证共享DRAM带宽、NoC和全部侧信道被完全隔离。
**F.** 在允许Store Buffering的TSO中，两个核各自Store不同地址后Load对方地址得到(0,0)可以是合法结果，不等于Cache一致性失效。

*可选提示：把替换策略、预取时机、多核资源争用以及架构内存模型分开判断。*

### Lv4｜污染Trace、CPI反事实与多核公平性（40分，开放推导，预计10—12分钟）

统一教学情境：一颗双核CPU共享一个4-way LLC Set，Line大小64B，Set采用真LRU。开始时该Set的MRU→LRU为A、B、C、D，且这些都是Demand热点Line。预取器按P、Q、R、S依次请求四条此前不在Cache的不同Line，且所有Line都映射到这一Set。

**A｜两种预取插入策略的Trace（12分）**

方案X：每条预取Line都实际填入Set并插到MRU；随后需求访问A、S。逐项写出P、Q、R、S及两次Demand访问后的MRU→LRU状态，Demand Hit/Miss和被驱逐的Line。

方案Y：假设有一个理想的使用预测器，直接绕过P、Q、R，仅将S作为正常MRU填充，随后需求也按A、S访问。求两次Demand的Hit/Miss，并解释为什么Y是用于理解污染的Oracle，不能宣称实际硬件可以提前完美知道。

**B｜MPKI与CPI反事实（10分）**

两个替换方案执行相同100万条退休指令，基础CPI为1.00，额外Miss延迟为100周期、无重复计费。方案X的Demand MPKI为8、暴露比例为0.40；方案Y的Demand MPKI降至5、暴露比例上升到0.80。求两个CPI，判断更低MPKI是否必然更快，并解释至少一种暴露比例变化原因。

**C｜多核公平性指标（10分）**

Core A上的任务独占IPC为2.0、并发IPC为1.6；Core B独占IPC为1.5、并发IPC为0.75。计算Weighted Speedup及最大Slowdown，说明若目标为在线服务P99，应怎样设计对照测试及监测。

**D｜协议边界（8分）**

区分替换、预取、Cache一致性和内存模型。解释Dirty Line未写回DRAM时另一核为什么仍可能读到新值；解释Store从ROB退休为什么不等于全局可见；给出经典TSO Store Buffering的(0,0)是否允许及理由。

*可选提示：A按MRU→LRU逐次更新，不要漏掉需求A引发的替换；B对各方案分别使用 \(CPI=CPI_0+MPKI\times u\times L/1000\)；C使用相对独占IPC；D把数据版本、传播时机和架构允许结果拆开。*

---

## 十二、作答与评分

按如下格式提交即可：

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

总分100，Lv1—Lv4分别为15、20、25、40分。≥80分按既定课号进入下一专题；60—79分补一例LRU/RRIP替换Trace；低于60分重点回顾第22、25、26、27课后再练。**补练不改变第28课阶段考核的日期和编号。**
