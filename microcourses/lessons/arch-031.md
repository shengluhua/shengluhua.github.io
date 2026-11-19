---
title: "第31课｜SC、TSO与内存序：Store Buffering、Fence与Happens-before"
track: arch
number: 31
date: 2026-11-19
week: 5
minutes: 18
kind: full
summary: "以Store Buffering为中心，利用事件偏序证明SC与TSO允许结果的差异，分析单侧和双侧Fence、Store-to-Load Forwarding，以及release/acquire建立Happens-before的条件和语言层边界。"
tags: [SC, TSO, memory-model, store-buffer, fence, happens-before, release-acquire, litmus-test, MESI, ordering]
diagram: mermaid
---

# 计算机体系结构 · 第31课
## SC、TSO与内存序：Store Buffering、Fence与Happens-before

**2026年11月19日｜第5周第3节｜讲授约18分钟（测评另计）**

上一讲讨论了MESI的Invalidate ACK、瞬态和独占写权限。今天要正式区分：**相干协议确保同一地址的数据版本正确，但程序在多个地址上的跨核观察顺序由内存模型决定。**

本课要解决的不是再背一遍“TSO允许(0,0)”，而是学会**画约束图、构造合法执行、判断单侧与双侧Fence、分析release/acquire何时建立同步**。贯穿全课的纠错是：

> Store从ROB按序退休、取得M写权限、某次写入全局可见、脏行写回DRAM，是四个不同概念，不能互相替代。

## 一、动机：Cache都相干了，为什么还需要内存模型？（2分钟）

设两个核的私有L1都遵守MESI。核A写X，核B之后需要读取X时，相干系统能够在正确的协议时机提供最新值。但是，程序还会同时访问Y、Z等不同地址。问题变成：**如果两个核都按源码先写后读，别人也必须看到这个先后关系吗？**

相干性（coherence）关注同一物理地址的读写版本和所有权；一致性模型（memory consistency model）规定不同地址、不同线程之间允许哪些观察顺序。

~~~text
机制层次                 回答的问题
MESI / Directory          谁持有Line？谁可以写？旧副本如何失效？
Store Buffer / OoO        指令怎样提前执行、写入何时向外传播？
SC / TSO / ISA模型         哪些寄存器读取结果在架构上合法？
C++原子 / happens-before    哪些跨线程同步关系在语言层被保证？
~~~

这些层次有关联，却不能简单等同。

## 二、符号与假设：讨论的是哪一种“先后”？（2分钟）

本课分析普通、可缓存、相干的对齐内存访问，X和Y是不同物理地址，初始值均为0，没有其他写者；所有列出的Load、Store在教学模型中都视为原子操作。暂不讨论非缓存设备、混合大小访问、非时间性Store和非对齐撕裂访问。

定义四个事件：
- \(S_X\)：Core 0写X=1；
- \(L_Y\)：Core 0读取Y，结果记为 \(r_0\)；
- \(S_Y\)：Core 1写Y=1；
- \(L_X\)：Core 1读取X，结果记为 \(r_1\)。

记 \(a\prec b\) 为**选定抽象模型中**操作a必须先于b的可观察/全局顺序。不要把它直接理解为“a的指令先进入ROB”。

定义关系：\(\mathrm{po}\)为程序顺序；\(\mathrm{rf}\)为Load读自哪个Store；\(\mathrm{co}\)为同一地址上的写入顺序；\(\mathrm{fr}\)为读到旧版本后相对于后续写入的顺序。对于本例的初始写W0，如果 \(L_Y\)读到Y=0且没有其他写者，则要求 \(L_Y\prec S_Y\)；X同理。

## 三、SC：保留每核程序顺序的单一全局交错（2分钟）

顺序一致性（Sequential Consistency, SC）要求存在一个对所有内存操作的全序，既保留每核程序顺序，又使各Load读取在这个全序中该地址最近的写入值。

经典Store Buffering（SB）程序：

~~~text
初始 X=Y=0

Core 0                   Core 1
S_X: STORE X=1           S_Y: STORE Y=1
L_Y: r0=LOAD Y           L_X: r1=LOAD X
~~~

程序顺序给出 \(S_X\prec L_Y\)，\(S_Y\prec L_X\)。若要求两核均读0，则还需要 \(L_Y\prec S_Y\) 和 \(L_X\prec S_X\)。串起来：

\[
\boxed{S_X\prec L_Y\prec S_Y\prec L_X\prec S_X}
\]

严格全序不允许这样的环。因此SC**禁止** \((r_0,r_1)=(0,0)\)。其他三个结果(0,1)、(1,0)、(1,1)均可由适当交错产生。

~~~mermaid
flowchart LR
    SX["S_X 写X"] -->|"Core 0程序顺序"| LY["L_Y 读0"]
    LY -->|"读旧值要求"| SY["S_Y 写Y"]
    SY -->|"Core 1程序顺序"| LX["L_X 读0"]
    LX -->|"读旧值要求"| SX
~~~

这是一种**证明不可达结果**的方法，而不是通过测试很多次“没有观察到”来代替证明。

## 四、TSO：FIFO Store Buffer如何使(0,0)合法？（3分钟）

用一个教学版x86-TSO操作模型解释：每核有FIFO Store Buffer；普通Store可先进入本核缓冲，稍后按FIFO顺序传播到相干的共享内存视图；Load优先从本核缓冲中最近的同址Store转发，否则读当前共享内存视图。抽象中的Store传播不要求物理DRAM写回完成。

~~~text
时刻    Core 0                               Core 1
t0      X=1进入本核Store Buffer              Y=1进入本核Store Buffer
t1      Load Y 从共享视图读0                  Load X 从共享视图读0
t2      X=1随后对其他核可见                   Y=1随后对其他核可见
~~~

此时 \((r_0,r_1)=(0,0)\) 允许。两条Store在各自核**程序顺序上仍是先Store后Load**，但在跨核可观察顺序中，较年轻的**不同地址Load**可以在较老Store尚未传播时完成。

需要小心：**TSO不是允许任意重排。**
- 同核Store通常按FIFO传播，不能任意让后面的Store越过前面的Store。
- 同核较年轻Load读取与缓冲中较老Store**相同地址**时，必须遵守正确的数据来源，可Store-to-Load Forwarding。
- TSO的抽象全局写入传播与Dirty Line写回DRAM不是同一事件。

例：初始X=0，本核执行“Store X=7；Load X”。如果Store仍在缓冲中，Load不应该仅因为内存数组仍写着0就返回0；它应从适用的最近同址缓冲Store获得7。另一个核在Store传播前可能仍读0。两者不矛盾。

权威参考：Sewell等，**x86-TSO: A Rigorous and Usable Programmer’s Model for x86 Multiprocessors**（Communications of the ACM，2010）：https://www.cl.cam.ac.uk/~mom22/cacm10.pdf 。

## 五、单侧Fence为何不够，双侧Fence为何有效？（3分钟）

在本节x86-TSO抽象中，FULL FENCE（例如适用的x86 MFENCE）保证同核位于其前面的Store在后面的Load执行所需观察之前完成相应全局传播。它是内存顺序约束，不等于把Dirty Line强制写回DRAM。

### 方案A：仅Core 0使用完整Fence

~~~text
Core 0                     Core 1
STORE X=1                  STORE Y=1
FULL FENCE                 （没有Fence）
r0=LOAD Y                  r1=LOAD X
~~~

Core 0保证 \(S_X\prec L_Y\)，但Core 1仍可让 \(L_X\)早于其缓冲中 \(S_Y\)的全局传播。构造合法观察顺序：

\[
\boxed{L_X\prec S_X\prec L_Y\prec S_Y}
\]

其中 \(L_X\)读到X旧0，\(L_Y\)读到Y旧0。Core 1的Store指令实际上先进入自己的缓冲，最后才传播。因此**单侧Fence仍可能出现(0,0)**。

### 方案B：两侧均使用完整Fence

~~~text
Core 0                     Core 1
STORE X=1                  STORE Y=1
FULL FENCE                 FULL FENCE
r0=LOAD Y                  r1=LOAD X
~~~

两侧都强制Store→Load的跨核顺序边，因此回到SC证明中的闭环，无法同时读0。

| SB配置 | TSO下(0,0)是否允许？ | 原因 |
|---|---|---|
| 两侧都无Fence | 允许 | 两个Store可暂存在各自缓冲 |
| 仅Core 0有完整Fence | 允许 | Core 1仍可延迟自身Store传播 |
| 两侧均有完整Fence | 禁止 | 两条Store→Load边共同构成矛盾环 |

**反例：** 不能将编译器Barrier、Load-only Fence、Store-only Fence和完整Store→Load Fence无条件视作同一种指令。具体用法取决于ISA、语言和所需关系。Linux内核文档特别区分了读、写及全内存屏障：https://docs.kernel.org/core-api/wrappers/memory-barriers.html 。

## 六、Happens-before：发布/订阅不是简单“有Fence就行”（3分钟）

到这里我们一直讨论**硬件层的普通Load/Store执行模型**。实际写C++并发程序时，还必须尊重语言内存模型。

考虑发布数据：

~~~cpp
// 初始 data=0, flag=false
// Thread 0
data = 42;
flag.store(true, std::memory_order_release);

// Thread 1
if (flag.load(std::memory_order_acquire)) {
    int x = data;
}
~~~

假设data是普通非原子变量，且仅有这一写者、读者在上述同步条件成立之后才读取data，没有其他冲突访问。

如果Thread 1的Acquire Load**确实读到Thread 0的Release Store发布的true**，则：

\[
\text{写data}
\xrightarrow{\rm sequenced\!-\!before}
\text{Release flag}
\xrightarrow{\rm synchronizes\!-\!with}
\text{Acquire flag}
\xrightarrow{\rm sequenced\!-\!before}
\text{读data}.
\]

因此有：

\[
\boxed{\text{写data}\xrightarrow{\rm happens\!-\!before}\text{读data}}
\]

这建立了正确发布关系，后续读取可以获得已发布的42。C++中的Happens-before是**由语言规则、程序顺序和同步关系组合出的偏序**；不是某个物理Store抵达DRAM的时间戳。

**关键反例：如果Acquire Load读到旧false，它没有通过这个Release Store建立synchronizes-with。** 不能因为程序里写了release和acquire，就声称两线程的所有操作一定同步。

另一个关键边界：C++中两个线程对同一普通非原子变量并发冲突访问、又缺少有效Happens-before，可能构成数据竞争并导致未定义行为。不能拿“硬件TSO会这样”去替代C++语言层的合法性证明。做硬件Litmus时应使用汇编、明确语义的原子操作或符合目标语言/工具的测试框架。

参考C++ memory_order： https://en.cppreference.com/w/cpp/atomic/memory_order 。

## 七、再看一个反例：Message Passing与SB不能一概而论（1分钟）

在教学x86-TSO中，若Core 0依次执行Store data=42、Store flag=1，Core 1依次执行Load flag、Load data，且没有其他写入，并且Core 1真的读到flag=1，则FIFO Store传播与Load顺序会约束随后data读取看到正确已发布值。

但这不证明任意语言中的普通共享变量程序安全；也不代表Store Buffering程序只靠两侧各自的Release Store和未匹配到发布值的Acquire Load就必然禁止(0,0)。

**跨线程同步必须精确指出哪条Load读到了哪次Store，不能只写“用了acquire/release”。**

## 八、如何做可靠的Litmus实验？（1分钟）

建议把“允许/禁止”的问题写成很短的Litmus Test，并用专门模型检查工具穷举允许结果。Linux Kernel Memory Model提供herd7的测试说明：https://github.com/herd/herdtools7 。

硬件实测要固定线程亲和性、明确使用的原子/汇编、编译器选项、循环次数，记录观察到的结果和频次。**观察到一个结果，可作为模型与实现关系的证据；千万次未观察到某结果，不是严格禁止的数学证明。**

比较Fence的性能代价时，还应区分Store Buffer排空、额外序列化、Cache-to-Cache通信、负载竞争、实际完成时间；不应把一次Fence的测量周期当成所有程序的固定常数。

## 九、总结与下一讲（1分钟）

今天的四条判定法：

1. **SC**：尝试构造保留每核程序顺序的全局全序；若出现严格顺序环，则该结果不允许。
2. **TSO**：考虑每核FIFO Store Buffer，以及相同地址的本核转发；不要把架构可见等同于DRAM写回。
3. **Fence**：检查它实际禁止了哪一类重排；单侧和双侧的跨线程效果可以不同。
4. **Happens-before**：Release/Acquire必须有正确的读自关系才能建立跨线程同步；语言层数据竞争必须单独检查。

下一讲是**第32课（2026年11月20日，第5周第4节）《从SC/TSO到弱内存模型：Load Buffering、Message Passing与ARM/RISC-V Fence》**。将进一步比较不同体系结构允许结果，并系统练习Litmus执行图。

---

# 十、四道分级测评（100分）

本次首次发布**不公布标准答案、客观题正确选项、解析或开放题参考思路**。前3题客观判分，第4题采用分项Rubric进行人工/审阅式评分；不声称开放题已自动判分。

### Lv1｜Store Buffer与Cache Coherence的概念边界（15分，单选，预计2分钟）

两个核的Cache严格遵守MESI，但在x86-TSO中仍出现经典SB的(r0,r1)=(0,0)。下列哪种解释最严谨？

A. 说明MESI失效，因为只要Cache相干，所有不同地址的读写都必须符合SC。

B. 说明两个Core必然错误地同时持有同一Line的M状态。

C. 可以是合法的内存模型结果：两个不同地址的Store尚在各自缓冲中，而后续Load已完成；同一地址的一致性并未被破坏。

D. 说明每个Store已经完成DRAM回写，只是另一核的TLB不正确。

**可选提示（不含答案）：**先区分每条Line的所有权，以及两个不同地址的跨核观察顺序。

### Lv2｜Store-to-Load Forwarding与时间线编码（20分，数值，预计4分钟）

教学TSO执行Trace：X初值0，只有Core0会写X。t=0 Core0把STORE X=1放入本核Store Buffer；t=1 Core0执行r0=LOAD X；t=2 Core1执行r1=LOAD X；t=3 Core0执行FULL FENCE并等待；t=5 Core0的Store传播到全局相干视图，Fence完成；t=6 Core1执行r2=LOAD X。所有Load按给定时刻完成，Store未合并，r0、r1、r2均为0或1。计算十进制编码E=r0+2*r1+4*r2（相当于把三个Load结果当作不同权重的位）。只填写E。

**可选提示（不含答案）：**本核同址Load可以从未传播的Store Buffer转发；另一核在传播前后分别观察。然后按权重编码。

### Lv3｜单侧/双侧Fence与Release-Acquire边界（25分，多选，预计5分钟）

在两个地址X、Y初始为0、无其他写者、普通相干x86-TSO以及题目所指明的C++原子语义下，选择所有成立的说法。

A. 在经典Store Buffering中，只给Core0在Store与Load之间加完整Fence，就保证(r0,r1)=(0,0)不可能出现。

B. 经典Store Buffering中两侧在Store与Load之间都加入完整Store→Load Fence，能够禁止两个Load都读取旧0。

C. x86-TSO抽象中的Store可暂留FIFO写缓冲，较年轻的同址Load可经Store-to-Load Forwarding读取本核最新的有效缓冲写入。

D. C++中只要一线程做release store，另一线程做acquire load，即使acquire读到了旧值，也必然与那次release建立synchronizes-with。

E. 缓存行处于M状态本身就证明当前核所有已退休Store均已完成全局传播且DRAM已经回写。

F. 在没有其他冲突写入的正确发布程序中，acquire load若读到相应release store发布的值，可形成synchronizes-with，并通过happens-before约束此前的数据发布。

**可选提示（不含答案）：**逐条确认Fence插入的位置、相同地址转发、以及Acquire究竟读自哪次Release；不要用Cache状态替代语言同步。

### Lv4｜内存序证明、C++发布与性能设计（40分，开放推导，预计10—12分钟）

统一条件：普通可缓存相干内存，X、Y初值0；每核使用符合题意的原子Load/Store，没有其他写者。

**A｜新Litmus：Load Buffering（12分）**  
Core0执行“r0=LOAD X; STORE Y=1”，Core1执行“r1=LOAD Y; STORE X=1”。在SC与本课FIFO Store Buffer的TSO抽象下，判断(r0,r1)=(1,1)是否合法，画出约束环，并与经典SB的(0,0)比较。回到SB时，再构造只有Core0插入完整Fence仍能产生(0,0)的可见顺序。

**B｜发布、订阅与语言边界（10分）**  
写者执行“data=42; flag.store(true, release)”，读者先执行“ok=flag.load(acquire)”，随后若ok为true就读data。说明ok=true且读自该release时的sequenced-before/synchronizes-with/happens-before链；如果ok=false却仍无条件读取普通非原子data，会有什么风险？

**C｜Fence性能账本（8分）**  
固定基线运行时间3,000,000周期；一个满足正确性要求的方案增加40,000次完整Fence，每次额外暴露18周期、彼此不重叠。求新增周期、总周期、相对基线的运行时间增幅；解释为什么语义不充分的单侧Fence不能仅因便宜就替代正确方案。

**D｜验证实验与可见性（10分）**  
设计SB的无Fence、单侧Fence、双侧Fence三组Litmus测试，说明如何用模型检查和硬件实测报告允许结果、环境配置与性能；解释为什么“未观察到(0,0)”不等于模型禁止。最后区分ROB退休、获得M权限、某个Store全局可见、Dirty最终写回DRAM。

**可选提示（不含答案）：**A通过有向边能否构成环判断，单侧可让未Fence一侧的Load先于其Store对外传播；B找明确的读自关系；C先计算Fence增加的总周期；D注意“未观测到”不等于逻辑上禁止。

---

## 十一、作答及评分方式

请按“Lv1：选项；Lv2：数值；Lv3：所有选项；Lv4：A/B/C/D”回复。总分15+20+25+40=100。得分≥80继续既定第32课；60—79补一个跨核时序构造；低于60重点复习第24、29—31课及第28课综合考核。**补练不改变既定课程编号和日期。**

参考来源：[x86-TSO正式模型（Sewell等，2010）](https://www.cl.cam.ac.uk/~mom22/cacm10.pdf)；[Linux内存屏障文档](https://docs.kernel.org/core-api/wrappers/memory-barriers.html)；[C++ memory_order](https://en.cppreference.com/w/cpp/atomic/memory_order)；[herdtools7](https://github.com/herd/herdtools7)。
