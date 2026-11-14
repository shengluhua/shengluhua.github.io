---
title: "第26课｜硬件预取：Stride/Stream预测、准确率、覆盖率与Cache污染"
track: arch
number: 26
date: 2026-11-14
week: 4
minutes: 18
kind: full
summary: "从Stride和Stream预取算法出发，推导预取距离与MSHR容量及带宽的关系，区分准确率、覆盖率和及时性，并以Cache污染和TSO边界检验预取效果。"
tags: [cache, hardware-prefetching, stride, stream, next-line, prefetch-distance, prefetch-degree, accuracy, coverage, timeliness, pollution, MSHR, bandwidth, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第26课
## 硬件预取：Stride/Stream预测、准确率、覆盖率与Cache污染

**2026年11月14日｜第4周第5节新课｜预计18分钟**

第25课证明：如果多个Cache Miss可以并发，MSHR与下级带宽决定理想的Miss完成率。但仅仅增加MSHR还不够——CPU必须在程序真正需要数据之前，就知道应该请求哪些地址。

这就是**预取（Prefetching）**：在需求访问（Demand Access）到达前，根据已经观察到的访问模式预测未来可能需要的Cache Line，并提前发出读取。

本课解决四个问题：**预取器怎样预测地址？应该提前多远？如何衡量是否真的有用？为什么预取器越激进，程序反而可能越慢？**

特别提醒：预取不是把DRAM的100周期延迟变成10周期；它主要尝试把等待转移到需求访问之前，与有用计算重叠。

## 一、动机：把访存等待挪到需求之前（约2分钟）

假设访问一条缺失的Line需要100周期。某程序按固定间隔遍历数组，每20周期将用到下一条不同Line。

没有预取时，需求Load抵达某Line却发现数据不在Cache，可能直接暴露较长等待。

有预取时，处理器可在当前访问Line i时请求未来的Line i+d。只要这条请求足够早完成，后面的需求Load就可能直接命中。

~~~mermaid
flowchart LR
  A["Demand访问Line i"] --> P["预测未来Line i+d"]
  P --> Q["分配预取请求 / MSHR"]
  Q --> M["下级内存并行服务"]
  A --> C["CPU继续执行独立工作"]
  M --> F["Line提前填入合适Cache层"]
  C --> D["未来Demand访问i+d"]
  F --> D
  D --> H["可能Hit：隐藏原本Miss等待"]
~~~

**“提前取到”是关键，不是“最终猜中了”就够。** 如果需求Load在预取数据返回之前到达，它仍可能等待，或与未完成预取合并。

此外，预取请求也使用真实资源：Cache容量、MSHR、LQ/内部请求队列、Cache端口、互连和内存带宽。不能假设预取是免费的。

## 二、三种典型硬件预取器（约3分钟）

先定义64B为一条Cache Line，块号为：

\[
\operatorname{line}(a)=\lfloor a/64\rfloor.
\]

地址差应按**Line粒度**识别，否则在同一条64B Line内访问不同8B元素，可能把真正的Line级Stride误判成0或不稳定的字节差。

### 2.1 Next-line Prefetcher：只看相邻行

看到Line 100被Demand访问，就预测Line 101；看到Line 101再预测Line 102。

适合连续扫描，却不适合每次跳过好几条Line的访问。下一行如果原本就留在Cache中，无脑重复取也会浪费资源。

### 2.2 Stream Prefetcher：识别前向/后向流

连续观察某区域的Line序列，识别方向，再追踪一条访问流（Stream）：

~~~text
前向流：  100 → 101 → 102 → 103 → ...
后向流：  300 → 299 → 298 → 297 → ...
~~~

检测到稳定流后，可以向前或向后预取多条Line。实际设计需要防止跨越不合法边界，并考虑流表容量、置信度、已在Cache中的块及资源繁忙程度。

### 2.3 Stride Prefetcher：学习固定差分

对某条产生访存的指令PC，记录其历史访问的Line编号：

\[
x_0,x_1,\ldots,x_n,\qquad
\Delta_n=x_n-x_{n-1}.
\]

若连续多个差分稳定为 \(s\)，预测下一次同一PC的访问：

\[
\boxed{\hat x_{n+k}=x_n+ks}.
\]

例如某Load PC依次访问：

~~~text
Byte地址：0x1000 → 0x1080 → 0x1100 → 0x1180
Line编号：   64   →   66   →   68   →   70
Stride：             +2       +2       +2
~~~

若已确认该模式，接下来可以预测Line 72、74等，而不是盲目预取Line 71。

**为什么按PC分别学习？** 两条不同Load指令可能分别访问连续数组和隔列矩阵。若把二者地址混在单一全局序列里，差分会剧烈变化，原本各自稳定的模式反而看不出来。

更成熟的预取器还会记录置信度（Confidence），要求某种模式重复出现后才开始较激进的预测，并且限制同一页或可合法翻译区域中的请求。gem5提供了按PC维护预测表、并可配置Degree和Distance的Stride预取器实现说明：
https://doxygen.gem5.org/develop/classgem5_1_1prefetch_1_1Stride.html

## 三、Degree与Distance：数量和提前量不能混淆（约2分钟）

**Degree（预取度数）**：一次触发生成多少条候选预取。

**Distance（预取距离）**：从当前Demand位置向未来跳多远才开始请求，可能以Line或Stride的倍数定义；具体实现一定要注明单位。

例如确认Stride为+2 Line，当前Line 70，采用“向前2个Stride开始，连续发3条”的本课模型：

~~~text
当前Demand：Line 70
跳过未来第1次位置：Line 72
预取候选：Line 74、76、78
~~~

提高Degree可能增加覆盖率，也可能使未用数据增多、填充过早、竞争更严重。

增大Distance可能让请求更及时，但太早的Line可能在真正使用之前被替换掉，导致**Early Prefetch**。距离太近则产生**Late Prefetch**，预取还没有返回，需求Load已经来了。

所以预取调参有两个不同方向：**请求多少（Degree）**与**提前多远（Distance）**。二者不能互相代替。

## 四、推导：预取距离、内存延迟和MSHR容量（约3分钟）

建立一个确定性、长期稳态、单一顺序流的教学模型：

- 每隔 \(T\) 周期，程序需求下一条不同Cache Line；
- 每条预取Miss占用MSHR的往返时间为 \(L\) 周期；
- 预取距离为 \(d\) 个未来需求间隔；
- 请求彼此独立、无合并；忽略起步、停机和其他拥塞；
- 数据必须在对应Demand访问之前到达。

从当前需求发出预取，到目标未来需求抵达，理想领先时间为：

\[
T_{\rm lead}=dT.
\]

为了及时：

\[
\boxed{dT\ge L}
\quad\Rightarrow\quad
\boxed{d_{\min}=\lceil L/T\rceil}.
\]

**数值例题：** \(L=90\)周期，每15周期需要下一条Line：

\[
d_{\min}=\lceil90/15\rceil=6.
\]

也就是说，在这种平稳、理想条件下至少提前6个未来访问间隔。注意这一推导假定地址模式已经被识别，CPU也能在当前时刻合法生成该目标地址。

现在联系上一课的Little定律。需求速率为：

\[
\lambda_{\rm demand}=1/T\quad \mathrm{Line/cycle}.
\]

要持续维持这个提前请求速率，平均在途预取请求至少为：

\[
\overline N=\lambda_{\rm demand}L=L/T.
\]

若MSHR预算为 \(K\)，则必要条件是：

\[
\boxed{K\ge L/T}.
\]

例如上述例子中至少需要支持平均6条在途请求。实际硬件要考虑瞬时峰值、需求请求、写回和其他流之间的竞争，因此仅满足等式并不保证无阻塞。

下级完成速率还必须至少达到：

\[
\boxed{r_{\rm mem}\ge1/T}.
\]

如果Line为 \(B\) 字节，则对应的最低纯数据读取带宽是：

\[
\boxed{BW_{\rm required}\ge B/T}.
\]

**重要反例：** 把Distance调大无法突破 \(K/L\) 的稳态吞吐上界。如果MSHR只能支持4条未完成请求，而程序持续每15周期需要一条新Line、每个请求占90周期，那么把预取放到更远的未来，长期也无法让只有4个MSHR持续供应所需的6个在途请求。

需要同时满足：预测足够早、在途容量足够、下级服务够快、程序确实会使用数据。

## 五、Accuracy、Coverage与Timeliness：三个分母不同（约2分钟）

设：

- \(P\)：已发出的预取请求数；
- \(U\)：其中被后续Demand真正使用且及时到达的预取数；
- \(M_0\)：关闭预取时的Demand Miss数；
- \(M_1\)：开启预取后的Demand Miss数。

在**本节严格限定的简单计数模型**中，每个有用预取恰好避免一个原本Demand Miss，且没有预取诱发的新Miss，则：

\[
\boxed{\mathrm{Accuracy}=U/P}
\]

\[
\boxed{\mathrm{Coverage}=U/M_0=(M_0-M_1)/M_0}.
\]

真实实验中这些等式的第二项不一定成立：预取可能造成额外Conflict Miss，需求可能与未完成预取合并，或某条预取本来就不会引起下一级Miss。因此应给出事件定义，再比较同工作量的baseline与prefetch配置。研究工作甚至专门提出了区分预取直接和间接影响的分类法：
https://research.ibm.com/publications/a-prefetch-taxonomy

**数值例题：** 基线有200次Demand Miss；预取器发出150个请求，其中90个被需求及时用到且一一消除了原本Miss，且没有新的污染Miss。

\[
Accuracy=90/150=60\%,\quad
Coverage=90/200=45\%.
\]

开启预取后的Demand Miss为110次。即便如此，也不能推出IPC提高45%，因为有些Miss可能本来就被OoO工作隐藏，而预取又引入额外资源竞争。

**Timeliness（及时性）**强调数据究竟在需求之前多久到达。太晚无法消除全部等待；太早可能被逐出。准确率、覆盖率都不能独立表达这个时间问题。

## 六、预取污染：预取“命中”也可能让程序变慢（约2分钟）

考虑只有2个Way的Cache Set，初始缓存有Demand经常复用的A、B。

如果激进预取器提前放入不久之后才可能使用的C、D，就必须替换某些旧块。假设A很快再次访问，却因为被预取逐出而Miss——这就出现了Cache污染（Pollution）。

~~~text
本应：       Demand A → Hit
激进预取：   Prefetch C → 逐出A
             Demand A   → Miss，增加关键路径等待
~~~

注意预取的C之后即使确实被使用，仍可能已经伤害了A的性能。因此**“有用预取”并不意味着没有污染**。

预取还可能产生：

- **MSHR压力**：需求Miss到来时没有空位；
- **内存带宽浪费**：无用预取占据下级队列和通道；
- **功耗增加**：Cache访问、互连传输和填充产生额外动态能耗；
- **跨核干扰**：其他线程/核的需求请求被预取流挤占；
- **替换策略冲突**：预取Line在真正使用前就被驱逐，或驱逐更关键的Demand Line。

IBM与学术研究指出，预取质量必须同时评估流量、覆盖、准确率和污染，而不仅看单一Hit统计：
https://research.ibm.com/publications/reducing-cache-pollution-via-dynamic-data-prefetch-filtering

**具体反例：** 一个预取器Accuracy从70%提升到80%，但为了这一提升把Degree翻倍，额外请求导致主线程关键需求Miss等待增加。即便Accuracy更高，IPC也可能下降。

## 七、完整实验：为什么不能只比较Demand Miss Rate？（约2分钟）

研究预取器应采用固定输入与工作量，对比**关闭预取、保守预取、激进预取**，并至少统计：

| 指标 | 回答的问题 |
|---|---|
| Demand Miss数与关键路径Stall | 哪些真正的等待被减少？ |
| Prefetch Issued/Useful/Late/Unused | 请求是否准确、及时？ |
| Cache Eviction与污染诱发Miss | 是否挤掉更有用的数据？ |
| MSHR平均/峰值占用、Full周期 | 预取是否阻塞需求？ |
| 下一级请求数和传输字节 | 是否牺牲了带宽？ |
| IPC、执行周期、固定任务完成时间 | 端到端是否变快？ |

还应尽量固定CPU频率、核心亲和性、线程数、编译器、初始缓存状态和工作量，并多次测量，必要时记录P99而不仅是平均IPC。

在上一课，MSHR决定可以跟踪多少在途Line；今天预取器决定是否提前占用这些名额。二者必须联合设计，不能简单假定预取越多越好。

### 反例与适用边界

1. **规则地址流不等于总能预取。** 依赖链可能尚未暴露地址，跨页翻译和权限也会限制合法预取。
2. **一个准确预取可能太晚。** 需求与预取合并，不一定消除关键路径等待。
3. **Demand Miss下降不等于总流量下降。** 预取流量可能超过避免的需求读取。
4. **缓存污染不只来自错误预测。** 提前太多的最终有用数据，也可能驱逐当前更重要的数据。
5. **软件预取与硬件预取不是同一个接口。** 预取指令的权限/异常语义可能随ISA和设备不同，不可跨平台套用。

## 八、联系TSO：预取不改变合法跨核观察（约1分钟）

继续回顾：

~~~text
初始 X=Y=0

Core 0:                  Core 1:
STORE X=1                STORE Y=1
r0=LOAD Y                r1=LOAD X
~~~

在允许Store→不同地址Load放松的TSO中，两个Store可分别驻留Store Buffer，之后Load暂时没有看到对方写入，所以 \((r0,r1)=(0,0)\) 可以是合法的架构结果。

预取器即使提前将某条Line带入Cache，也不能据此宣称某条已退休Store立即对所有核全局可见；一致性系统必须正确处理读写权限和最新副本，而预取并不能任意改变ISA内存模型的允许结果。

三种规则需要分别理解：

\[
\boxed{\text{MLP：同时能处理多少请求}}
\]

\[
\boxed{\text{Prefetch：哪些请求可以提前发出}}
\]

\[
\boxed{\text{TSO：哪些跨核架构观察顺序被允许}}
\]

## 九、本课总结与下一讲（约1分钟）

本课的核心推导：

\[
\boxed{d_{\min}=\lceil L/T\rceil}
\]

\[
\boxed{K\ge L/T,\qquad BW_{\rm required}\ge B/T}
\]

以及在本节严格简化的事件计数模型中：

\[
\boxed{Accuracy=U/P,\qquad Coverage=U/M_0}.
\]

真正优秀的预取器不是生成最多请求，而是在目标访问到来前，尽可能少占资源地带来确实有用的数据，并在端到端执行时间上兑现收益。

**下一讲：第27课（2026年11月15日，第4周第6节）——《Cache替换、预取协同与多核干扰：为什么更高Hit Rate未必带来更高IPC？》** 第28课（11月16日）按既定四周计划进行阶段考核。

---

# 十、四级分级测评（总分100分）

**本次首次发放不包含标准答案及解析。** Lv1到Lv3客观判分；Lv4根据分项Rubric进行人工或自评。

### Lv1｜准确率不等于性能收益（15分·单选·预计2分钟）

某硬件预取器在100次已完成的预取中，有95次最终被需求Load访问，但其中很多数据到达时间晚于需求Load，而且增加了MSHR争用。对于“预取器已经很好地提高IPC”，哪项判断最严谨？

**A.** 95%的预取被使用，因此程序IPC必然提升95%。

**B.** 预取命中率高就证明所有预取均在需求访问之前完成。

**C.** 预取有较高使用比例，但仍需区分及时性、避免了多少原本的Miss、资源竞争和端到端性能，不能直接推出IPC收益。

**D.** 预取不需要使用MSHR或内存带宽，因而不会影响需求请求。

<details><summary>可选提示（不泄露答案）</summary>

区分“后来访问过预取的数据”“预取赶在需求访问前完成”“真正减少了关键路径等待”。

</details>

---

### Lv2｜预取改变的下一级读取流量（20分·数值·预计4分钟）

两次执行完成完全相同的工作量，Cache Line为64B。关闭预取时，下一级实际处理80条不同Line的需求读取。开启预取后，实际处理30条不同Line的需求读取，加上70条不同Line预取读取；所有请求都各传输完整64B，没有合并/其他流量，且都实际到达下一级。问开启预取后，下一级总读取数据量相对关闭预取增加多少Byte？只填写数值。



<details><summary>可选提示（不泄露答案）</summary>

先数两种配置下实际到达下一级的完整Line读取总数，而不是只比较Demand Miss数量。

</details>

---

### Lv3｜Stride、及时性与资源竞争（25分·多选·预计5分钟）

在64B Line、硬件预取与普通相干缓存的教学环境中，选择所有正确的陈述。

**A.** 对于规律性的Stride访问，按产生访存的PC分别学习地址差分，可能比无差别Next-line预取更适合较大跨度的访问。

**B.** 只要预取Degree加倍，覆盖率和IPC必然同时提高，且不会带来额外缓存压力。

**C.** 一个预测地址正确但发出的预取请求晚于需求请求到达，仍可能无法隐藏该次需求访问的原始等待。

**D.** 不及时或错误的预取可能竞争MSHR、内存带宽并驱逐原本有用的Cache Line。

**E.** 预取准确率与覆盖率总是相同，因为它们都用预取请求总数作分母。

**F.** 预取器若把一条Line提前带入Cache，就会使先前Store自动对所有核全局可见，改变TSO允许的Store Buffering结果。

<details><summary>可选提示（不泄露答案）</summary>

从分母、时间顺序、访存资源与TSO架构规则分别判断，注意含“必然”“总是”的绝对表达。

</details>

---

### Lv4｜Stride预测、距离推导与性能验证（40分·开放推导·预计10—12分钟）

统一教学模型：Cache Line大小64B；所有请求都是普通可缓存、相干内存访问，忽略启动与边界特例，预取不会跨越无效映射。请分四部分作答。

A｜Stride识别与地址预测（10分）：某个Load PC连续访问字节地址0x4000、0x40C0、0x4180、0x4240。计算相邻访问的Stride（Byte和Line），若已经确认Stride，预取策略从最后一次需求地址起跳过下一次Stride位置，随后连续预取2条Stride目标（即第一条是向前2个Stride，第二条向前3个Stride），写出两个预取的十六进制字节地址。说明为什么不同PC的交错访存可能干扰单一全局Stride检测器。

B｜距离、MSHR与带宽（12分）：需求流每12周期访问下一条不同Line，下级预取往返延迟L=96周期。设距离d表示预取目标比当前需求Line领先d个未来需求间隔。求最小理想距离d；若可用预取MSHR只有K=6，并且连续稳态要求每个需求间隔完成一个Line、预取独占这些资源，证明能否持续把全部请求提前到位。升级到K=10后还需要检验什么下游服务能力？写出最低所需Line/cycle和B/cycle。

C｜效果指标（10分）：关预取时共有240个需求Miss；开预取后发出160次不同Line预取，其中120次及时、后来被需求使用，而且这些120次恰好各自消除一个原本需求Miss，没有额外污染导致的新Miss。计算预取Accuracy、Coverage和开预取后的需求Miss数。解释为什么这三个数字仍不能证明IPC一定提升。

D｜公平对照与内存模型（8分）：设计相同工作量下的基线、保守预取、激进预取三组对照，指出至少四个要统计的事件或指标，并解释为什么提前取回Line不能证明一个已经退休但仍在Store Buffer的Store已对其他核全局可见，也不改变TSO中经典Store Buffering的允许结果。



<details><summary>可选提示（不泄露答案）</summary>

A先将地址差除以64；B区分“提前d个需求间隔”和“同时追踪多少未完成Line”；C准确率分母为已发预取，覆盖率分母为原本需求Miss；D记录有用/晚到预取、污染及队列/带宽压力，并区分性能与架构可见性。

</details>

## 作答与评分

按以下格式回复即可：

~~~text
Lv1：
Lv2：（Byte）
Lv3：（所有选中字母）
Lv4：
A：
B：
C：
D：
~~~

分值为15、20、25、40，总分100。≥80分按既定课号进入下一专题；60—79分补一个针对性预取时间线；低于60分回顾第25—26课的Little定律、Distance和Cache污染再练。**补练不改变第27课的日期或编号。**

## 延伸参考

- gem5 Stride预取器参数与实现：https://doxygen.gem5.org/develop/classgem5_1_1prefetch_1_1Stride.html
- IBM《A Prefetch Taxonomy》：https://research.ibm.com/publications/a-prefetch-taxonomy
- IBM《Reducing Cache Pollution Via Dynamic Data Prefetch Filtering》：https://research.ibm.com/publications/reducing-cache-pollution-via-dynamic-data-prefetch-filtering
