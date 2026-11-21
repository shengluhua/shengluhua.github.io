---
title: "第33课｜IRIW、多副本原子性与跨核传播：为什么两个读者可能看到不同顺序？"
track: arch
number: 33
date: 2026-11-21
week: 5
minutes: 18
kind: full
summary: "通过四核IRIW推导读侧排序与MCA组成的有向环，辨析缓存一致性、写传播与弱序读重排，比较现代Armv8-A、RVWMO及TSO，巩固Store Buffer可见性。"
tags: [IRIW, coherence, consistency, MCA, memory-model, Armv8-A, RVWMO, TSO, barrier, litmus]
diagram: mermaid
---

# 计算机体系结构 · 第33课
## IRIW、多副本原子性与跨核传播：为什么两个读者可能看到不同顺序？

**2026年11月21日｜第5周第5节｜预计18分钟（测验另计）**

第31课分析了TSO Store Buffering，第32课学习了LB/MP与Arm、RISC-V的屏障。今天把两个核心扩展到四个，讨论一个更难的问题：

> **X和Y是两个不同物理地址，两个核分别写入它们。另两个核是否可以看到“X先变新”和“Y先变新”这两种互相矛盾的先后顺序？**

回答必须同时检查**同地址相干、写入的多副本原子性、读者自己的Load→Load保序**，不能把三个概念合并。

## 一、动机：四核IRIW（约2分钟）

IRIW（Independent Reads of Independent Writes）：两名写者各写一个地址，两名读者以相反次序读取。

~~~text
初始：X=Y=0，X/Y位于不同Cache Line

Writer0             Writer1          Reader A          Reader B
STORE X=1           STORE Y=1        a=LOAD X          c=LOAD Y
                                      b=LOAD Y          d=LOAD X

关注目标：a=1, b=0, c=1, d=0
~~~

读者A看到“X新、Y旧”，仿佛X先写；读者B看到“Y新、X旧”，仿佛Y先写。单纯检查每个地址的值都合法还不够，必须判断能不能找到满足全部约束的**共同内存顺序**。

## 二、符号与前提：先讲清比较什么（约2分钟）

所有访问对齐、原子且普通可缓存；X/Y不同地址，初始均0，只有各自一个后续写；读者和写者不是同一核。没有设备访问、DMA、同址Store转发、第三方写或额外依赖。

记 \(W_X,W_Y\) 为写入，\(R_{AX},R_{AY}\) 和 \(R_{BY},R_{BX}\) 为两读者的Load。\(u\prec v\) 表示在当前讨论的**共同逻辑内存顺序**中u先于v，不是ROB里的执行或退休时间。以下证明的附加前提是写入MCA，而且A/B两名读者的两次Load分别有R→R顺序保证。

**三个容易混淆的属性：**

| 属性 | 保证什么 | 单独不能保证什么 |
|---|---|---|
| Coherence | 某地址/Line的副本与写入版本相干 | X和Y两笔写对所有核有统一先后 |
| MCA（多副本原子性） | 写入对写者以外的观察者有一致的逻辑可见点 | 两条独立Load一定按程序顺序被观察 |
| R→R Ordering | 一个读者两次Load的内存顺序被保留 | 不同写入一定对所有核一起传播 |

“Single-copy atomic”（单次访问不撕裂）也不等于“Multi-copy atomic”（写入对多观察者的传播语义）。这些概念彼此不同。

## 三、核心推导：有序IRIW为什么禁止？（约3分钟）

目标是A读X=1、Y=0，B读Y=1、X=0。在MCA的共同逻辑顺序下：

- A读到X的新1：\(W_X\prec R_{AX}\)。
- A两次Load保序：\(R_{AX}\prec R_{AY}\)。
- A读到Y的旧0：\(R_{AY}\prec W_Y\)。
- B读到Y的新1：\(W_Y\prec R_{BY}\)。
- B两次Load保序：\(R_{BY}\prec R_{BX}\)。
- B读到X的旧0：\(R_{BX}\prec W_X\)。

将六条边串起来：

\[
\boxed{W_X\prec R_{AX}\prec R_{AY}\prec W_Y\prec R_{BY}\prec R_{BX}\prec W_X}
\]

这是严格顺序环，因此在给定前提下无法成立。

~~~mermaid
flowchart LR
  WX["W_X"] --> AX["A: read X=1"]
  AX --> AY["A: read Y=0"]
  AY --> WY["W_Y"]
  WY --> BY["B: read Y=1"]
  BY --> BX["B: read X=0"]
  BX --> WX
~~~

**证明的边界很关键：** 不能只凭MCA就写下A、B的R→R边。弱内存模型允许独立Load缺少保序，因此普通无屏障IRIW必须单独判断。

## 四、数值例题：一个读者看新、另一个看旧不一定冲突（约2分钟）

教学MCA模型：X=1在t=40进入全局可见的逻辑顺序，Y=1在t=58进入；无其他写入，Load在给定时刻取值。

| 观察者与Load | 逻辑时刻 | 结果 |
|---|---:|---:|
| A读X | 45 | 1 |
| A读Y | 50 | 0 |
| B读Y | 62 | 1 |
| B读X | 66 | 1 |

结果为A=(1,0)，B=(1,1)，合法。这说明**MCA不是所有物理核心在同一时钟沿强制刷新Cache，也不是所有Load必须看到最新Store**。较早的Load可以读旧值。

如果再要求B先读到Y=1、随后却读X=0，就与上述有序读者和共同写序形成冲突。

## 五、现代处理器模型：一个重要的版本陷阱（约3分钟）

| 模型 | 对其他核的写传播 | 两次独立Load的顺序 | 有序IRIW目标 |
|---|---|---|---|
| SC | 全局共同顺序 | 保留 | 禁止 |
| x86-TSO，普通WB内存 | 一致的全局Store顺序，可有本核Store Buffer转发 | 保留R→R | 禁止 |
| **现代Armv8-A**，Normal内存、同一共享域 | **other-MCA** | 普通LDR不必天然R→R保序 | 两读者均加适当**DMB ISHLD**后禁止 |
| **RISC-V RVWMO**，普通主存 | **MCA** | 无依赖的普通Load可缺少R→R | 两读者各加**FENCE R,R**后禁止 |
| 允许非MCA的历史/抽象模型（如某些POWER语义） | 对不同核的传播次序可能不同 | 需另行确定 | 即使本地读序受约束，单靠本地读序也未必禁止 |

**历史纠错：** Armv8-A最早的公开架构文档允许普通写非MCA传播；从2017年3月起，Armv8-A模型变为other-MCA。旧资料的结论不能直接当作现代Armv8-A的规则。RISC-V RVWMO虽为弱排序，却明确是MCA模型。

来源：
[Arm官方介绍](https://developer.arm.com/community/arm-community-blogs/b/tools-software-ides-blog/posts/armv8-sequential-consistency)；
[RISC-V RVWMO规范](https://docs.riscv.org/reference/isa/unpriv/rvwmo.html)；
[RISC-V解释材料（MCA、FENCE）](https://docs.riscv.org/reference/isa/unpriv/mm-eplan.html)；
[剑桥多核内存模型讲义（Arm历史与POWER）](https://www.cl.cam.ac.uk/~pes20/multicore-sewell-notes.pdf)。

DMB ISHLD/FENCE R,R的作用是保留读者先后两次Load的必要内存顺序，**不是**要求这两笔Store立即写回DRAM。实际Arm DMB必须使用适当的共享域。

## 六、反例：MCA成立但普通IRIW仍可能允许（约2分钟）

如果A和B各自两次独立Load缺少R→R顺序边，可以构造：

~~~text
R_AY=0 → R_BX=0 → W_X=1 → W_Y=1 → R_AX=1 → R_BY=1
~~~

这是一个具有共同写入顺序的逻辑执行。两个Load旧值都发生在写入之前，两个Load新值都发生在写入之后；**没有违反MCA**。

但A的第二次Load在共同顺序中早于其第一次Load；B同样如此。若ISA没有要求这两条R→R边，才可能采用这种构造。

所以：

\[
\boxed{\text{MCA成立}\not\Rightarrow\text{无屏障的普通IRIW一定被禁止}}
\]

这个结果也**不表示CPU必须按该顺序退休指令**。推测执行与Replay可以在保证最终架构观察合法的前提下存在。

## 七、MCA与MESI、Store Buffer、Dirty回写的联系（约2分钟）

MESI管理的是同一条Line的拥有者、Invalidation和最新数据来源。X与Y是不同Line，两条Line各自遵守MESI，并不能单独推导这两个独立写在多个核眼中的共同顺序。

真实机器可通过相干协议、Store Buffer排空规则和其他机制实现MCA，但**相干协议存在本身不等于所有跨地址内存顺序都自动变成SC**。

与此前TSO Store Buffering相比：

~~~text
SB：
Core0 STORE X=1; LOAD Y
Core1 STORE Y=1; LOAD X
~~~

在TSO中(0,0)允许，因为两笔Store可先留在各自Store Buffer，之后的跨地址Load先读到旧值。这个事实与IRIW中“两个观察者对不同写入的顺序是否一致”不是同一问题。

必须区分四个时刻：Store从ROB退休、取得Line写权限、这笔Store对其他核逻辑可见、Dirty Line最终写回DRAM。**Store已退休或者已有M权限，都不能单独证明该Store已经全局可见；全局可见也不等于DRAM已更新。**

## 八、验证方法与适用边界（约1分钟）

正确性应先用[herdtools7](https://github.com/herd/herdtools7)或等价模型工具核对Litmus允许结果，再用具有明确访存语义的原子操作/汇编实测。记录ISA版本、内存类型、屏障及共享域、编译优化、核绑定、样本次数、结果分布。测性能时另记Fence开销、Replay、相干流量与完成时间。

**模型允许但实测从不出现，不代表架构禁止。** 反过来如果实测出现模型禁止结果，也应先排查测试程序、编译器和内存属性是否符合模型假设。

本课不把这些结论直接套用到DMA、非相干加速器、MMIO、非对齐跨宽度访问或带C++数据竞争的普通共享变量。

## 九、小结与下一讲（约1分钟）

\[
\boxed{\text{Coherence}\neq\text{MCA}\neq\text{Load→Load排序}}
\]

\[
\boxed{\text{有序IRIW在MCA下形成顺序环，因此禁止}}
\]

\[
\boxed{\text{Store退休}\neq\text{跨核可见}\neq\text{DRAM写回}}
\]

**下一讲：第34课（2026年11月22日，第5周第6节）《NUMA与远程内存：First-touch、跨Socket延迟和线程/页面放置》。** 接着研究内存语义正确之后，为什么不同物理位置的数据访问仍会显著影响性能。

---

# 十、四级分级测评（总分100分）

首次不公布答案或解析。Lv1—Lv3客观判分，Lv4依据分项Rubric审阅评分。题目分值15+20+25+40=100。

## Lv1｜概念辨析（单选；预计2分钟）｜15分

四核IRIW：核0写X=1、核1写Y=1；读者A顺序读X再读Y，读者B顺序读Y再读X。两名读者的Load→Load顺序均受到保证，写入满足MCA。若A读到(1,0)、B也读到(1,0)，哪种判断最严谨？

A. MESI使每个Line相干，所以无论读序和传播性质如何都保证这个结果不可能。

B. 在给定的MCA与两条R→R保序条件下，这个结果要求出现全局顺序环，因此不允许。

C. 仅凭两名读者源代码的Load先后次序，即便弱模型不保序且系统非MCA，这个结果也必然禁止。

D. 如果DRAM尚未写回，两名读者不可能从其他核Cache看到写入的新值。

**可选提示：** 把读到1和读到0分别转成该Load在对应Store之后或之前的约束，并加上两名读者的顺序边。

## Lv2｜数值时间线（预计4分钟）｜20分

MCA教学时间线：初始X=Y=0；写X=1在全局逻辑时刻t=8可见，写Y=1在t=15可见。读者A在t=10读X得a、t=12读Y得b；读者B在t=17读Y得c、t=19读X得d。读者均按给定顺序执行，无其他写入和本核转发。计算十进制编码E=a+2b+4c+8d。

**只填写整数E。**

**可选提示：** 每一次Load与对应地址的全局可见时刻比较，先确定a、b、c、d的0/1值，再按权重编码。

## Lv3｜跨模型边界（多选；预计5分钟）｜25分

在对齐普通可缓存内存和明确的IRIW语境下，选择所有正确陈述（多选）。

A. 同地址缓存一致性单独就保证所有不同地址的写入都以相同次序被所有读者观察，完全不需要额外内存模型约束。

B. 现代Armv8-A采用other-MCA；不能把早期Armv8文档中的非MCA允许行为直接当作今天的架构规定。

C. RISC-V RVWMO虽然是MCA模型，但如果独立普通Load之间缺少R→R保序，仅凭MCA不能判定普通IRIW的反向观察结果必然禁止。

D. x86-TSO保留读者Load→Load顺序，却允许两读者在有序IRIW中分别观察完全相反的两个写入顺序。

E. RISC-V中在同一读者的两次普通Load之间插入FENCE R,R，可以建立该对Load之间的R→R顺序约束。

F. M状态Line的最新值可经相干协议由其他核获得，不要求它先被最终写回DRAM。

**可选提示：** 同时检查同地址相干、写传播MCA、读侧排序、现代Arm架构版本与Dirty数据来源。

## Lv4｜综合证明与实验设计（开放；预计10—12分钟）｜40分

统一模型：四核，X/Y位于不同64B Cache Line，初值均为0，无其他写者。Writer0执行STORE X=1，Writer1执行STORE Y=1；Reader A先读X得a、再读Y得b，Reader B先读Y得c、再读X得d。研究结果a=1,b=0,c=1,d=0。

A（12分）：假定MCA且两名读者均保留Load→Load顺序，建立六条必要的顺序边并证明环。

B（10分）：比较x86-TSO、现代Armv8-A两读者使用DMB ISHLD、RISC-V RVWMO两读者使用FENCE R,R，以及一种非MCA抽象系统的判定；说明历史Arm资料为什么不能代表当前架构。

C（10分）：若两个读者的独立Load→Load不保序，构造一个遵守MCA但得到相同目标读值的全局逻辑顺序；指出与程序顺序冲突的读边。

D（8分）：区分MESI、MCA、SC/TSO、ROB退休、Store Buffer传播和DRAM写回，并提出四项Litmus验证/性能实验检查点。

**可选提示：** A把读旧和读新都连到对应写入，添加两条读侧边；C尝试先执行两条读旧值的Load，再让两笔Store全局可见。

**交卷后批改：** Lv1、Lv2、Lv3按JSON客观判分，Lv4按A/B/C/D Rubric人工审阅；≥80分进入第34课，60—79分补IRIW例子，低于60分重点回顾第29—33课。任何补练均不改变既定课程编号与日期。
