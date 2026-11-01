---
title: "第13课｜前端—后端协同：Fetch宽度、ROB窗口、LSQ与分支恢复如何共同限制IPC"
track: arch
number: 13
date: 2026-11-01
week: 2
minutes: 18
kind: full
summary: "从取指供给、执行宽度、按序退休和在途资源的背压出发，以Little定律推导ROB/Load Queue的稳态吞吐上限，区分分支恢复空泡与其他停顿的重叠，并设计端到端性能诊断。"
tags: [ILP, fetch, decode, rename, issue, commit, ROB, LSQ, branch-recovery, pipeline-backpressure, Little-law, IPC, CPI, MPKI]
diagram: mermaid
---

# 计算机体系结构 · 第13课
## 前端与后端协同的性能上限：Fetch宽度、ROB窗口、分支恢复与LSQ竞争

**2026年11月1日｜第2周第6节新课｜约18分钟**

第8—12课依次学习了寄存器重命名、Tomasulo、ROB与精确异常、LSQ中的Store/Load投机，以及BHT/BTB/GShare和错误分支恢复。今天把这些结构放进**同一台乱序CPU**。问题不再是“某个结构能不能更快”，而是：**为什么一个6-wide Fetch的处理器，真实程序可能连每周期2条指令都退休不了？**

学习目标：从资源宽度、驻留时间、分支损失和系统背压逐层建立可检验的上限；能区分“存在指令可取”“可进入ROB”“可发射执行”“可退休”“Store对别核可见”。

## 一、动机：流水线有很多宽度，谁说了算？（约2分钟）

观察一台抽象乱序CPU：

~~~text
Fetch 6/cycle → Decode/Rename 4/cycle → Issue 4/cycle
                                         ↓
                                 Execution/LSQ
                                         ↓
                                  ROB Commit 3/cycle
~~~

即使无分支错误、Cache全部命中、无限独立指令，最终长期退休速度仍不能超过Commit宽度3条/周期。6-wide Fetch是每周期能**提供的上限**，不是整机IPC的保证。反过来，若退休资源很宽，但前端长期断供，后端同样没有足够新工作。

这里的宽度需要明确单位：Fetch宽度可能是字节、指令或fetch packet；Issue宽度可能按uop，IPC通常按**退休的架构指令**。一条架构指令可能展开多个uop。今天的数值题特意假设一条架构指令对应一个被计数的uop，使不同宽度可以直接比较。真实处理器必须先对齐计数单位。

~~~mermaid
flowchart LR
  PC["PC与预测器"] --> IC["I-Cache / TLB"]
  IC --> FQ["Fetch Queue"]
  FQ --> DE["Decode / Rename"]
  DE --> ROB["ROB分配"]
  DE --> IQ["Issue Queue"]
  IQ --> EX["执行单元"]
  EX --> LSU["LSU / LQ / SQ"]
  EX --> WB["Writeback"]
  LSU --> WB
  WB --> ROB
  ROB --> RET["按序Retire"]
  RET --> SB["已提交Store待传播"]
  SB --> VIS["遵守内存模型的跨核可见"]
  ROB -. "ROB满 / 空间不足" .-> DE
  LSU -. "LQ/SQ满" .-> DE
  DE -. "反压" .-> FQ
  ROB -. "误预测恢复和冲刷" .-> PC
~~~

**先记住：链条中的每个有界队列都可能产生反压（backpressure），而被迫停止的往往是更上游阶段。**

## 二、符号与理想吞吐上界（约2分钟）

本课前半采用单核、固定频率、充分长的稳态程序。所有宽度均以“架构指令/周期”为单位，假设每条对应一uop、不发生融合或拆分。设：

- \(W_F\)：有效取指宽度；\(W_R\)：Rename/Dispatch宽度。
- \(W_I\)：Issue宽度；\(W_C\)：Commit宽度。
- \(\lambda\)：长期退休速率，即IPC，单位指令/周期。
- \(R\)：ROB条目容量；\(T_R\)：一条指令从占据ROB到释放条目的**平均驻留周期**。
- \(Q_L\)：Load Queue容量；\(f_L\)：Load在退休指令中的比例；\(T_L\)：Load从分配LQ到释放LQ条目的平均驻留周期。

如果任何阶段都不空闲、无限独立且指令不增加额外uop，基础宽度上界是：

\[
\boxed{\lambda\le\min(W_F,W_R,W_I,W_C)}
\]

这是**必要上界**而非保证能达到。实际可能受依赖链、执行端口、Cache Miss、TLB Miss、分支、队列、功耗或操作类型分布限制。也不能把不同单位的“Fetch字节/周期”与“退休指令/周期”直接取min。

**数值例**：\(W_F=6,W_R=4,W_I=4,W_C=3\)，理想宽度上界是3 IPC。把Fetch从6再加宽到8，若其他条件不变，不会突破3 IPC。

## 三、ROB为什么也能限制吞吐：用Little定律推导（约3分钟）

第1周的Little定律可直接用于乱序窗口。设稳定运行时平均在ROB中的指令数为 \(\bar N_R\)，吞吐为 \(\lambda\)，平均驻留时间为 \(T_R\)：

\[
\boxed{\bar N_R=\lambda T_R}
\]

由于容量有限，\(\bar N_R\le R\)，所以：

\[
\boxed{\lambda\le R/T_R}
\]

这不是“每条指令恰好执行了 \(T_R\) 个周期”，而是**条目占据从分配到回收之间跨越的平均时间**。包括等待数据、执行、写回后等待更老指令退休等；它通常远长于一条ALU指令本身的延迟。

**手算例**：ROB有64条目，稳态指令平均占用ROB 40周期。即使执行端口每周期可做很多操作，也有容量上界：

\[
\lambda\le64/40=1.6\ \mathrm{inst/cycle}.
\]

若希望稳定退休3条/周期，在同样40周期驻留下，Little定律至少要求平均在途量 \(3\times40=120\) 条目。配置64条目的ROB无法满足该平均占用需求。单纯把Issue宽度由4改成6不能解除这一容量限制。

**两个限制**：第一，Little定律要求统计边界一致、相对稳态；第二，\(T_R\) 并不是硬件改容量后永远不变。更大窗口可能释放MLP、改变等待时间；更多争用也可能增加驻留周期。上面是指定 \(T_R\) 的模型上界，不是任何程序的固定IPC预测。

## 四、LSQ也是窗口容量：为什么Load比例很重要？（约2分钟）

对于LQ，Load进入队列的长期速率约为 \(f_L\lambda\)，平均占用 \(T_L\) 周期。Little定律给出：

\[
\bar N_L=f_L\lambda T_L\le Q_L
\quad\Longrightarrow\quad
\boxed{\lambda\le Q_L/(f_LT_L)}.
\]

**手算例**：Load占25%，LQ容量24，平均从分配到释放40周期：

\[
\lambda\le 24/(0.25\times40)=2.4\ \mathrm{IPC}.
\]

即使ROB和Commit都允许3 IPC，LQ也会在这一简化模型下把长期供给限制在2.4 IPC。扩展LQ可能有帮助，但还需检查Load地址生成、Store别名搜索、Load执行端口、L1 Miss与实际Release策略。

同理，Store Queue也可能限制流量，但必须单独定义Store进入/释放队列的时刻；**Store从ROB退休**与**Store已从SQ排出或对其他核可见**并非无条件同一时刻。前一课已分析依赖预测和转发，这一课分析它们的**容量效应**。

BOOM的LSU文档给出独立的LDQ和STQ、Store地址和数据的准备、Load的提前执行与违例恢复；它是具体设计案例，不代表所有CPU采用相同的队列释放时刻。[BOOM LSU 文档](https://docs.boom-core.org/en/latest/sections/load-store-unit.html)。

## 五、把宽度、ROB和LQ放在同一张上界表（约2分钟）

继续使用一个新的理想化配置：

| 资源 | 参数 | 在所列假设下的IPC上界 |
|---|---|---:|
| Fetch | 6 inst/cycle | 6 |
| Rename/Dispatch | 4 inst/cycle | 4 |
| Issue | 4 inst/cycle | 4 |
| Commit | 3 inst/cycle | 3 |
| ROB | 90条、平均30周期 | 3 |
| LQ | 18条、Load占20%、平均45周期 | 2 |

取必要条件的最小值：

\[
\lambda_{\max}\le\min(6,4,4,3,90/30,18/(0.2\times45))
=2\ \mathrm{IPC}.
\]

注意“上界表”的正确使用方式：

1. 数字2表示这些模型共同允许的最大长期平均速率，而不是测量值。
2. 此配置**首先值得检查LQ是否长期占满**；不能只凭上界就宣布实际瓶颈一定是LQ。
3. 若程序只有长RAW链，即使LQ翻倍，真实IPC也可能仍远小于2。
4. 若同时改变窗口容量和资源争用，平均驻留 \(T_R,T_L\) 也要重新测。

**控制变量实验**：将LQ从18增至36，在固定 \(T_L\) 的纸面模型中，它的上界变为4 IPC，但整机此时还受到Commit和ROB的3 IPC上限。再继续扩大LQ，对这一模型已经没有提高最终上界的作用。

## 六、前端空泡如何传导到后端：背压有两个方向（约2分钟）

**前端断供**可能来自I-Cache/TLB Miss、BTB缺失、目标解析等待、分支误预测后的PC重定向、Decode无法供给有效uop。若无新工作持续进入ROB，原有指令陆续执行与退休，Issue Queue逐渐变空，执行单元也可能闲置。

**后端反压**则相反：一条很老的Load发生长延迟Miss并阻挡ROB头退休，年轻指令虽可乱序执行，却持续消耗ROB条目；窗口逐渐满，Rename无法再分配条目，最终Fetch Queue背压，前端也被迫停顿。

~~~text
前端问题：
Branch Target未知 → Fetch无有效指令 → IQ逐渐变空 → 执行资源饥饿

后端问题：
老Load长Miss → ROB头不能退休 → ROB/LSQ满 → Rename停 → Fetch Queue满
~~~

因此，看到“Fetch没有新指令”不能立即断定前端预测器有问题：**它也可能是下游资源已满后的结果**。同样，看到ALU利用率低，不一定是计算能力太小或太大，而可能是依赖、供给、队列容量导致。

真实BOOM的ROB追踪在途指令、完成状态与按序Commit，头部忙时无法继续退休。该设计文档也明确将Dispatch与ROB占用相联系。[BOOM ROB 文档](https://docs.boom-core.org/en/latest/sections/reorder-buffer.html)。

## 七、分支恢复如何计入CPI？别把重叠停顿重复相加（约2分钟）

延续第12课，定义：

- \(f_B\)：分支指令占退休指令比例；
- \(r_m\)：每条分支的误预测概率；
- \(P\)：**每次误预测实际暴露为额外完成时间的周期损失**，不是仅看流水线深度；
- \(CPI_0\)：在同一个性能模型中不计这部分额外惩罚时的基线CPI。

当误预测损失完全暴露、不同误预测互不重叠、没有与基线停顿重复计费时：

\[
\boxed{CPI\approx CPI_0+f_Br_mP}
\]
\[
MPKI=1000f_Br_m,\qquad
\Delta CPI=(MPKI/1000)P.
\]

**独立数值例**：假设基线 \(CPI_0=0.4\)，分支比例 \(f_B=0.15\)，误预测率 \(r_m=0.04\)，每次平均多损失10周期，则增加的CPI为0.06，结果约0.46，即IPC约 \(1/0.46\)。

但如果某次误预测的重定向空泡恰好发生在ROB已满且前端本来也不能推进时，**相同墙钟区间不能同时计为一次完整的ROB损失和一次额外的分支损失**。否则会重复计费。实际精确归因需要一个统一的时间线或互斥的top-down stall分类，而不是把所有不同计数器换算的“潜在损失”相加。

另一个边界：预测“Taken/Not Taken”正确但目标PC错误、I-Cache Miss以及恢复GHR/RAT都可能造成不同的停顿结构；平均 \(P\) 不是纯粹“分支执行延迟”，也不是所有CPU固定常数。

## 八、流水线窗口里真正重要的是关键路径和可用并行性（约2分钟）

假设程序有两条完全独立的指令链，各自长度100条；执行资源足够，但每条链下一指令必须等待上一条结果，单条ALU结果延迟4周期。即使ROB有512条、Issue宽8，单链也不能凭窗口大就达到每周期8条有效工作。

相反，存在几千条互不依赖指令，但如果ROB只有很少条目，长延迟事件又让它们迟迟无法退休，窗口容量会限制可同时隐藏的等待。

这与第1周的工作—跨度模型相呼应：

\[
T\ \gtrsim\ \max(W/P,\ D)
\]

其中 \(W\) 是工作总量、\(D\) 是依赖关键路径长度、\(P\) 表示对应的理想并行执行能力。CPU还必须满足ROB、LQ、执行端口、预测恢复等额外容量或时序约束。**宽度是可服务多少条，窗口是能保留多少条，依赖图是同时究竟有多少条可执行**。

因此，“加宽Issue”和“加大ROB”既不是相同优化，也不保证存在单调收益。后者往往还带来更多面积、能耗、唤醒搜索与时序布线代价。

## 九、真实诊断应该记录什么？（约1分钟）

面对“标称宽度6，实测IPC 1.5”，建议先保持工作负载、编译、核心数、频率和输入不变，采集**相同运行**中的以下证据：

- 退休指令数、实际周期数与IPC；有效Fetch、Rename、Issue、Retire数量。
- 前端无有效取指周期、目标重定向/误预测事件与恢复区间。
- ROB满、LQ满、SQ满、Issue Queue满的周期或分配阻塞原因。
- Load Miss延迟、在途Load数量、Load从分配到释放的平均周期。
- Commit为0时ROB头部是否等待长延迟数据、异常、Fence或其他序列化事件。

最重要的是对同时发生的事件去重。一个周期可能既有LQ满又有ROB满；观察计数器可同时上升，但不应据此推断损失了两个独立周期。

可以分别做小型消融：减少Load比例、缩短Miss延迟、减小分支误预测率、修改窗口容量，观察最初的瓶颈是否迁移。模拟器则能额外记录每条指令分配/完成/退休时间，直接验证Little定律的统计口径。

## 十、反例和适用边界（约1分钟）

**反例A：Fetch宽度翻倍，程序依然不快。** 如果Commit、LQ或依赖链更紧，额外取指能力无法转换成更多退休指令。

**反例B：平均ROB占用低，不说明ROB从未成为瓶颈。** 短时间集中占满可能触发强烈背压，平均值会掩盖峰值；反之，长期占满也要与停顿事件对照才能归因。

**反例C：把Branch、LQ、ROB停顿周期直接求和。** 它们可能落在相同周期，不能作为互不重叠的完成时间账本。

**反例D：Store按序退休，就认为写已经跨核可见。** 退休不等于Store Buffer排空或一致性传播完成；后续第5周会在SC、TSO和RVWMO模型下进一步证明。

**模型限制**：上述 \(\min\) 约束和Little上界使用稳态均值；真实代码有突发、不同uop数量、变长指令、融合、SIMD、异构端口、乱序回放、Cache/TLB波动。必须依据具体微架构修正，不能当无条件精确性能公式。

## 十一、总结与下一讲

今天获得一张统一的性能检查图：

~~~text
取指、目标预测  →  指令供给是否充足？
      ↓
Rename/ROB/LQ  →  在途条目是否足够、是否被占满？
      ↓
Issue/Execute  →  依赖与端口允许多少并行工作？
      ↓
Commit         →  最终能按序退休多少？
      ↓
Store Buffer   →  已退休Store何时对其他核可见？
~~~

核心公式三条：

\[
\boxed{\lambda\le\min(W_F,W_R,W_I,W_C)}
\quad
\boxed{\lambda\le R/T_R}
\quad
\boxed{\lambda\le Q_L/(f_LT_L)}.
\]

分支额外CPI公式只在损失不重叠的清楚假设下再使用。**真正的目标是端到端退休吞吐与正确性，而非让单个阶段的利用率或宽度数字好看。**

**下一讲（2026年11月2日，第14课）**：第2周复盘。用一条包含RAW依赖、寄存器重命名、较老Store、错误分支和长Load Miss的微型指令流，联合推演Rename→Issue→Execute→Replay/Squash→Commit，并做本周知识诊断。第14课仍按既定编号，不因答题情况改变。

---

# 十二、四级分级测评（100分）

**首次讲义只提供题面与可选提示，不公布标准答案。** 前三题客观判分；第四题依据推导过程和人工/自评rubric。补练不更改明日课号。

### Lv1｜宽度限制与退休吞吐｜15分｜单选｜预计2分钟

一台单核CPU每周期最多Fetch 6条、Rename 5条、Issue 4条，但按序Commit最多2条。假设指令一一对应uop、长期稳态、无其他瓶颈。哪项正确？

**A.** 由于Fetch=6，稳定退休IPC必等于6。  
**B.** 即使其他阶段完全不受限，长期退休IPC仍不能超过2。  
**C.** 只要ROB很大，Commit宽度就不构成上限。  
**D.** 提高Fetch到8会自动使Commit宽度翻倍。

<details><summary>可选提示（不泄露答案）</summary>沿流水线画出每周期有多少条指令最终离开ROB；短期突发与长期稳定速率不同。</details>

### Lv2｜Little定律与ROB最小容量｜20分｜数值｜预计4分钟

某CPU的ROB有84个条目。在一段稳定测量中，从每条指令分配ROB到释放该条目，平均跨越28周期。假设条目被占据时不能再次分配，统计边界一致且不存在其他更紧的限制。

利用Little定律，求该条件下**长期退休IPC的容量上界**。只填写数值，单位inst/cycle。

<details><summary>可选提示（不泄露答案）</summary>平均在途条目数=退休速率×平均占据周期，平均在途量不能超过ROB容量。</details>

### Lv3｜LSQ上界、背压与停顿归因｜25分｜多选｜预计5分钟

以下哪些判断成立？本题关于LQ的计算采用稳态平均模型，Load占退休指令比例不变。

**A.** 即使两台CPU方向预测准确率同为95%，只要分支频率不同，其MPKI仍可能不同。  
**B.** 若LQ最多容纳20条在途Load、Load比例25%、平均LQ占用40周期，则Little定律给出的整体IPC上界不超过2。  
**C.** 老Load阻挡ROB头退休，可能让ROB逐渐占满、Rename停止，最终反压到Fetch，即使某些执行单元空闲。  
**D.** ROB满造成的空泡与分支错误恢复空泡即使在同一周期发生，也必然各自额外损失一个独立周期。  
**E.** Fetch宽度足够大，就一定可以突破Commit仅2条/周期的长期退休上限。  
**F.** 一条Store只要从ROB退休，就必然立即对其他核全局可见。

<details><summary>可选提示（不泄露答案）</summary>分别检查MPKI的分母、LQ平均占用等式、下游反压传播，以及多个停顿事件能否重复计费。</details>

### Lv4｜一台乱序CPU的跨层容量、分支损失与诊断｜40分｜开放分析｜预计10分钟

某抽象单核CPU参数如下，均以架构指令计数且每条对应一uop：

| 参数 | 值 |
|---|---:|
| Fetch宽度 | 6 inst/cycle |
| Rename宽度 | 4 inst/cycle |
| Issue宽度 | 4 inst/cycle |
| Commit宽度 | 3 inst/cycle |
| ROB容量 | 96 |
| 平均ROB占用时间 | 32 cycle/inst |
| LQ容量 | 24 |
| Load比例 | 25% |
| 平均LQ占用时间 | 40 cycle/load |

**A（12分）**：从Little定律推导ROB与LQ对整体IPC的上界，并与四种宽度约束取最小值。指出在这些假设下最紧的是哪个必要约束，为什么这还不是实测IPC的保证。

**B（12分）**：另假设测试100,000条退休指令；分支占20%，其中4%误预测；每次误预测造成8个**与其他停顿不重叠且完全暴露**的额外周期；其余时间按A计算出的容量上界达到稳定退休。估算基线周期数、额外恢复周期数、总周期数和修正后的IPC。写明为什么必须强调“不重叠”。

**C（10分）**：只把LQ容量提高到48、ROB容量提高到128，暂且保持平均占用周期和所有其他参数不变，重新计算新容量模型的IPC上界。分别判断继续扩大LQ是否还能突破当前上界，以及为什么真实硬件中“平均占用周期不变”可能不成立。

**D（6分）**：设计一组最少三类计数器或Trace字段，能区分前端缺指令、ROB/LQ满造成背压、分支恢复这三类现象。说明当两类停顿同周期发生时如何避免重复统计损失。

<details><summary>可选提示（不泄露答案）</summary>先将每种容量上限换算成同一单位IPC。分支额外周期先从“指令数×分支比例×误预测率×每次惩罚”计算，再与独立的基线周期合并。C修改窗口容量后重新寻找最紧条件，不要沿用旧结论。D设计同时记录事件发生与互斥归因的方式。</details>

**作答格式**：

~~~text
Lv1：
Lv2：
Lv3：（写所有选中字母）
Lv4：
 A：
 B：
 C：
 D：
~~~

评分按照15、20、25、40分：≥80分继续既定课序；60–79分补一条流水线容量与时间线例题；<60分回顾第9—13课的ROB/LSQ与Little定律后再练。第14课日期和编号均保持不变。

---

## 参考资料与验证边界

- [RISCV-BOOM：Pipeline Overview](https://docs.boom-core.org/en/latest/sections/intro-overview/boom-pipeline.html)：取指、Rename、Issue、Memory与Commit等阶段。
- [RISCV-BOOM：Reorder Buffer](https://docs.boom-core.org/en/latest/sections/reorder-buffer.html)：ROB在途状态、按序退休与异常恢复。
- [RISCV-BOOM：Load/Store Unit](https://docs.boom-core.org/en/latest/sections/load-store-unit.html)：LDQ/STQ、Load投机和内存顺序检查。
- [RISCV-BOOM：Backing Predictor](https://docs.boom-core.org/en/latest/sections/branch-prediction/backing-predictor.html)：投机GHR与错误分支恢复。

文中数字是明确声明假设的教学模型，不是某型号CPU的性能实测。**按序退休与Store跨核可见是不同层级**，后续内存模型专题将进一步展开。
