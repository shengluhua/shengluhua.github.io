---
title: "第32课｜从SC/TSO到弱内存模型：Load Buffering、Message Passing与ARM/RISC-V Fence"
track: arch
number: 32
date: 2026-11-20
week: 5
minutes: 18
kind: full
summary: "比较SC、x86-TSO、Arm与RISC-V RVWMO的允许结果，推导LB和MP的执行环，讲清Arm DMB/LDAR/STLR及RISC-V FENCE前驱后继集合，联系依赖、预取、Store Buffer与跨核可见性。"
tags: [memory-model, SC, TSO, RVWMO, Arm, RISC-V, load-buffering, message-passing, fence, litmus, happens-before]
diagram: mermaid
---

# 计算机体系结构 · 第32课
## 从SC/TSO到弱内存模型：Load Buffering、Message Passing与ARM/RISC-V Fence

**2026年11月20日｜第5周第4节｜讲授约18分钟（测评另计）**

上节课用Store Buffering（SB）解释了为何x86-TSO允许两个核“先写后读”都读到旧0。今天再向前迈一步：**弱内存模型不仅可能放松Store→Load，还可能放松没有依赖的Load→Store、Store→Store、Load→Load**。但这不意味着什么乱序都合法：相同地址相干、显式依赖、屏障、Acquire/Release以及读值规则仍然构成约束。

本课的四个目标：判断Load Buffering（LB）的结果；分析Message Passing（MP）的发布漏洞；读懂Arm的DMB/LDAR/STLR与RISC-V FENCE语义；用有向环而不是“感觉CPU应该怎样执行”来证明禁止结果。

> 请始终区分四件事：**指令执行/ROB退休、Store Buffer传播、相干协议授予写所有权、脏数据最终回写DRAM**。其中某一个已经发生，不足以直接推出其余事件完成。

## 一、模型、符号与比较边界（2分钟）

采用两个核（Core 0/1），X、Y、data、flag都是不同的、正确对齐的普通可缓存物理地址；初始值为0（另行声明除外），无第三方写入；一次读/写不会撕裂。先讨论**ISA层的Litmus**，不用有数据竞争的普通C++程序代替硬件模型；设备内存、MMIO、DMA与特殊非时间性访问另议。

- \(\mathrm{po}\)：同一核的程序顺序；\(\mathrm{rf}\)：某次Load读自哪个Store；\(\mathrm{co}\)：同地址写入的相干顺序。
- 用 \(A\prec B\) 表示选定教学抽象中必须维持的全局观察/内存顺序，**不是**“A比B先进入ROB”。
- SC要求一个保留所有程序顺序的全序；x86-TSO保留大部分顺序，但允许本核缓冲Store被后续不同地址Load越过。
- Armv8-A普通Normal内存和RISC-V默认RVWMO更宽松，除非存在相关的同地址/依赖/屏障约束；**“允许”并不表示任何一颗实际芯片都必然观测到**。

| 独立地址、无依赖的程序顺序边 | SC | 教学x86-TSO | Arm普通内存 / RVWMO（默认） |
|---|---|---|---|
| Load→Load | 必须保留 | 必须保留 | 可以放松 |
| Load→Store | 必须保留 | 必须保留 | 可以放松 |
| Store→Store | 必须保留 | 必须保留 | 可以放松 |
| Store→Load | 必须保留 | 可以放松 | 可以放松 |

这张表只描述**不同地址、没有依赖和额外约束**的简化场景，不是完整ISA规范。真实模型还规定同址访问、依赖、原子操作、特殊访问与各类同步规则。

## 二、Load Buffering：为什么弱模型可能比TSO更宽松？（3分钟）

经典LB与上节课的SB方向恰好相反：

~~~text
初始 X=Y=0

Core 0                         Core 1
A: r0 = LOAD X                 C: r1 = LOAD Y
B: STORE Y = 1                 D: STORE X = 1
~~~

考虑结果 \((r_0,r_1)=(1,1)\)。

在SC中，每核程序顺序要求 \(A\prec B\)、\(C\prec D\)。如果A读到D写的1，要求 \(D\prec A\)；如果C读到B写的1，要求 \(B\prec C\)。合并：

\[
\boxed{D\prec A\prec B\prec C\prec D}
\]

出现环，所以SC不允许。

~~~mermaid
flowchart LR
    D["D: Core1 STORE X=1"] -->|"读到1"| A["A: Core0 LOAD X"]
    A -->|"Load→Store顺序"| B["B: Core0 STORE Y=1"]
    B -->|"读到1"| C["C: Core1 LOAD Y"]
    C -->|"Load→Store顺序"| D
~~~

**x86-TSO也不允许这个结果**：TSO能够放松的是Store→后续不同地址Load，而这里需要打破的是两条Load→Store约束，TSO仍保留它们。

在Arm普通内存/RVWMO的独立无依赖情形中，Load→Store未必是保留的全局顺序边。于是可在抽象全局顺序中使D的写入先于A的读、B的写入先于C的读，而不会被这两条本核Load→Store边锁死。**允许出现(1,1)并不等于程序真的“从未来凭空创造数据”**：两个写入的值都是常数1，仍有明确来源。

### 反例：加上地址或数据依赖

假如B的Store地址是依据A读到的值计算出来的，则不能继续把A→B视为“无依赖可随意放松”。RISC-V RVWMO保存相应的语法地址/数据依赖；Arm也对特定依赖有要求。控制依赖对Load和Store的约束并不完全相同，**不要把条件分支等同于通用完整Fence**。

## 三、Message Passing：写了data又写flag，读到flag就一定安全？（3分钟）

考虑经典发布-订阅模式（这里是ISA-level的普通访存抽象）：

~~~text
初始 data=0, flag=0

Writer/Core 0                   Reader/Core 1
A: STORE data=42                C: rFlag=LOAD flag
B: STORE flag=1                 D: rData=LOAD data
~~~

目标是：**一旦Reader读到flag=1，之后就不应读到旧data=0**。

在SC下，如果C读到B的1，同时D读到data旧0，会要求：

\[
A\prec B \quad(\text{Writer程序顺序})
\]

\[
B\prec C \quad(\text{flag读自新值})
\]

\[
C\prec D \quad(\text{Reader程序顺序})
\]

\[
D\prec A \quad(\text{data仍读旧值})
\]

由此得到不可能的环：

\[
\boxed{A\prec B\prec C\prec D\prec A}
\]

x86-TSO在这种无额外写入的MP情形下，也保留Store→Store和Load→Load，因此不允许“flag新、data旧”的结果。

**弱模型的风险**：Writer的两个普通Store可能被其他核以不同顺序观察；Reader的两个独立普通Load也可能重排其观察顺序。如果没有合适的同步边，不能仅因为程序里先写data后写flag就宣称发布安全。

### 使发布可靠的两种路线

**路线1：Release/Acquire配对。** Arm AArch64中可用STLR发布flag，Reader用LDAR读取flag；若该Load读到了对应发布写入，随后读取data，并满足地址/内存属性前提，Release与Acquire组合提供所需排序。C++中则需使用相应原子操作，并以实际读自关系建立synchronizes-with/happens-before；若Acquire读到旧flag，不会凭空与那次Release建立同步。

**路线2：恰当地放置内存屏障。** Writer保证data写先于flag写；Reader保证读取flag先于读取data。要检查**两侧**及**具体访问种类**，不能只插一个看起来很强的指令就假设全部关系已经建立。

~~~mermaid
flowchart LR
  A["Writer: data=42"] -->|"发布端排序"| B["Writer: flag=1"]
  B -->|"Reader读到此版本"| C["Reader: LOAD flag=1"]
  C -->|"消费端排序"| D["Reader: LOAD data"]
~~~

## 四、Arm：DMB作用域与Acquire/Release单向顺序（3分钟）

Arm的DMB是**排序屏障**，DSB还包含额外的完成性要求；ISB用于指令同步，不能代替任意数据内存排序。今天仅讨论普通内存、同一Inner Shareable域的主要区别。

| Arm指令/操作 | 在作用域内主要约束 | 重要边界 |
|---|---|---|
| DMB ISH | 屏障前后的Load/Store全组合排序 | ISH只覆盖相应共享域 |
| DMB ISHST | Store→Store | 不提供Load→Store、Store→Load的通用排序 |
| DMB ISHLD | Load→Load、Load→Store | 不是Store→Load完整屏障 |
| STLR（Store Release） | 较早访存不越过该发布Store | 不自动约束该Store之后的所有访问 |
| LDAR（Load Acquire） | 后继访存不越过该Acquire Load | 不自动约束该Load之前的全部访问 |

Arm官方文档把DMB ISHST列为Store–Store，把DMB ISHLD列为Load–Load和Load–Store；LDAR/STLR则提供方向不同的隐式排序。

有一个尤其容易犯的错误：**只有Writer的STLR，不代表Reader的两个普通Load自动有序。** 同理，只在Reader放一个Acquire，也不能修复Writer未按要求发布数据的问题。

此外，对设备寄存器或跨其他共享域的访问，必须重新检查内存属性与屏障作用域；不能将“ISH”理解成整个系统所有观察者。

## 五、RISC-V：FENCE pred,succ到底约束哪些边？（3分钟）

RISC-V普通主存访问分为R（read）和W（write）。FENCE语法：

\[
\mathrm{FENCE}\ \mathrm{pred},\mathrm{succ}
\]

表示：**Fence之前属于pred集合的访问**，必须先于**Fence之后属于succ集合的访问**被观察。

| RISC-V指令 | 本课关注的跨屏障排序 |
|---|---|
| FENCE W,W | 前Store→后Store |
| FENCE R,R | 前Load→后Load |
| FENCE RW,RW | R→R、R→W、W→R、W→W |
| FENCE.TSO | R→R、R→W、W→W；**不强制普通W→R** |
| FENCE RW,W | 前Load/Store→后Store |
| FENCE R,RW | 前Load→后Load/Store |

**注意：FENCE.TSO不是“强制成为SC的全Fence”！** 它保留TSO允许普通Store→Load放松的关键差异。对需要关闭经典SB漏洞的独立Store→Load顺序，应检查是否真的建立W→R边，而不是只看指令名字带TSO。

### 数值例题：比较“受约束的跨Fence访问对”数量

假设Fence前面依程序顺序有2个Load与1个Store，后面有1个Load与2个Store；全部是不同地址、无依赖。

按“一个前访问与一个后访问”计数，FENCE RW,RW至少建立：

\[
(2+1)(1+2)=9
\]

对这样的跨Fence访问对的排序约束。而FENCE W,W只涉及前面的1个Store与后面的2个Store，共：

\[
1\times2=2
\]

这个**组合计数**只帮助理解pred/succ，不表示真实硬件发出9条屏障消息、发生9次Cache Miss或增加9个周期。屏障实际开销由微架构和工作负载决定。

RISC-V RVWMO规定了更多细节，包括同址顺序、Load的读值公理、语法依赖和Acquire/Release。**在规范层允许的行为，并不等于具体实现必然在实测中出现**。

## 六、完整比较：SB、LB、MP在不同模型下（1分钟）

这里仅针对本讲独立地址、常数写入、无依赖和无额外同步的基本Litmus。

| Litmus与关注结果 | SC | x86-TSO | Arm Normal / RISC-V RVWMO |
|---|---|---|---|
| SB：先Store后Load，两个Load都读0 | 禁止 | 允许 | 允许 |
| LB：先Load后Store，两个Load都读1 | 禁止 | 禁止 | 允许 |
| MP：Reader读flag=1、data=0 | 禁止 | 禁止 | 允许 |

这个表是**允许结果的分类，不是观测概率表**。有的实现可能比ISA要求更强；而把C++非原子变量直接放进数据竞争程序，则讨论对象已从硬件Litmus变成语言未定义行为。

### 重要反例：预取不等于完成同步

硬件可能提前预取data对应的Line。预取并不能让对方尚未传播的Store自动可见；发布端和消费端仍要满足ISA/语言的内存顺序规则。相干系统会保持副本正确，但**Coherence不自动提供所有跨地址的Consistency约束**。

## 七、如何设计测验/实验？（1分钟）

建议使用herdtools7等模型工具先列出允许结果，再用受控的汇编或有明确定义的原子程序实测。记录CPU型号、ISA特性、编译器、亲和性、重复次数、频率和观察结果。

- **看到一个被模型禁止的结果**：先检查测试自身是否正确、数据是否同步初始化、是否使用了错误编译方式、目标平台模型是否匹配，再分析实现问题。
- **从未看到一个被模型允许的结果**：不代表它在规范中被禁止，可能是实现更强、事件太罕见或测试没有触发相应竞态。
- **性能分析**：同时看Fence插入数量、Store Buffer占用、Cache相干流量、暴露Stall以及固定工作量的完成时间。

参考原始资料：
- [Arm官方Memory ordering](https://support.arm.com/documentation/102336/0100/Memory-ordering)
- [Arm官方Barrier作用域](https://support.arm.com/documentation/102336/0100/Limiting-the-scope-of-memory-barriers)
- [Arm官方LDAR/STLR说明](https://support.arm.com/documentation/102336/0101/Load-Acquire-and-Store-Release-instructions)
- [RISC-V RVWMO解释性规范](https://docs.riscv.org/reference/isa/v20260120/unpriv/mm-eplan.html)
- [Linux LB Litmus说明](https://code.googlesource.com/linux/torvalds/linux/+/dfc53baae3c6a165a35735b789e3e083786271d6/tools/memory-model/Documentation/recipes.txt)
- [herdtools7](https://github.com/herd/herdtools7)

## 八、总结与下一讲（1分钟）

本节最重要的不是记住某款CPU“强或弱”，而是学会**精确写出哪些访问边被保留**：

\[
\boxed{\text{SC：保留全部po；TSO：典型放松W→R；弱模型：还可放松更多无依赖边}}
\]

\[
\boxed{\text{Release负责此前；Acquire负责此后；配对须检查读自关系}}
\]

\[
\boxed{\mathrm{FENCE}\ pred,succ:\ \text{明确前后访问类型和作用范围}}
\]

下节是**第33课（2026年11月21日，第5周第5节）《内存顺序Litmus进阶：IRIW、多副本原子性与跨核传播》**，研究多个观察者为什么更难推理，以及如何区分内存模型、传播顺序和缓存一致性。

---

# 九、四级分级测评（总分100分）

首次发放不包含正确选项、数值答案或开放题参考推导。前三题客观判分，Lv4按分项Rubric人工/审阅式评价；不声称开放题可以自动准确评分。

### Lv1｜弱模型发布-订阅中的同步缺口（15分，单选，预计2分钟）

Arm AArch64普通可缓存内存：Writer先写data=42，再用STLR发布flag=1；Reader用普通LDR读取flag，读到1后再用普通LDR读取data。假设无其他写者，且两个地址不同。以下判断哪项最严谨？

A. STLR在发布端排序，因此不管Reader怎样读取，都已经获得相当于完整Release/Acquire配对的保证。

B. 应让Reader使用匹配的Acquire Load（如LDAR）并确认读到发布的flag版本，才能建立所需的发布-消费排序；仅Writer做Release不等于Reader也有Acquire约束。

C. 只要两变量属于同一个Cache Line，MESI就自动保证SC，无需考虑读侧的排序。

D. Reader可以用DMB ISHST确保前面的Load先于后面的Load，因为ISHST专门用于Load→Load。

**可选提示（不泄露答案）：**区分发布端的“此前访问先于flag”与消费端的“读flag先于后继访问”；再检查ISHST究竟约束哪些类型。

### Lv2｜RISC-V FENCE约束对的数量（20分，数值，预计4分钟）

某Hart上的一个Fence前有5次普通、不同地址访存：2次Load与3次Store；Fence后有5次访存：3次Load与2次Store。只统计跨越Fence的“前操作→后操作”有序访问对，每对计1，不计同侧操作间关系。问题：把FENCE W,W替换成FENCE RW,RW，新增了多少个被该Fence明确约束的跨Fence访问对？仅填写整数。

**可选提示（不泄露答案）：**全R/W集合产生(前R+W)×(后R+W)对；只约束W→W时只数前Store与后Store的组合。

### Lv3｜LB、Arm屏障和RISC-V FENCE的边界（25分，多选，预计5分钟）

在普通可缓存内存、独立地址且没有依赖（除选项特指的情况）的ISA级Litmus语境中，选择所有正确说法。

A. 对Arm普通Normal内存，DMB ISHST主要约束Store→Store，不能直接当作一般的Load→Store屏障。

B. FENCE.TSO与FENCE RW,RW在RISC-V普通主存上的Store→Load排序能力完全等价。

C. 在RISC-V RVWMO中，一个Load的值用于计算后续Store的地址，可能建立受到模型保护的语法地址依赖，不能再把这两次访问当成独立无依赖的Load→Store。

D. 对MP，Reader如果读到正确的发布flag版本，Acquire约束后续访存；但没有发布端正确排序，仍不能只靠Reader一侧宣称data一定已发布。

E. 只要LLC中的data Line已被预取命中，未传播的跨核Store必然对Reader可见，因此可以省略同步。

F. 在基础无依赖LB中，(1,1)在x86-TSO中被禁止，但对弱内存模型来说可以是允许结果。

**可选提示（不泄露答案）：**分别检查Arm ISHST的访问类型、RISC-V FENCE.TSO是否包含W→R、RVWMO语法依赖，以及发布-消费必须具备的两侧排序。

### Lv4｜带屏障的LB、MP证明与跨ISA验证（40分，开放推导，预计10—12分钟）

统一假设：两个核、独立对齐的普通可缓存地址，X/Y/data/flag初值为0，写入常数，且没有第三方写入；ISA级Litmus，不用C++数据竞争程序代替。

**A｜LB中的一侧与两侧屏障（12分）**  
Core0执行：r0=LOAD X；DMB ISH；STORE Y=1。Core1执行：r1=LOAD Y；STORE X=1（无屏障）。在适用同一Inner Shareable域的Arm弱模型里，分析(r0,r1)=(1,1)是否可能；随后给Core1的Load和Store之间也加DMB ISH，再判断此结果，分别给出合法总序构造或不可达有向环。

**B｜RISC-V MP中的两侧排序（10分）**  
Writer：STORE data=42；FENCE W,W；STORE flag=1。Reader：rF=LOAD flag；FENCE R,R；rD=LOAD data。假设rF读到对应的flag=1。解释在RVWMO模型下rD能否仍读0，列出构成关键约束的操作与边。再讨论仅删除Reader一侧FENCE可能造成的风险。

**C｜FENCE.TSO的反事实（10分）**  
回到经典SB：Core0执行STORE X=1；FENCE.TSO；r0=LOAD Y；Core1执行STORE Y=1；FENCE.TSO；r1=LOAD X。说明两侧均使用FENCE.TSO是否必然禁止(0,0)。若将两侧改为FENCE RW,RW，重新判断并用顺序边解释差别。

**D｜正确性与性能验证（8分）**  
给出使用herdtools7/等价模型检查与真实CPU测量的实验方案，至少说明三个要记录的条件或指标，并区分“规范允许但实测没发生”“Fence的排序效果”和“Store从ROB退休、相干可见、DRAM写回”。

**可选提示（不泄露答案）：**A看谁仍允许Load→Store松弛；B使用writer W→W、reader R→R和读自发布flag的边；C确认FENCE.TSO是否真的约束W→R；D模型证明与统计频次是两回事。

---

## 十、作答与评分

按“Lv1：选项；Lv2：整数；Lv3：所有选项；Lv4：A/B/C/D”回复。分值为15+20+25+40=100分。≥80分按既定日期进入第33课；60—79分补一个LB或MP执行图；<60分重点复习第29—32课内存模型与同步，补练**不改变**课号。

**注意：**测验标准答案、解释及开放题分步参考思路只在配套的arch-032.json中，不在本讲义中直接公布。JSON用于网站交互判分；开放题必须由人工/审阅式Rubric评价，不能虚假宣称自动正确评分。
