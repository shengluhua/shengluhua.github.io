---
title: "第34课｜NUMA与远程内存：First-touch、跨Socket延迟和线程/页面放置"
track: arch
number: 34
date: 2026-11-22
week: 5
minutes: 18
kind: full
summary: "从两Socket NUMA拓扑出发，理解Linux first-touch、绑核与物理页放置的独立性，推导远程访问延迟、互连/MLP吞吐和页面迁移盈亏点，并区分NUMA与MESI/TSO。"
tags: [NUMA, first-touch, page-placement, Linux, numactl, memory-latency, interconnect, bandwidth, migration, coherence, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第34课
## NUMA与远程内存：First-touch、跨Socket延迟和线程/页面放置

**2026年11月22日｜第5周第6节新课｜讲授约18分钟（测评另计）**

上一课辨析了多副本原子性（MCA）、IRIW与读者排序。今天进入一个与内存模型不同、但对多核系统性能非常关键的维度：**同样正确的内存访问，如果线程和物理页所在Socket不同，会发生什么？**

今天的核心结论是：**把线程绑在某个NUMA Node，不代表线程访问的数据也在同一Node。** 如果大量访问都绕过跨Socket互连，缓存一致性仍然正确，程序却可能显著变慢。

## 一、动机：一台机器也会有“远程内存”（约2分钟）

考虑一台双Socket服务器：Node 0和Node 1各有CPU核心、私有/共享Cache、自己的内存控制器与本地DRAM，两个Socket通过相干互连连接。

~~~mermaid
flowchart LR
    subgraph N0["NUMA Node 0 / Socket 0"]
        C0["CPU核 + Cache 0"] --- MC0["内存控制器 0"]
        MC0 --- M0["本地DRAM 0"]
    end
    subgraph N1["NUMA Node 1 / Socket 1"]
        C1["CPU核 + Cache 1"] --- MC1["内存控制器 1"]
        MC1 --- M1["本地DRAM 1"]
    end
    C0 <-->|"跨Socket相干互连"| C1
~~~

当Node 1的线程访问Node 1上的DRAM，这是**本地DRAM访问**；访问Node 0上的DRAM则可能经过Socket间互连，称为**远程DRAM访问**。它仍属于同一个进程的地址空间，**不是网络RPC，也不是缺页必须访问磁盘**。

远程访问可能增加延迟并占用跨Socket带宽。但命中本地Cache时通常不必走远端DRAM；如果最新数据在另一核的Modified Cache Line中，还可能经相干Cache-to-Cache路径返回。因此“目标页在远端”与“每次Load都访问远端DRAM”不是同义词。

## 二、符号、假设与简单性能模型（约2分钟）

只分析普通、可缓存、硬件相干的CPU内存，忽略设备内存和CXL等更复杂拓扑。假设两Node对称，使用4KiB基础页与64B Cache Line；以下延迟/带宽都是**教学参数，不代表任何特定产品实测值**。

| 符号 | 含义 |
|---|---|
| L_local | LLC Miss后到本地DRAM的服务延迟（ns） |
| L_remote | LLC Miss后到远端DRAM的服务延迟（ns） |
| p | 真正到远端DRAM的Miss比例 |
| N | 需要统计的DRAM Miss次数 |
| K | 同时可追踪的独立未完成Miss数量 |
| B_link | 跨Socket互连的有效数据带宽上限 |

如果N次Miss**完全串行、没有其他工作重叠**，平均单次延迟：

\[
\bar L=(1-p)L_{\rm local}+pL_{\rm remote}
\]

于是暴露延迟总和：

\[
\boxed{T_{\rm serial}=N\bar L}
\]

**数值例题：** 10,000次完全串行的DRAM Miss，其中40%远程，本地95ns、远程175ns：

\[
\bar L=0.6\times95+0.4\times175=127\ \mathrm{ns}
\]
\[
T_{\rm serial}=10000\times127=1.27\ \mathrm{ms}
\]

如果全部本地，则为0.95ms；在该模型中远程混合放置多暴露0.32ms。

**适用边界：** 乱序CPU可用MLP重叠Miss，Cache Hit也不需要支付DRAM延迟。不能直接把这些ns当作CPI，更不能断言远程占比40%就导致程序慢40%。

## 三、First-touch：malloc不等于物理页已经放好了（约3分钟）

Linux中，普通匿名内存的malloc通常只是预留或管理虚拟地址范围，**实际物理页往往在首次写访问引发缺页时才分配**。

在常见默认本地优先策略下，内核优先选择触发该缺页的CPU所在NUMA Node分配页（但受内存不足、cpuset/mempolicy、Huge Page与其他机制限制）。这叫**First-touch**。

~~~text
线程Main固定在Node 0：
    p = malloc(8 GiB);    # 通常尚未触摸所有物理页

Worker固定在Node 1：
    for (i=0; i<n; i+=page_size)
        p[i] = 0;         # 首次写每页，触发分配

在默认策略和内存充足时：新匿名页倾向分配在Node 1。
~~~

反过来，若Main在Node 0先把整个数组写零，后续才让Node 1的工作线程处理，页可能已留在Node 0，后续Node 1负载就会出现大量远程访问。**线程后来换到Node 1，不代表既有页自动换Node。**

还有三个常见陷阱：First-touch典型粒度是物理**页**（普通4KiB或Huge Page），不是64B Cache Line；读取未写入的匿名零页可能涉及共享零页优化，不能用“读了一次”无条件推出已分配私有物理页；启用自动NUMA平衡或显式迁移后，原来的放置可能改变。

Linux内核的NUMA Memory Policy文档明确讨论默认本地分配、策略优先级以及策略主要影响之后的页分配：
https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html

## 四、线程绑核与页面绑内存是两条独立轴（约2分钟）

Linux工具numactl可独立限制CPU执行位置与内存分配策略：

| 命令/策略 | 控制什么 | 不能直接保证什么 |
|---|---|---|
| --cpunodebind=1 | 仅让进程在Node 1的CPU上执行 | 已存在页面自动迁移到1 |
| --membind=1 | 后续受策略支配的页只从Node 1分配（容量不足可能失败） | CPU线程一定运行在1 |
| --interleave=0,1 | 按页在两个Node之间分散新分配 | 每次Load都一半本地、一半远程 |
| --preferred=1 | 优先从Node 1分配，必要时允许回退 | 绝对不会使用远端 |
| --localalloc | 按执行时本地Node优先分配 | 在无容量限制下必然全部本地 |

常用诊断命令（在具有NUMA支持的Linux服务器上运行）：

~~~bash
numactl --hardware
numactl --show
numactl --cpunodebind=1 --membind=1 ./app
numactl --cpunodebind=0 --interleave=0,1 ./app
numastat -p <PID>
cat /proc/<PID>/numa_maps
~~~

其中第一条查看拓扑和距离；numastat和numa_maps帮助核对进程页面归属。后两条通常需具体PID、权限与相应工具支持。**改变numactl策略主要影响新分配页，已存在页通常不会仅因为调整策略就自动搬迁。**

文档：https://man7.org/linux/man-pages/man8/numactl.8.html

## 五、为什么NUMA还有带宽瓶颈？联系Little定律（约2分钟）

上一阶段已推导：

\[
\bar N=\lambda\bar L
\]

对一批相互独立且平均服务时间为L的远程Line Miss，若最多K个请求在途，且Line大小B，则：

\[
\lambda\le K/L
\]

按GB/s单位（1B/ns=1GB/s）的理想吞吐上界：

\[
\boxed{BW_{\max}\le\min\left(\frac{K}{L}B,\ B_{\rm link},\ B_{\rm mem},\ r_{\rm issue}B\right)}
\]

这说明远程内存**可能同时受服务延迟和互连带宽限制**。如果本地DRAM带宽80GB/s、远程互连只有25GB/s，即使远端DRAM还有空闲带宽，也不能假定单条跨Socket流能达到80GB/s。

如果两Socket上的线程分别访问各自本地内存，某些Streaming场景可以同时利用两侧内存控制器，获得接近两个节点之和的聚合能力；但如果所有线程同时争用Node 0的DRAM或单条互连，这个优势可能消失。

**反例：** 增加MSHR数量只能帮助暴露MLP，不能让已经饱和的跨Socket链路突破物理数据传输上限。

## 六、什么时候该迁移页面？推导盈亏点（约2分钟）

Linux可以迁移已存在的物理页，而保持进程使用的虚拟地址不变。迁移并非免费：复制页面内容、同步映射、页表/TLB更新、缺页/迁移协调都有成本。

设一次迁移成本为C_mig；此后有R次**不可重叠、实际从远程转为本地DRAM访问**。每次节省：

\[
\Delta L=L_{\rm remote}-L_{\rm local}
\]

在忽略其他成本变化的模型中，迁移严格有利的条件：

\[
\boxed{R\Delta L>C_{\rm mig}}
\]

**例题：** C_mig=8μs，本地90ns，远程170ns，则每次节省80ns；必须有R>100次才能严格节省总时间；恰好100次仅收支相等。

实际页面若被Node 0和Node 1上的线程交替频繁访问，迁移到一侧可能只把远程开销转嫁给另一侧，甚至发生页面“乒乓迁移”。写共享Line的Cache-to-Cache所有权来回转移是另一类代价，不能把它当作“迁移一个4KiB页”。

Linux自动NUMA balancing可通过采样/NUMA hinting faults和线程/页迁移尝试改善局部性，但扫描、缺页与迁移自身有开销，不保证所有负载加速。参考：https://www.kernel.org/doc/html/latest/admin-guide/sysctl/kernel.html 以及 https://www.kernel.org/doc/html/latest/mm/page_migration.html

## 七、实验如何区分本地DRAM、远程DRAM与Cache-to-Cache？（约2分钟）

建议对相同工作量做四组：**本地First-touch、远程First-touch、Interleave、新启用或关闭自动NUMA balancing**。设置明确的线程亲和性、页面初始化方式和工作集，保持同样的编译器、输入、频率和并发数；多次测量，记录端到端时间与P99。

应至少采集：NUMA页位置（numa_maps/numastat）、本地/远端DRAM请求或带宽（需CPU支持对应PMU/uncore事件）、LLC Miss及Cache-to-Cache/HITM事件、CPU迁移与NUMA hinting faults、实际内存带宽、IPC或关键路径Stall、迁移频率及迁移开销。

避免把三个事件混淆：

- **Cache Hit**：可在本地Cache中命中，没有本次DRAM事务。
- **远端相干Cache提供数据**：可能通过互连发生Cache-to-Cache传输，未必读取远端DRAM。
- **远程DRAM**：真正访问另一NUMA节点内存控制器所连的DRAM。

硬件计数器事件名称与分类精度依CPU型号和PMU而不同；不要把某个通用LLC Miss事件直接当作Remote DRAM计数。

## 八、NUMA不会自行改变MESI或TSO（约1分钟）

MESI/Directory仍负责同一物理Line的正确版本和写权限；NUMA改变的是**数据/线程物理位置及其访问代价**，并不自动改变ISA允许的内存结果。

回顾TSO Store Buffering：

~~~text
初始 X=Y=0
Core 0: STORE X=1; r0=LOAD Y
Core 1: STORE Y=1; r1=LOAD X
~~~

在TSO中，即使所有页都放在本地、或全部远程，两个Store仍可暂留各自Store Buffer，后续不同地址Load可读到旧0，故(0,0)仍可能合法。NUMA可能改变观察发生的概率和延迟，但不凭空改变架构允许集。

同样，**Store已经ROB退休≠对应Store已全局可见≠Dirty Line已经写回DRAM**。远端访问更慢不意味着MESI失效，也不意味着其他核必须等DRAM回写才能读到Modified持有者的最新数据。

## 九、适用边界、总结与下一讲（约1分钟）

NUMA优化不总是“尽量所有页本地”：多线程流式读可能更受带宽控制，Interleave可有利；多个核心只读共享数据可能不值得复制；内存不足会导致回退、迁移或分配失败；Huge Page、THP、容器cpuset、虚拟机、CXL与内存热度变化都会改变理想模型。

本课记住：

\[
\boxed{T_{\rm serial}=N[(1-p)L_{\rm local}+pL_{\rm remote}]}
\]

\[
\boxed{BW_{\max}\le\min(KB/L,\ B_{\rm link},\ B_{\rm mem},\ r_{\rm issue}B)}
\]

\[
\boxed{\text{迁移严格划算}\iff R(L_{\rm remote}-L_{\rm local})>C_{\rm mig}}
\]

**下一讲：第35课（2026年11月23日，第5周第7节复盘）**《相干、内存模型与NUMA综合复盘：从MESI所有权到跨核可见性和页面放置》。按照既定课程安排，第35课复盘而不是跳到DRAM/HBM的新周主题。

---

## 十、四级分级测评（总分100分）

首次发放仅提供题目与不泄露答案的可选提示；Lv1—Lv3可客观判分；Lv4依据Rubric审阅，不作虚假全自动评分。

### Lv1｜First-touch与匿名页放置（15分｜single｜预计2分钟）

一台双Socket Linux服务器采用默认本地优先的匿名页分配策略。主线程固定在Node 0，调用malloc申请8GiB，但尚未访问这些页；之后Node 1上的工作线程第一次实际写入整片数组。忽略缺页前其他触碰、内存不足、显式内存策略及后续迁移。最严谨的结论是什么？

A. 调用malloc的一刻8GiB物理页必然全部放在Node 0，因为申请者在Node 0。
B. 第一次真正分配匿名物理页通常发生在工作线程写入触发缺页时，因此在上述假设下页面优先从Node 1分配。
C. 每条64B Cache Line都可由不同线程在运行时独立决定NUMA节点，故物理页放置毫无意义。
D. 只要MESI正确，Node 1访问Node 0的DRAM就不会有额外互连代价。

*可选提示（不会泄露标准答案）：区分虚拟地址区间的预留和匿名物理页实际分配；问的是谁触发首次缺页，而不是谁调用malloc。*

### Lv2｜NUMA混合延迟数值计算（20分｜numeric｜预计4分钟）

教学延迟模型：一个固定工作负载产生5000次彼此完全串行、无法与计算重叠、均到达DRAM的64B读Miss，其中35%访问远程NUMA节点。每次本地Miss耗时90ns、远程Miss耗时170ns，除这批Miss之外不计任何成本。请计算这些Miss合计暴露的延迟，单位微秒（μs）。只填数值。

请填写数值，单位：μs。

*可选提示（不会泄露标准答案）：先按本地与远程比例加权求平均单次延迟，再乘总次数；最后由ns换算成μs。*

### Lv3｜线程绑核、页面放置与模型边界（25分｜multi｜预计5分钟）

关于Linux NUMA页面放置、互连与内存语义，选出所有正确陈述。假定普通相干CPU内存，命令含义以当前numactl/Linux文档为准。

A. 仅使用numactl --cpunodebind=1约束CPU执行节点，不能保证已经在Node 0的物理页自动搬迁到Node 1。
B. 只要malloc成功，就已为所有匿名页分配了Node 0或Node 1的物理页，后续first-touch不再影响放置。
C. 跨节点interleave可将新页分配分散到多个节点，可能缓解单节点带宽压力，也可能提高特定线程的远程访问比例。
D. 一次跨Socket的数据读取必然到达远端DRAM，不能由本地Cache命中或远端相干Cache提供。
E. Linux自动NUMA平衡可能利用采样/NUMA hinting faults及页面迁移改进局部性，但其开销或共享访问模式也可能让程序变慢。
F. NUMA距离和MESI写权限交接的开销一旦发生变化，TSO所允许的Store Buffering结果就会自动改变。

*可选提示（不会泄露标准答案）：分别检查CPU绑核是否移动旧页、malloc是否触发缺页、interleave的粒度、Cache Hit与Remote DRAM的区别、自动迁移的代价以及协议与内存模型的分层。*

### Lv4｜NUMA性能、迁移与正确性综合设计（40分｜open｜预计10—12分钟）

两Socket服务器：Node 0、Node 1各有本地DRAM；普通一致性CPU内存；采用确定性教学参数，除题中明确项外忽略其他延迟和竞争。回答A—D，并说明模型边界。

A｜线程/页面放置（12分）：Node 1工作线程执行40000次完全串行且不可重叠的DRAM Miss，本地95ns、远程175ns。比较所有数据页都在Node 0与全部在Node 1两种情况的总访存时间（ms）、节省时间（ms）和加速比；解释怎样用parallel first-touch实现更好的页面初始放置。

B｜MLP与互连瓶颈（10分）：该线程另一阶段连续发起独立远程64B Line Miss，平均每次占用180ns，最多24个未完成请求；远程链路的有效数据传输上限8GB/s、远端DRAM带宽30GB/s、请求发出能力0.30 Line/ns。用Little定律求远程读取的理想吞吐上界（GB/s），指出瓶颈；不得把延迟直接当成IPC。

C｜迁移盈亏点（10分）：把一个热点4KiB页面从Node 0迁到Node 1，一次性有效迁移成本（包括复制、页表、TLB等）为12μs；此后每次无法重叠的DRAM访问由远程175ns变为本地95ns。忽略迁移后的新共享竞争。求要使迁移严格划算至少还需要多少次访问；若只剩100次或400次，分别判断。说明两核交替写同一页为何会使结论失效。

D｜可验证实验与正确性（8分）：提出本地first-touch、远程first-touch、按页interleave、自动NUMA balancing四组公平实验，至少列出四类监测量或实验控制；区分远程DRAM访问与Cache-to-Cache/HITM。最后解释为何NUMA改变了延迟却不自行改变MESI的相干不变量和TSO中经典SB (0,0)的合法性。

请分A—D给出推导、模型假设与设计理由。

*可选提示（不会泄露标准答案）：A把总串行Miss延迟乘次数，注意毫秒转换；B分别计算K/L×64B、互连和内存速率的上界再取最小；C比较剩余访问节省和迁移成本并注意严格大于；D同时锁定CPU和页面放置，查看numa_maps、numastat及相干事件。*

**评分规则：** Lv1 15分，Lv2 20分，Lv3 25分，Lv4 40分。≥80分进入既定第35课复盘；60—79分补一个页放置/迁移算例；低于60分重点回顾第24、25、29—34课。补练不改变课号。
