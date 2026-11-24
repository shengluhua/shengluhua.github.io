---
title: "第36课｜DRAM内部结构：Bank、Row Buffer、ACT/PRE与行命中"
track: arch
number: 36
date: 2026-11-24
week: 6
minutes: 16
kind: full
summary: "从1T1C存储单元到Bank和行缓冲，推导行命中、空行与行冲突延迟，追踪ACT/RD/PRE时序，并分析Bank级并行与地址映射的性能权衡。"
tags: [DRAM, bank, row-buffer, ACT, PRE, timing, memory-controller, BLP]
diagram: mermaid
---

# 计算机体系结构 · 第36课
## DRAM内部结构：Bank、Row Buffer、ACT/PRE与行命中

**2026年11月24日｜第6周第1节｜约16分钟（测评另计）**

前五周我们通常把DRAM延迟当作常数。今天进入DRAM/HBM专题：为什么同一个内存控制器、同样大小的64B读取，有时只需一次列访问，有时却要先关闭旧行、打开新行？为什么随机访问即使总字节数不大，也可能无法跑满内存带宽？

## 一、动机与物理原理（3分钟）

DRAM的典型存储单元是1T1C：一个访问晶体管和一个微小电容。电容上的电荷编码数据，字线控制晶体管，位线连接感放器（Sense Amplifier）。

读之前，位线通常被均衡到约VDD/2。ACT打开字线，电容与位线发生电荷共享，产生微小电压偏移；感放器将其放大并恢复单元电荷。这个过程通常同时作用于一整行，而不是只激活CPU要读的64B。打开的行由感放器保持，构成Row Buffer；RD列命令选择其中一部分输出。

~~~mermaid
flowchart LR
 A["1T1C阵列：选中整行"] -->|"ACT：电荷共享"| S["感放器：放大并恢复"]
 S --> R["Row Buffer：打开的行"]
 R -->|"RD：选择列"| D["I/O与数据总线"]
 R -->|"PRE：关闭行并均衡位线"| P["Bank关闭"]
 P -->|"下一次ACT"| A
~~~

DRAM读取具有破坏性读出的物理特征，因此需要恢复电荷；即使不读取，电荷也会随时间泄漏，需要周期性Refresh。PRE是关闭已打开的行并准备下一次ACT，不是把CPU脏Cache Line写回DRAM。

## 二、Channel、Rank、Bank、Row、Column（2分钟）

| 层级 | 含义 |
|---|---|
| Channel | 独立的命令/数据接口及控制路径 |
| Rank | 通常由一组协同响应命令的DRAM芯片构成 |
| Bank | 可独立维护打开行状态的存储阵列单元 |
| Row | ACT选中的一整行单元 |
| Column | RD/WR从打开行中选择的数据部分 |

教学假设：一个Bank只有一个可供外部访问的打开行（不讨论子阵列并行优化）；不同Bank可以同时保留各自的打开行，但共享通道的数据总线和部分时序资源。

例如8KiB的Rank级有效行容量包含128个64B Line。实际行容量、Rank组织、Bank Group以及地址映射随设备和控制器而变。CPU的Cache Line、OS物理页和DRAM Row是不同粒度，不能因为地址相邻就断言一定访问同一Row。

## 三、三种访问路径与延迟公式（3分钟）

采用普通读请求、open-page策略：访问结束后保持行打开。先假设命令可以立即发出、旧行已满足PRE条件、无排队/刷新/总线冲突；延迟测到第一个数据beat，而非最后一个beat或CPU Load退休。

| 参数 | 含义 |
|---|---|
| tRCD | ACT到RD的最小时间 |
| tCL | RD到第一个读数据beat的时间（CAS latency） |
| tRP | PRE到下一次ACT的最小时间 |
| tRAS | ACT到同Bank PRE的最小时间 |
| tRC | 同Bank相邻ACT的最小间隔 |
| tRTP | RD到同Bank PRE的最小时间 |
| tBURST | 数据burst持续时间 |

三条路径：

~~~text
Row Hit       :              RD ── tCL ── Data
Closed-row    :      ACT ─tRCD─ RD ─tCL─ Data
Row Conflict  : PRE ─tRP─ ACT ─tRCD─ RD ─tCL─ Data
~~~

因此在上述严格条件下：

\[
L_h=t_{CL},\qquad L_e=t_{RCD}+t_{CL},\qquad
L_c=t_{RP}+t_{RCD}+t_{CL}.
\]

若tCL=14ns、tRCD=14ns、tRP=14ns，则三种首数据延迟分别为14、28、42ns。行冲突是行命中的3倍，但这不是端到端CPU访问延迟的3倍，因为还存在Cache/NoC/控制器队列及数据返回路径。

如果行命中、空行和冲突的比例分别为h、e、c，且h+e+c=1，则在相同简化模型下：

\[
\bar L=hL_h+eL_e+cL_c
=t_{CL}+(e+c)t_{RCD}+ct_{RP}.
\]

例如h=0.6、e=0.1、c=0.3时，平均首数据服务延迟为14+0.4×14+0.3×14=23.8ns。这是服务延迟账本，不是并行请求的完成时间之和。行命中率的分母是到达DRAM控制器的请求（或明确约定的burst），不是CPU的所有Load。

## 四、真正的时序Trace：为什么不能只加tRP+tRCD+tCL？（3分钟）

假设Bank初始关闭，所有时刻以ns计；tRCD=14，tCL=14，tRAS=34，tRTP=8，tRP=14，tRC=48，burst持续4。只考虑这些时序，并额外要求PRE不得早于旧读burst结束。忽略其他约束。

t=0发ACT打开Row A，t=14最早发RD；首beat在28，burst结束在32。若此时想读同Bank的Row B，PRE同时受到三个下界：

\[
t_{\rm PRE}\ge\max(t_{\rm ACT}+t_{RAS},
t_{\rm RD}+t_{RTP},t_{\rm data,end}).
\]

代入得max(34,22,32)=34。接下来：

\[
t_{\rm ACT,B}\ge\max(t_{\rm PRE}+t_{RP},t_{\rm ACT,A}+t_{RC}).
\]

故ACT B最早48，RD B最早62，首beat最早76ns。

| 命令/事件 | 最早时刻(ns) |
|---|---:|
| ACT A | 0 |
| RD A | 14 |
| A首beat / burst结束 | 28 / 32 |
| PRE A | 34 |
| ACT B | 48 |
| RD B | 62 |
| B首beat | 76 |

这里tRAS不是每次访问都要另外加上的固定惩罚，而是对ACT与PRE之间的最短时间约束；tRC也不是每个Row Hit都必须等待的间隔。真实DRAM还有tCCD、tRRD、tFAW、读写切换、tWR及Refresh等限制。上述PRE等待burst结束是本例额外教学条件，不是所有DDR设备的通用独立时序参数。

## 五、Bank级并行、地址映射与性能反例（3分钟）

考虑两个Bank和两个相邻独立请求。若都映射到Bank 0的不同Row，第二个可能必须等待第一行关闭；若分到不同Bank，可以交错发出ACT/RD，让阵列等待重叠。

假定物理Line编号i=floor(address/64)，教学映射为Bank=i mod 2，Row=floor(i/8)。对访问0、1、2、3，两个Bank可各自保持Row 0；而0、8、16、24均落在Bank 0的不同Row，会不断产生行切换。这个例子仅用于理解位映射；真实控制器可能采用XOR哈希等映射。

若有m个独立Bank，每Bank每tRC最多启动一次ACT，每ACT恰好服务一个B字节请求，则仅从Bank侧得到：

\[
BW_{\rm bank}\le \frac{mB}{t_{RC}}.
\]

同时考虑通道有效带宽BWbus、在途容量K及平均请求占用L，由Little定律：

\[
BW\le\min(BW_{\rm bank},BW_{\rm bus},KB/L).
\]

例如8个Bank、tRC=48ns、B=64B，每个ACT只读一条Line，Bank上界约10.67GB/s；若数据总线25.6GB/s、在途容量充分，增加总线带宽也不能消除这个Bank瓶颈。若一个ACT服务许多Row Hit，上述每请求都需ACT的假设不再成立，必须改用列命令和总线等限制。

Open-page倾向保留行局部性，close-page倾向尽早关闭行以减少未来冲突等待，但可能丢失本来可命中的行。即使有90%行命中率，若请求集中到一个Bank、排队过长或阻塞关键请求，仍可能比更均匀的Bank映射慢。

## 六、跨层边界、实验与下一讲（2分钟）

DRAM控制器可以重排独立请求以提高行命中率或Bank并行度，但CPU通过LSQ、Store Buffer、相干协议和同步机制约束架构观察。TSO允许不同地址Store→Load的特定放松，经典SB中两个Load可以读旧0；这不是DRAM行冲突造成的，也不表示控制器可任意违反ISA排序。

Store从ROB退休、该Store全局可见、Dirty Line最终写回DRAM是三个不同事件。全局可见的新值可能从另一核的Modified副本获得，甚至不触发DRAM读。

实验可用受控物理地址Trace或DRAM模拟器，比较同一Row、同Bank不同行及不同Bank；固定工作量、并发请求数与读写比例，记录row hit/closed/conflict、ACT/PRE数量、Bank利用率、控制器排队、总线吞吐、平均/P99延迟及端到端时间。不能把LLC Miss直接计作Row Conflict，也不能把虚拟地址的相邻性直接当成DRAM Row局部性。

参考：[gem5 DRAMInterface时序参数](https://gem5.googlesource.com/public/gem5/+/c76fa4d39e0c736d333a5759dcd2e69dfb2082c6/src/mem/DRAMInterface.py)、[gem5 DRAMCtrl的DDR4参数实例](https://gem5.googlesource.com/public/gem5/+/4e1117f2ba842009fb596680ac91b888491c7a9c/src/mem/DRAMCtrl.py)。课程数值为教学设定，不代表特定JEDEC器件规格。

下一讲：**第37课（2026年11月25日，第6周第2节）《DRAM控制器调度：FR-FCFS、Bank级并行与读写切换》**。将进一步研究如何从请求队列中选出下一条命令，以及为什么优先行命中可能伤害尾延迟。

## 七、四级分级测评（100分）

首次发放不公布标准答案和解析。前三题客观判分，第四题按Rubric审阅评分。

### Lv1｜CPU Cache Miss与DRAM Row Hit（15分，单选，预计2分钟）

同一Bank已打开Row A。CPU发生一次LLC Miss，内存控制器收到对Row A另一列的读请求。以下哪项最严谨？

A. LLC Miss必然意味着DRAM Row Buffer Miss，必须先PRE再ACT。

B. 只要是Row Buffer Hit，数据就已经在CPU L1中。

C. 若该行仍打开且命令时序允许，可以直接RD；但仍有列访问、数据传输和可能的排队开销。

D. Row Buffer Hit无需RD命令，也不占用数据总线。

可选提示：分别考虑CPU缓存与DRAM感放器中的数据，以及列命令是否仍必要。


### Lv2｜多重时序约束与最早读出时刻（20分，数值，预计4分钟）

单Bank起初关闭，t=0发ACT打开R0，最早时刻发RD读取R0，随后尽早切换到R1并读取。tRCD=12ns，tCL=10ns，tRAS=32ns，tRTP=8ns，tRP=11ns，tRC=43ns，burst=4ns。只考虑上述约束，PRE不得早于前一burst结束；无排队、刷新或其他总线冲突。求R1读出的第一个数据beat最早在哪个时刻到达（ns）？

可选提示：分别列出PRE的三个下界，再检查下一次ACT的tRP和tRC约束。


### Lv3｜Bank映射与行状态Trace（25分，多选，预计5分钟）

两个Bank初始均关闭，采用open-page策略。Line编号i映射为Bank=i mod 2、Row=floor(i/8)，每次请求完成后保持对应行打开，无刷新或其他访问。依次请求Line 0,2,1,8,3,10,0。选择所有正确说法。

A. 访问Line 2时发生Row Hit。

B. 访问Line 3时，因前一请求访问了Bank 0的Row 1，所以必然发生Row Conflict。

C. 整个Trace包含3次Row Hit、2次Closed-row Miss、2次Row Conflict。

D. 最后访问Line 0时无需ACT，因为它曾在第一次请求中被打开。

E. Bank 0与Bank 1可以分别保持各自的打开行，但共享通道仍可能限制实际并行吞吐。

F. 仅凭上述行命中率，可以唯一确定真实CPU的IPC。

可选提示：分别维护两个Bank的当前打开行；不能只记整个通道最近打开的一行。


### Lv4｜控制器调度、吞吐上界与语义验证（40分，开放，预计10—12分钟）

A（12分）：单Bank初始关闭，6个相互独立的64B读请求同时进入队列，按到达次序为R0,R1,R0,R1,R0,R1。采用独立的简化串行服务模型：closed-row=24ns、hit=12ns、conflict=36ns，成本不重叠，忽略其余时序。分别计算FIFO与按行分组（先全部R0再全部R1）的总服务时间、行命中数和加速比，说明重排成立的前提。
B（12分）：另一个通道有4个独立Bank，每Bank每32ns最多完成一次新的ACT，每次ACT只服务一个64B请求；数据总线有效上限12.8GB/s，最多12个在途请求，平均占用80ns，其他约束忽略。推导Bank、总线、在途容量三种吞吐上界并指出瓶颈；解释改为每次ACT服务多个请求后哪个假设失效。
C（8分）：若持续到达的R0请求使较老R1冲突请求一直等待，设计一个含年龄阈值或公平仲裁的调度器，指出应监测的尾延迟、吞吐和行命中指标，以及有限服务保证所需假设。
D（8分）：解释为什么DRAM控制器重排请求不等于ISA允许任意内存重排；用TSO的Store Buffering说明Store退休、全局可见、最终DRAM写回三者，并解释脏Line如何由相干路径提供最新值。

可选提示：A按顺序维护打开行；B分别从每Bank的ACT频率、总线和Little定律出发；C考虑饥饿与资源容量；D区分物理服务顺序与架构观察顺序。

评分后：80分及以上继续既定专题；60—79分补一例；低于60分重点回顾再练。课程编号不因补练改变。
