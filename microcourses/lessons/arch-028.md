---
title: "第28课｜四周阶段考核：CPI、乱序执行、Cache/MLP与内存可见性综合推理"
track: arch
number: 28
date: 2026-11-16
week: 4
minutes: 18
kind: full
summary: "第一阶段综合验收：统一性能账本与Amdahl边界、ROB与分支恢复、Cache/TLB/VIPT、MSHR/预取/替换、SC与TSO的架构可见性，并完成四级综合测评。"
tags: [phase-exam, review, CPI, Amdahl, ROB, rename, branch, cache, TLB, VIPT, MSHR, MLP, prefetch, TSO, coherence]
diagram: mermaid
---

# 计算机体系结构 · 第28课
## 四周阶段考核：CPI、乱序执行、Cache/MLP与内存可见性综合推理

**2026年11月16日｜第4周第7节·阶段考核｜预计18分钟（讲解与测评建议分开完成）**

今天不是将前27课再背一次，而是把前四周的知识连接成一个完整的性能与正确性模型。我们将回答：**为什么增加ROB、扩大Cache或提高预取命中率，不一定改善端到端时间？为什么一条Store已经退休，其他核仍可能看见旧值？**

本课为第一个四周阶段考核：前面约12—18分钟做带推导的综合复习，最后用Lv1—Lv4四题检查理解。阶段考核不改变既定课程编号。

## 一、复盘地图：四周的知识如何连接（约2分钟）

| 周次 | 已学机制 | 本次考核的核心联系 |
|---|---|---|
| 第1周 | CPU Time、CPI、Amdahl、Roofline、Little定律 | 统一指标与瓶颈的量纲，避免重复统计 |
| 第2周 | ILP、流水线、寄存器重命名、ROB、LSQ | 乱序执行与有序退休为何能并存 |
| 第3周 | 分支预测、GHR、投机恢复、安全检查 | 恢复架构状态不等于撤销全部微架构副作用 |
| 第4周 | Cache/TLB/VIPT、写策略、MSHR、预取、替换 | 提高Hit率与增加并行度怎样影响真正的关键路径 |

~~~mermaid
flowchart TD
    W["固定工作量的完成时间 T"] --> F["指令数 N × CPI / 频率 f"]
    F --> O["前端/ROB/分支恢复"]
    F --> M["Demand Miss关键路径"]
    M --> T["TLB与Cache层次"]
    M --> L["MSHR/MLP和预取"]
    L --> P["污染、带宽和共享竞争"]
    O --> R["提交正确性 / 错误路径恢复"]
    R --> S["Store Buffer与跨核可见性"]
    P --> S
~~~

**评测原则：固定功能工作量，先验证正确性，再判断哪些延迟进入关键路径，最后比较完成时间。**

## 二、统一性能账本：CPI、Amdahl与重叠Stall（约3分钟）

定义：退休指令数为\(N\)、总周期为\(C\)、频率为\(f\)。则

\[
\boxed{T=C/f=N\cdot CPI/f},\qquad \boxed{CPI=C/N}.
\]

在本节教学模型里，若基础执行时间为\(C_0\)，额外分支恢复周期\(C_b\)与真正暴露的访存等待周期\(C_m\)互不重叠，才允许：

\[
C=C_0+C_b+C_m,\quad
C_b=n_b L_b,\quad
C_m=(N\cdot MPKI/1000)L_m^{\mathrm{exposed}}.
\]

**数值例题**：固定\(N=1,000,000\)，基础\(CPI_0=1.10\)；有5000次误预测，每次额外14周期；Demand MPKI=6，每次Miss的平均额外暴露时间35周期。假定这两类周期互不重叠，则

\[
C=1{,}100{,}000+5{,}000\times14+6000\times35
=1{,}380{,}000,
\]
\[
\boxed{CPI=1.38}.
\]

对同一工作量，若优化只让分支恢复总损失减半，节约35,000周期，则整体加速比是：

\[
S=\frac{1{,}380{,}000}{1{,}345{,}000}\approx1.026.
\]

这就是Amdahl思想：局部损失减半，并不意味着整机性能翻倍。

**反例**：若Branch Recovery与ROB Full同时覆盖周期[20,30)，不能把这10个墙钟周期计算两次。计数器事件次数、事件时间并集和因果上可节省的周期也不是同一个量。

## 三、ROB与投机恢复：数据准备好不等于可以退休（约2分钟）

乱序CPU可提前执行较年轻指令，但通常仍使用ROB维持架构退休顺序。Rename通过RAT将架构寄存器映射到物理版本，Free List管理尚可分配的物理寄存器。

分支B预测Taken后，年轻Load沿错误路径发出。稍后B解析为Not Taken：处理器应恢复正确PC、RAT/Free List与投机GHR，抑制错误路径年轻指令的架构提交。RISC-V BOOM给出了分支快照、Allocation List和GHR恢复的具体设计。[BOOM Rename](https://docs.boom-core.org/en/latest/sections/rename-stage.html)；[BOOM Branch Predictor](https://docs.boom-core.org/en/latest/sections/branch-prediction/backing-predictor.html)。

~~~text
预测分支B → 分配年轻指令 → 部分Load发出
                       ↘ Cache/TLB可能已有变化
B解析错误 → Squash → 恢复RAT/GHR/资源 → 正确路径退休
~~~

两条必要条件：

\[
\boxed{\mathrm{Free}\cap\mathrm{Live}=\varnothing}
\]

以及“已退休指令必须是正确程序路径的连续合法前缀”。但恢复架构状态，不能证明早先的Cache请求未改变微架构状态，也不能仅凭变化推断秘密泄漏。

**LSQ反例**：较老Store的地址未知，年轻Load先读取旧数据；稍后Store地址解析为同址，Load及依赖其结果的年轻指令就必须被适当Replay/Squash，不能把旧值提交成合法结果。

## 四、Cache、TLB与VIPT：先算地址，再谈命中（约2分钟）

设Cache数据容量\(C\)、Line大小\(B\)、相联度\(A\)，则：

\[
S=\frac{C}{AB},\quad b=\log_2 B,\quad s=\log_2 S.
\]

Set由Index选中，Tag用于确认该Set中哪条有效Line匹配，Offset选择行内字节。Set相同不代表Hit。

在4KiB基础页中，页内偏移有12位。若简单VIPT L1采用连续低位Set索引，希望索引位全部落在VA/PA不变的页内偏移，则：

\[
\boxed{b+s\le12}\iff\boxed{C/A\le4096\mathrm{B}}.
\]

例如32KiB、8-way、64B得到\(S=64\)，\(b+s=6+6=12\)，可在TLB完成前用页内位选择Set；物理Tag随后验证块身份。64KiB、8-way、64B则\(S=128\)、\(b+s=13\)，简单索引可能产生虚拟别名Synonym问题，需要额外处理。TLB Miss是翻译缓存未命中，不等于Page Fault；Cache物理Tag也不能跳过访问权限检查。

两级AMAT在串行访问与明确定义局部Miss率时可写作：

\[
\boxed{AMAT=H_1+m_1(H_2+m_2P_M)}.
\]

若\(H_1=4,\ m_1=0.05,\ H_2=11,\ m_2=0.20,\ P_M=170\)，则\(AMAT=4+0.05(11+34)=6.25\)周期。L2全局Miss率仅为\(0.05\times0.20=1\%\)，不是20%。

**边界**：AMAT是每次访问的平均服务延迟，不是CPI。OoO、TLB与Cache并行查询、Hit-under-Miss以及MSHR会影响哪些等待真正暴露在关键路径。Cache AMAT的基本条件期望公式可参见[康奈尔大学Cache教学笔记](https://www.cs.cornell.edu/courses/cs3410/2025sp/notes/caches.html)。

## 五、MSHR、预取与替换：并发上界不是延迟下降（约2分钟）

MSHR追踪尚未返回的不同Cache Line请求。同一Line的多个Load可能合并，多个不同Line请求则需要足够跟踪资源。gem5的非阻塞Cache使用MSHR及Write Buffer，并支持预取与替换策略：[gem5 Classic Caches](https://www.gem5.org/documentation/general_docs/memory_system/classic_caches/)。

若MSHR容量\(K\)、平均占用时间\(L\)、完成率\(\lambda\)，稳态Little定律：

\[
\bar N=\lambda L\le K\Rightarrow
\boxed{\lambda\le K/L}.
\]

再考虑发出速率\(r_i\)和下级服务速率\(r_m\)：

\[
\boxed{\lambda_{\max}\le\min(r_i,K/L,r_m)}.
\]

例如8个MSHR、100周期占用，则容量上界仅0.08 Line/cycle，64B Line对应5.12B/cycle；提高到16个MSHR不会自动减少单次Miss的100周期延迟。如果只有一条严格指针依赖链，下一访问地址仍无法提前知道。

预取的理想领先距离：每\(T\)周期需下一Line、请求延迟\(L\)时，

\[
\boxed{d_{\min}=\lceil L/T\rceil}.
\]

但预取越激进，就越可能抢占MSHR和带宽、污染Cache；LRU/RRIP的插入与替换选择也可能决定预取是否在使用前被逐出。**Hit率升高、MPKI降低，不必然对应IPC改善**。关键应观察需求关键路径、队列拥塞、下级流量和端到端时间。

## 六、SC、TSO与相干性：阶段考核的易错重点（约2分钟）

考虑两个核、普通可缓存相干内存，初始\(X=Y=0\)：

~~~text
Core 0                Core 1
STORE X = 1           STORE Y = 1
r0 = LOAD Y           r1 = LOAD X
~~~

若顺序一致性（SC）要求保持每核程序顺序，假设\(r_0=r_1=0\)，得到：

\[
S_X<L_Y,\quad S_Y<L_X,\quad L_Y<S_Y,\quad L_X<S_X.
\]

合起来：

\[
\boxed{S_X<L_Y<S_Y<L_X<S_X},
\]

这是不可能成立的严格顺序环。因此SC不允许两次Load都读0。

在允许Store→不同地址Load放松的TSO中，Core 0和Core 1可以先把Store放在各自的Store Buffer，再执行不同地址Load，读取到对方尚未传播写入前的旧值；因此\((0,0)\)可以合法。这不要求发生错误分支预测，也不是Cache一致性协议出错。参见[RISC-V内存模型解释资料](https://docs.riscv.org/reference/isa/unpriv/mm-eplan.html)以及[x86-TSO说明](https://paulcavallaro.com/blog/x86-tso-a-programmers-model-for-x86-multiprocessors/)。

一定区分三个时间点：

\[
\boxed{\text{Store从ROB退休}\ne\text{对其他核全局可见}\ne\text{写回DRAM}}.
\]

Dirty Line未写回DRAM时，其他相干核仍可能通过所有权持有者获得最新数据；但Store刚退休、尚在Store Buffer时，不能假设其他核已经能见到写入。

## 七、阶段考核如何判断一个架构优化是否成立（约1分钟）

一个可信的实验，首先固定程序输入、功能结果、指令工作量定义与系统配置；随后报告总完成时间、CPI/IPC、分支恢复、Demand Miss与MPKI、MSHR/ROB/LQ资源、预取准确/及时性、写回流量等；最后检查优化是否改变架构语义，包括LSQ Replay、Store转发与跨核合法内存观察。

**局部指标改善只是线索，正确性和固定工作量下的端到端时间才是最终验收依据。**

**下一讲：第29课（2026年11月17日，第5周第1节）**将进入《MESI协议与缓存行所有权：Invalidation、共享读和写权限转移》。第5周系统学习缓存一致性、内存模型、屏障与NUMA，继续重点训练SC/TSO的全序证明和跨核可见性。

---

## 八、四级分级测评（总分100分）

本次阶段考核首次发放只提供题面与可选提示；**标准答案、客观题解析和开放题Rubric仅保存在对应JSON中，不在本讲义公开。** 前三题客观判分，第四题按分项Rubric人工或自评，不做虚假的全自动评分。

### Lv1｜跨层机制辨析（15分｜单选｜预计2分钟）

某OoO处理器升级了预取器，L1 Demand Miss减少，但IPC下降；与此同时，一个已退休Store仍可能位于Store Buffer。哪项分析最严谨？

**A.** 只要Demand Miss减少，AMAT、CPI和端到端时间必定同比改善。

**B.** Store从ROB退休意味着该写入已经立即对所有相干核心全局可见。

**C.** 应同时检查预取及时性、污染、MSHR争用与关键路径暴露；且Store退休与跨核可见性属于不同阶段。

**D.** 只要使用物理Tag，TLB权限和地址空间标识都可以省略。

*可选提示（不泄露答案）：把Cache事件数量、是否命中关键路径，以及Store的架构提交与跨核传播分开考虑。*

### Lv2｜分支与访存联合CPI计算（20分｜数值｜预计4分钟）

阶段测评数值题：程序退休2,000,000条指令，排除以下额外惩罚后的基础CPI为0.92；共有12,000次分支误预测，每次额外暴露12周期；Demand Miss为8 MPKI，每个Miss平均暴露45周期。所有新增惩罚彼此及与基础时间完全不重叠，频率与指令数固定。求总CPI，单位cycles/instruction。

**作答：** 填写数值，单位cycles/instruction。

*可选提示（不泄露答案）：写成基础CPI + 误预测次数×暴露周期/总指令数 + MPKI/1000×每次Miss暴露周期。*

### Lv3｜VIPT、乱序、MLP与TSO边界（25分｜多选｜预计5分钟）

在4KiB基础页、连续低位索引的简单VIPT模型，普通相干内存、支持OoO/非阻塞Cache以及允许Store Buffering的TSO模型下，选择所有成立的说法。

**A.** 32KiB、8-way、64B Line的VIPT L1，其Index加Offset刚好为12位，可以完全取自4KiB页内偏移。

**B.** 64KiB、8-way、64B Line的VIPT L1，同一物理页的所有虚拟别名天然总会选择同一Set，无需任何额外处理。

**C.** 分支预测错误时，恢复PC和RAT通常还必须正确处理Free List所有权及投机GHR；仅保证错误指令不退休并不保证所有内部资源状态正确。

**D.** 只要MSHR增加一倍，单条严格依赖的指针追逐链就一定能够让两次后继Miss并行执行。

**E.** 预取请求即使后来被程序使用，也可能晚到、抢占MSHR或驱逐热点Line，所以无法单由使用率推断IPC收益。

**F.** 两核各自Store不同地址后Load对方地址都读旧0，可以在TSO下合法，而不能据此认定缓存一致性失效。

**G.** 已经从ROB退休的Store在所有CPU上必须同时立刻变得可见，故经典Store Buffering的(0,0)在TSO下不可能。

*可选提示（不泄露答案）：分别检查页内位数、错误路径资源恢复、依赖链、预取资源压力，以及TSO的Store→Load放松。*

### Lv4｜综合架构设计与证明（40分｜开放推导｜预计12分钟）

综合架构设计审计（40分，预计12分钟）。请按A—D小题写出计算、关键假设与至少一项反例。

A｜ROB与分支恢复（10分）。3位GHR初值为101₂，规则H'=((H<<1)|b)&7。分支B先预测Taken(1)，错误路径上另一分支C预测Not Taken(0)，随后B解析实际Not Taken(0)。计算恢复后正确的3位GHR；说明除PC外，RAT、Free List和年轻指令的提交/回收应满足的两项不变量。另解释为什么错误路径Load被Squash也不能证明其所有Cache副作用已撤销。

B｜VIPT别名与Cache（10分）。比较64KiB、8-way、64B Line、4KiB页的连续低位VIPT L1：算Set数、Index位数及b+s；两个VA 0x12040和0x13040映射到同一物理页帧、相同页内偏移时，求两者Set Index，解释可能的Synonym问题并提出一种处理机制。

C｜MLP与性能账本（10分）。L1有12个MSHR，每个不同Line Miss平均占120周期，处理器可发0.18 Line/cycle，下级可完成0.16 Line/cycle，每Line 64B。给出理想稳态完成率及Line数据带宽上界。再讨论为什么三条严格依赖的指针追逐链无法仅靠增加MSHR达到这个上界，以及为什么不能直接把平均访存延迟当作CPI。

D｜跨核可见性与实验（10分）。初始X=Y=0，Core0执行STORE X=1; r0=LOAD Y；Core1执行STORE Y=1; r1=LOAD X。证明SC不允许(r0,r1)=(0,0)，解释TSO如何允许。辨析ROB退休、Store Buffer传播、Dirty回写DRAM三者时机；提出比较“保守预取/激进预取”时至少四个必须记录的性能/正确性指标。

*可选提示（不泄露答案）：A恢复到B预测前GHR并移入真实方向；B先求S=C/(AB)，再按虚拟地址位计算Index；C使用Little定律；D分别列出SC保序关系和两个Load读旧值所需顺序。*

---

## 九、作答格式与后续安排

~~~text
Lv1：
Lv2：
Lv3：（选中所有字母）
Lv4：
A：
B：
C：
D：
~~~

分值分别为15、20、25、40，共100分。**≥80分**继续既定专题；**60—79分**补一个针对性跨层例题；**低于60分**先复习相应章节再练。补练不改变课程编号和下一课日期。
