---
title: "第38课｜DDR数据率、Channel/Rank/Bank Group与带宽计算"
track: arch
number: 38
date: 2026-11-26
week: 6
minutes: 16
kind: full
summary: "从MT/s、Burst与DDR5子通道出发，推导带宽、Bank Group约束、流量不均与MLP上界，并连接HBM及LLM访存。"
tags: [DDR, DDR5, channel, rank, bank-group, bandwidth, HBM, MLP]
diagram: mermaid
---

# 计算机体系结构 · 第38课
## DDR数据率、Channel/Rank/Bank Group与带宽计算

**2026年11月26日｜第6周第3节｜约16分钟（测评另计）**

### 一、动机：为什么带宽翻倍，随机访问却不一定快一倍？（2分钟）

第36课研究DRAM行激活，第37课研究控制器如何调度。今天研究数据如何从打开的行真正传到CPU或GPU。

假设一条DDR4-3200接口升级成DDR5-6400，64-bit总有效数据宽度不变，理论峰值带宽翻倍。但若程序是严格依赖的指针追逐链，下一次读的地址必须等前一次返回，性能可能几乎不变。带宽描述单位时间搬多少数据，延迟描述一笔请求何时返回，二者不是同一物理量。

### 二、MT/s、MHz和GB/s（3分钟）

设R为每根数据线的传输率（MT/s），W为有效数据线宽度（bit），C为同构独立接口数量，BL为一次burst的传输次数，B为每请求物理传输字节数，K为在途请求容量，L为平均请求占用时间（ns）。GB/s一律采用十进制，1 B/ns=1 GB/s。ECC校验位、刷新、总线空闲和命令开销暂不计。

DDR（Double Data Rate）在数据时钟的两个边沿均传输。普通DDR4/DDR5的接口数据率为CK频率的2倍；它不是DRAM内部存储阵列每秒激活次数。

DDR5-6400表示每根数据线每秒64亿次传输，而非6400 MHz的CK。CK为3200 MHz，每周期0.3125 ns；单次数据传输间隔为0.15625 ns。

~~~text
CK周期:   |------- 0.3125 ns -------|
数据beat: ↑           ↓           ↑
          beat 0      beat 1      beat 2
~~~

每次传输可同时搬运W/8字节，因此

\[
BW_{\rm peak}=\frac{R\,W}{8000}\quad \mathrm{GB/s}.
\]

C个独立同构接口若同时满载，理论峰值为C倍。R已经包含双边沿，不能再乘2。

| 配置（有效数据宽度） | 理论峰值 |
|---|---:|
| DDR4-3200，64 bit | 25.6 GB/s |
| DDR5-4800，64 bit合计 | 38.4 GB/s |
| DDR5-5600，64 bit合计 | 44.8 GB/s |
| DDR5-6400，64 bit合计 | 51.2 GB/s |
| DDR5-6400，8个64-bit等效接口 | 409.6 GB/s |

### 三、Burst与DDR5子通道（3分钟）

一个RD命令选择打开行中的一段数据，接口通过连续多个beat返回它。Burst有效负载和占用时间：

\[
P_{\rm burst}=BL\frac W8,\qquad
t_{\rm burst}=\frac{1000BL}{R}\ {\rm ns}.
\]

标准非ECC DDR4 DIMM通常为64-bit数据接口、BL8，一次传64 B；标准非ECC DDR5 DIMM通常分成两个独立32-bit子通道，每个采用BL16，一次仍传64 B。这种拆分使两个独立访问可分别调度。具体器件也可支持其他burst模式。

~~~mermaid
flowchart TD
  MC["Memory Controller"] --> A["DDR5 子通道 A：32 bit"]
  MC --> B["DDR5 子通道 B：32 bit"]
  A --> A0["Rank 0"]
  A --> A1["Rank 1（可选）"]
  B --> B0["Rank 0"]
  B --> B1["Rank 1（可选）"]
  A0 --> BG["Bank Groups → Banks → Rows"]
~~~

DDR5-5600的一个32-bit子通道：每beat 4 B，BL16得到64 B，burst占16/5.6=2.857 ns，理论22.4 GB/s；两个子通道合计44.8 GB/s。不能把两个子通道分别当成64-bit接口。

Rank通常由协同提供整个接口数据宽度的一组芯片构成。例：一个32-bit非ECC Rank可由4颗x8器件构成；每颗在每beat提供8 bit。增加共享同一数据线的Rank可增容量、Bank资源及调度机会，但不直接增加物理数据线宽度。两个DIMM插在同一接口也不自动等于两个独立通道，还可能影响可支持的数据率。On-die ECC与系统级ECC不同，不能将校验位当用户数据带宽。

### 四、为什么Bank Group也会限制带宽？（2分钟）

DDR4/DDR5中的Bank Group将Bank组织为组；某些内部资源在组内共享，因此同组连续列命令间隔往往长于跨组间隔（常用tCCD_L与tCCD_S表示）。具体时序按器件及命令类型确定。

教学模型：各目标行已打开，每条RD产生64B、占用4 ns的burst；同组RD至少间隔8 ns，跨组相邻RD至少4 ns，固定CL，忽略其他限制。

| RD顺序 | 最早发出时刻（ns） | 从首burst开始到末burst结束 |
|---|---|---:|
| A0、A1、A2（同组） | 0、8、16 | 20 ns |
| A0、B0、A1（交替组） | 0、4、8 | 12 ns |

长期稳定同组访问时，列命令上界为64/8=8 GB/s；交替组可达64/4=16 GB/s（忽略其他瓶颈）。两者都可以100% Row Hit，却有不同吞吐。Bank并行、行局部性和Bank Group分布需要共同优化。

### 五、延迟与带宽为什么可以分离？（2分钟）

CL以CK周期计数，必须换算为ns：

\[
t_{\rm CK}=2000/R\ {\rm ns},\qquad
t_{\rm CL}=CL\cdot2000/R\ {\rm ns}.
\]

例如DDR4-3200 CL16与DDR5-6400 CL32（教学配置）均为10 ns的RD到首数据延迟。后者64-bit合计峰值翻倍，但CAS时间相同。若DDR5某实际配置CL更大，CAS时间还可能更长。Intel的13代Core数据表列出的DDR4-3200 CL22和DDR5-5600 CL50分别对应13.75 ns和约17.86 ns，说明数据率提高并不保证CAS下降。这只是指定平台时序，不是所有产品通用参数。

CPU端到端延迟还包含Cache/TLB、互连、控制器排队、ACT/PRE、数据回传等。CAS不是全部访问延迟。

对严格依赖的64B指针链，若每次端到端延迟100 ns，吞吐上界仅64/100=0.64 GB/s；总线再宽也无法凭空创造并发请求。

### 六、从理论峰值到可达带宽（2分钟）

Little定律：平均在途量=请求完成率乘平均占用时间。因此

\[
BW_{\rm MLP}\le KB/L.
\]

若总流量为X，接口j承担比例p_j且峰值为b_j，则流量守恒要求

\[
p_j X\le b_j,\qquad
BW\le\min\left(KB/L,\min_{j:p_j>0}b_j/p_j\right).
\]

另需考虑Bank激活、列命令、刷新与读写切换等约束。

例：两个独立64-bit DDR5-5600接口，每个44.8 GB/s，若70%物理流量集中于接口0，则X≤44.8/0.7=64 GB/s，低于均衡时89.6 GB/s。若K=80、L=100 ns、B=64 B，在途容量又给出51.2 GB/s上界，此时单独均衡地址也不一定加速。要充满89.6 GB/s至少需要140个在途请求，且这只是必要条件。

地址映射/NUMA放置、请求并发、Row/Bank Group局部性是独立但相互影响的优化手段；L随排队变化时不能视为固定常数。

### 七、HBM与LLM推理的联系（2分钟）

HBM通过堆叠DRAM及先进封装提供宽接口，而不是仅提高每根线的速度。例如Micron HBM3E采用1024个I/O，官方标称单堆栈带宽超过1.2 TB/s。用教学值9.6 Gb/s/pin计算：

\[
BW=1024\times9.6/8=1228.8\ {\rm GB/s}.
\]

这是宽接口带来的聚合带宽，不代表单次随机读取延迟比DDR小几十倍，也不代表每次请求同时使用全部1024条数据线。

对小batch LLM decode，若每步必须从HBM读取16 GB模型权重、总有效物理带宽2 TB/s，忽略KV Cache、其他读写和计算，则单步至少8 ms，batch=1时至多125 token/s。这只是带宽下界模型；更大batch可以摊薄权重流量，但KV流量、计算、调度和通信都可能改变瓶颈。

有效负载吞吐还取决于实际利用的字节比例u：BW_useful=u×BW_physical。Roofline中若算术强度以有用字节为分母，就必须配套使用有用带宽。

### 八、反例、实验与内存顺序

测量带宽时分别使用大数组流式访问、单链指针追逐、多条独立指针链；固定工作量和线程/NUMA放置，记录分通道字节流量、在途请求数、Row Hit、Bank Group列命令阻塞、数据总线利用率、平均/P99延迟及端到端时间。物理地址映射需验证，不要直接从虚拟地址推断。

DDR峰值不是读写各自可同时获得的全双工带宽。CPU写入也不必立即到达DRAM：普通相干内存中，TSO的同核Store顺序约束的是架构可见性，不是之后脏Line的物理写回次序。经典SB的两个Load都读0可以来自Store Buffer尚未传播，而非DDR传输太慢；M权限、ROB退休、全局可见与DRAM写回不能混为一谈。

参考：[Micron DDR5 SDRAM](https://www.micron.com/products/memory/dram-components/ddr5-sdram)、[Micron DDR5 Client Module Features](https://assets.micron.com/adobe/assets/urn%3Aaaid%3Aaem%3A5902f17e-8bde-4246-971c-8d7f274c6b1a/original/as/ddr5-key-module-features-wp-client.pdf)、[Intel 13th Gen Core System Memory Timing Support](https://edc.intel.com/content/www/us/en/design/products/platforms/details/raptor-lake-s/13th-generation-core-processors-datasheet-volume-1-of-2/003/system-memory-timing-support/)、[Micron HBM3E](https://www.micron.com/products/memory/hbm/hbm3e)。

### 九、总结与下一讲

牢记峰值带宽=每pin传输率×有效数据宽度；Rank共享接口，子通道提供独立调度；真实带宽由流量分布、列命令、在途容量与共享资源共同限制。

第39课（2026-11-27）《DRAM刷新与可靠性：tREFI、tRFC、Refresh调度及ECC》，讨论为何不访问的DRAM也消耗资源，以及Refresh对尾延迟的影响。

### 十、四级分级测评（100分）

首次不提供标准答案。前三题客观判分，开放题按Rubric审阅。80分及以上继续；60—79分补一例；低于60分重点复习再练，不改变课号。

#### Lv1｜Rank与子通道（15分，预计2分钟）

一条普通非ECC DDR5 DIMM具有两个独立32-bit子通道，每个子通道均支持BL16。若在其中一个子通道增加一个共享相同数据线的Rank，下列哪项最准确？

A. 该子通道的数据线宽度立即变为64 bit，峰值带宽翻倍。
B. 单次BL16读取的有效负载变为128 B。
C. 容量和可调度Bank资源可能增加，但该子通道物理数据线宽度和固定数据率下的理论峰值不因此翻倍。
D. Rank数量增加必然使随机访问首数据延迟减半。

可选提示：区分独立的数据接口和共享接口上的可选设备集合。

#### Lv2｜Burst传输时间（20分，预计4分钟）

一个32-bit DDR5-6400子通道以BL16连续读取4条不同的64B Cache Line。第一个burst的首beat于t=18 ns开始；所有后续burst无间隙、无重叠，数据率恒定。按半开传输区间计算，最后一个burst传输结束的时刻是多少ns？

可选提示：先求每个burst的持续时间，再加上首个burst开始前的时间。

#### Lv3｜Bank Group列命令调度（25分，预计5分钟）

一个教学Rank有两个Bank Group A、B，所有目标行已打开。读命令对应的数据burst均占4 ns，固定CL相同。任意同组两条RD至少间隔8 ns，异组相邻RD至少间隔4 ns；另忽略全部限制。4条独立请求按到达顺序为A0、A1、B0、B1，四条均在t=0就绪。首RD在t=0。选择所有正确说法。

A. 按A0、A1、B0、B1发RD的最早时刻为0、8、12、20 ns。
B. 按A0、B0、A1、B1发RD的最早时刻为0、4、8、12 ns。
C. 两种顺序的RD都命中Row Buffer，因此总线占用的时间跨度必然相同。
D. 交替Bank Group可在本例中消除连续数据burst之间的空闲。
E. 只要继续增加同一Bank Group内的Bank数量，必然可以消除本例的同组列命令间隔约束。

可选提示：逐条检查同组间隔、异组间隔和数据burst时间。

#### Lv4｜通道流量、MLP与Roofline综合设计（40分，预计10—12分钟）

某教学CPU有两个彼此独立的64-bit DDR5-6400等效数据接口（每个可由两个32-bit子通道组成），传输单位64B。所有请求均为读，假设每个接口均可达到理论数据率，平均请求占用时间100 ns，最多128个在途请求，除题设约束外无额外开销。
A（10分）：推导每接口和全系统的理论峰值；若80%流量必须经接口0，推导固定流量比例下的总吞吐上界，并说明为何总带宽不能简单相加。
B（12分）：把流量调整为50/50，结合Little定律求调整前后综合带宽上界及其比值。若想达到平衡配置的理论峰值，至少要多少个在途请求？
C（10分）：若每次传输64B，但程序只使用其中16B，分别求平衡后K=128时的有效负载吞吐上界；若工作负载算术强度为每个有用字节2 FLOP，计算其内存侧算力上界。说明这种口径与按物理流量计算的算术强度如何一致。
D（8分）：设计实验区分接口负载不均、在途容量不足、Bank Group列命令限制、缓存命中和实际有用字节比例；解释为何DDR写回顺序改变不等于TSO Store可见顺序改变。

可选提示：对每个接口写流量守恒不等式；再加在途请求约束，最后区分物理字节和程序使用字节。
