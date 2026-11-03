---
title: "第15课｜精确异常之外：错误路径的微架构痕迹与推测执行安全"
track: arch
number: 15
date: 2026-11-03
week: 3
minutes: 18
kind: full
summary: "区分架构状态与微架构状态，解释错误路径被Squash后为何可能留下Cache痕迹；以Spectre v1为案例建立侧信道威胁模型、缓存集合映射、软件缓解与性能成本模型，并与TSO Store Buffering严格区分。"
tags: [speculation, transient-execution, Spectre, branch-prediction, ROB, precise-exception, cache-side-channel, LFENCE, bounds-clipping, microarchitectural-state, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第15课
## 精确异常之外：错误路径的微架构痕迹与推测执行安全

**2026年11月3日｜第3周第1节｜约18分钟**

第2周已经建立：Rename绑定物理版本，乱序执行后由ROB按序退休；分支误预测时恢复RAT、Free List和GHR；Store退休和跨核全局可见是不同事件。现在追问：**如果错误路径完全没有退休，为什么它曾经访问过哪条Cache Line仍可能被观察到？**

本讲不是漏洞复现教程，而是一次体系结构正确性与安全性边界分析。目标是把**架构正确**、**微架构状态可观察**、**信息泄漏成立**这三个命题严格分开。

## 一、动机：Squash究竟撤销了什么？（2分钟）

考虑一个抽象时间线。较老分支的条件尚未就绪，前端预测它会Taken，年轻指令沿预测路径读取某个数据地址；随后分支解析为Not Taken，年轻指令被Squash。

~~~text
t1: BRANCH仍未解析；预测Taken
t2: 错误路径的Load发出访问
t3: 相关Cache Line可能被装入某级Cache
t4: BRANCH解析为Not Taken
t5: ROB/重命名状态恢复；错误路径不退休
t6: 随后的合法代码观察到不同的缓存命中延迟
~~~

程序正确路径的寄存器和内存结果可以完全正确，t3却可能改变了Cache替换状态。这不表示所有CPU或所有错误Load都一定留下痕迹，而是说明**提交回滚并不自动等于所有物理资源恢复快照**。Intel将条件分支之后的边界检查绕过归入Spectre Variant 1。参考：[Intel硬件行为与推测执行说明](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/hardware-behavior-related-to-speculative-execution.html)。

## 二、两类状态与两个不同的不变量（2分钟）

定义架构状态
\[
S_A=(PC,\text{架构寄存器},\text{软件可见内存与异常状态}),
\]
以及微架构状态
\[
S_\mu=(\text{Cache/TLB状态},\text{预测器历史},\text{队列与缓冲},\ldots).
\]

在支持精确恢复的教学模型中，错误路径 \(\pi\) 被Squash后，应满足：软件看到的**已提交架构状态**等同于没有提交该错误路径的正确执行前缀。但这**不蕴含**
\[
S_\mu^{\text{after squash}}=S_\mu^{\text{before speculation}}.
\]
Cache预取、替换状态或预测器训练策略可能发生变化。也不能说所有缓存、TLB和预测器都会留下同一种痕迹：是否可见、何时发生、是否被其他活动覆盖，与实现有关。

这里需要区分三个词：**Speculative**（结果还不确定能否提交）、**Transient**（最终未成为架构提交结果的短暂执行）、**Committed**（已按架构规则提交）。“已经执行完并写回物理寄存器”不是“已经退休”。

~~~mermaid
flowchart TD
  P["分支预测并沿预测路径取指"] --> X["年轻指令瞬态执行"]
  X --> A["寄存器计算与投机结果"]
  X --> M["Cache/TLB/预测器等可能变化"]
  B["较老分支解析为预测错误"] --> S["Squash + 恢复PC/RAT/Free/GHR"]
  A --> S
  S --> C["架构上不提交错误路径结果"]
  M --> O["某些微架构状态可能仍可观察"]
  C --> Q["架构正确性"]
  O --> R["需额外分析侧信道"]
~~~

**精确异常性质**要求年轻的错误架构效果不能越过较老未处理异常。**安全性**则还要问：不同敏感输入是否能导致攻击者可区分的微架构观察？前者成立并不能自动证明后者。

## 三、Cache映射为何提供一种观察通道？（2分钟）

以一个教学用、直接按地址位索引的组相联Cache为例：容量\(C=32\,\text{KiB}\)、8路、64B每行。组数为
\[
S=\frac{C}{A\cdot B}=\frac{32768}{8\times64}=64.
\]
设字节地址为\(a\)，在忽略实际CPU可能使用的哈希、VIPT与别名处理时：
\[
\operatorname{line}(a)=\left\lfloor\frac aB\right\rfloor,\quad
\operatorname{set}(a)=\operatorname{line}(a)\bmod S.
\]
比如\(a=0x1180\)，行号为\(0x46=70\)，对应set 6。\(a=0x2180\)虽然是另一个地址，但在该教学映射下落入同一set。**同组不等于同一Cache Line**；8路允许多个不同tag共存，冲突需要考虑占用、替换和访问顺序。

如果某数据行已在L1，一次读取可能只需数周期；如果未命中并访问更低层，可能需要几十至数百周期。假设构造模型中命中4周期、未命中80周期，它们存在明显时间差，但真实测量还会受到预取、其他线程、替换、频率和测时噪声影响。

因此**“有时间差”只是可能存在可观察信号**，并不等于某次计时已经证明越权读取。旁路的能力与风险取决于攻击者能否获得足够稳定的观察，以及观察分布是否真的依赖不应公开的信息。这里不提供泄露代码或探测步骤。

## 四、以Spectre v1理解关键依赖链（3分钟）

一个典型风险模式是：程序检查不可信索引是否在范围内，然后使用该索引读取数据；在分支条件尚未解析时，处理器可能短暂执行了检查之后的指令。如果某个短暂取得的值进一步决定另一个内存访问的位置，就有可能把不应外泄的信息映射到Cache状态。

请把它拆成**五个必要环节**，逐个质疑而不是机械说“预测错了就泄密”：

1. 不可信输入是否可以影响分支条件或地址？
2. 条件未解析期间，敏感的后续操作是否可能瞬态执行？
3. 被读取的数据是否真的超出了该观察者应当知道的信息边界？
4. 是否存在受该数据影响的可观察微架构效果？
5. 观察者是否能够区分不同敏感值所对应的观测分布？

如果第四或第五环节不成立，单凭错误路径读过数据，不足以证明完成了信息泄漏。相反，**源代码中有正确的边界检查**也不自动构成对所有瞬态执行侧信道的防御。

Spectre v1（Bounds Check Bypass）关注分支条件后的瞬态执行；Spectre v2（Branch Target Injection）关注间接分支目标预测的操纵。二者不应与基于故障或权限检查时序的其他瞬态执行问题混为一谈，具体漏洞还受处理器实现和系统软件防护影响。原始研究与披露可读[Google Project Zero 2018年分析](https://projectzero.google/2018/01/reading-privileged-memory-with-side.html)。

## 五、正确性与保密性不是同一个证明（2分钟）

定义合法架构输出为\(O_A(x)\)，可观察的微架构测量结果为\(O_\mu(x)\)。对两个只在敏感信息\(s\)上不同、而公开输入相同的执行，架构非泄漏要求在规定公开输出中无法分辨；对微架构侧信道还要研究
\[
\mathsf{Dist}(O_\mu(s=0),O_\mu(s=1)).
\]
这里\(\mathsf{Dist}\)可以是某个区分统计量或分布距离。它不是说两次测得的周期必须逐位相等，而是要求在指定威胁模型中，观察分布不携带不允许的信息。

架构测试只检查RAT/ROB恢复、最终寄存器与合法内存值，通常无法证明上述微架构层性质。另一方面，一次命中/未命中差异也不能证明秘密相关：预取、替换和环境噪声都可能造成差异。

一个严谨的研究结论至少应该明确**观察者权限、攻击者控制的输入、被保护数据、可观察资源和统计判定方法**，并有独立的性能和功能回归。

## 六、如何缓解？目标是约束危险依赖，而不是禁用一切乱序（3分钟）

对**边界检查绕过**，常见的防御设计包括：

- **约束索引或指针的投机取值（bounds clipping / 数据依赖约束）**：使即使路径预测错误，后续敏感访问仍处在安全范围内。其正确性依赖具体编译结果、处理器和代码上下文，不能凭源码表面存在条件表达式就断言安全。
- **在明确的敏感边界插入投机停止屏障**：对Intel x86的相应风险，合适位置的LFENCE可阻止后续指令越过所需的先前操作执行，但也会限制并行和增加延迟；不应不加分析地插入到所有分支。
- **减少泄露通道与隔离敏感数据**：尽量避免敏感数据决定攻击者可测的地址/时序，结合隔离、代码审查和现有编译器/系统缓解。单靠关闭一个Cache或只禁用一种分支预测不能保证覆盖所有侧信道。

Intel对Spectre v1的说明更倾向在适用场景采用低开销的**bounds clipping**等技术，并把LFENCE作为需要时的替代方案；对目标注入、Store Bypass等其他类别则有不同缓解。详见[Intel 2021版缓解文档](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/speculative-execution-side-channel-mitigations.html)及[硬件行为说明](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/hardware-behavior-related-to-speculative-execution.html)。

这里有个关键反例：**解决Spectre v1的某个索引约束，不自动解决Spectre v2的间接目标预测污染。** 缓解方法必须与威胁模型匹配。

## 七、防护的CPI成本：算清分母（2分钟）

设一类需保护的操作占退休指令比例\(f_g\)，针对每次操作新增不可重叠平均延迟\(d\)周期；假设不改变指令总数、频率或其他并发能力，则
\[
\Delta CPI=f_g d,\qquad
CPI_{\mathrm{new}}=CPI_0+f_gd.
\]
这是**有明示不重叠条件**的教学近似；若屏障改变执行重叠、缓存行为或发射吞吐，必须重新测量。

示例：\(CPI_0=1\)，\(f_g=0.12\)，\(d=2.5\)，则\(\Delta CPI=0.3\)、\(CPI_{new}=1.3\)。固定指令数和频率时，运行时间增加30%，吞吐比为\(IPC_{new}/IPC_0=1/1.3\approx0.769\)，即吞吐降低约23.1%。**时间增加百分比**与**吞吐减少百分比**分母不同。

如果一个更精确的静态/动态分析把防护点集中到真正存在风险的少数位置，有可能减少不必要的性能损失；但节省时间不是安全证明，必须分别验证缓解覆盖与性能收益。

## 八、与Store Buffering、精确异常再作三层对比（1分钟）

**层一：错误路径的架构状态。** ROB恢复保证错误路径年轻指令不产生不可撤销的架构提交效果。

**层二：微架构侧信道。** 即使架构提交正确，缓存等微架构状态仍可能被某些观察者利用；这属于保密性和资源可观察性问题。

**层三：内存一致性模型。** TSO允许的Store Buffering结果，讨论的是多个核对内存操作的**最终架构可观察顺序**；它并不需要一条错误路径，更不等于Spectre。普通同核Store-to-Load Forwarding也不应与跨核全局可见混淆。

所以：
\[
\boxed{\text{精确退休}\not\Rightarrow\text{无侧信道}},\quad
\boxed{\text{TSO允许的重排序}\neq\text{Spectre泄漏}}.
\]

## 九、本讲小结、检查清单与下一讲（1分钟）

面对任何推测执行安全主张，先检查：**错误路径是否被Squash？什么架构状态不能提交？什么微架构状态可能留下？谁能够观察到什么？观测是否真正依赖受保护信息？缓解改变了哪条依赖、又损失多少并行性？**

**下一讲第16课（2026年11月4日）**进入**间接分支预测的信任边界：BTB/RAS、目标注入与Retpoline**。它会进一步说明为什么解决条件分支的Bounds Check Bypass，并不足以覆盖另一类预测器安全问题。

---

# 四级分级测评（总分100分）

首次发送**不公布标准答案或解析**。前三题客观判分，Lv4依据明确要点人工/自评；本次新增题不只是替换前几课的数字。

### Lv1｜架构回滚与微架构痕迹｜15分｜单选｜预计2分钟

某处理器发现分支误预测，已经正确Squash所有错误路径年轻指令，最终架构寄存器、程序可见内存与异常状态均符合正确路径。以下哪种判断最严谨？

**A.** Squash按定义必须将所有Cache Line、TLB和预测器状态逐位恢复到取错路径前。

**B.** 既然程序没有报告异常，任何侧信道都必然不存在。

**C.** 架构提交正确不自动保证所有微架构效果消失；若存在可观测且与敏感数据相关的差异，还需独立安全分析。

**D.** 错误路径产生的物理寄存器结果既然曾经算完，便必须当作正确架构结果退休。

<details><summary>可选提示（不泄露答案）</summary>分开看ROB的提交保证和Cache状态的恢复保证；再问是否已经证明存在观察者及可区分的信号。</details>

### Lv2｜组相联Cache集合映射｜20分｜数值｜预计4分钟

一个教学用组相联Cache容量32 KiB、8路、每行64B；**规定直接按字节地址的行号对组数取模**，不使用哈希或复杂索引。地址为\(0x12C0\)（十六进制），组号从0开始。求其映射的**Cache Set编号**，填写十进制整数。

<details><summary>可选提示（不泄露答案）</summary>先用容量/(路数×行大小)求组数，再用地址除以行大小取整形成行号；最后取模。</details>

### Lv3｜攻击成立条件与防护边界｜25分｜多选｜预计5分钟

以下哪些陈述成立？选择所有成立项。

**A.** 错误路径被Squash后，若此前的Cache填充确实发生，仍有可能影响后续访存时延；是否可观察取决于实现和环境。

**B.** 只要最终用户程序没有架构异常，便能证明不存在任何瞬态执行侧信道。

**C.** 某代码先检查不可信索引再访问数组，安全分析仍应考虑条件未解析时的瞬态路径及后续数据依赖访问。

**D.** 在任何处理器上任意位置插入LFENCE都没有性能代价，并能无条件修复所有类型的侧信道。

**E.** 在匹配的威胁模型和实现条件下，索引范围约束、恰当的投机屏障及代码隔离可以用于降低部分Spectre v1风险，但需要验证具体覆盖。

**F.** TSO Store Buffering中两个跨核Load均读到初值，已足以证明发生了Spectre式秘密泄漏。

<details><summary>可选提示（不泄露答案）</summary>逐项检查：是否有被保护的信息、可观察的微架构效果、正确匹配的威胁模型，以及与内存模型的概念区别。</details>

### Lv4｜威胁模型、正确性与性能的联合设计｜40分｜开放推导｜预计10分钟

某服务处理不可信索引。普通正确路径先检查范围，再读取允许访问的公开数据；但在教学中假设分支条件解析较慢，错误路径可能瞬态执行一个**依赖数据值的后续缓存访问**。服务不允许把受保护信息通过时序或Cache可观察性泄露给其他租户。

**A（10分）**：画出“预测→瞬态执行→可能的Cache影响→分支解析→Squash→合法观察”的时间线。分别标明哪些架构效果必须撤销，以及哪些微架构效果不能仅凭ROB恢复断言已消失。

**B（12分）**：写出证明存在信息泄漏至少需要核实的四个条件，并给出一个“有错误路径访问，但不足以证明泄漏”的反例。

**C（10分）**：比较两类缓解：把索引在瞬态路径也限制到安全范围，或者在恰当检查之后设置投机屏障。分别说明安全边界、依赖的硬件/编译条件、对并行性的可能影响，以及为什么不能把任何单一措施叫作“所有Spectre都已解决”。

**D（8分）**：设受保护操作比例\(f_g=0.08\)，每次局部屏障使关键路径额外增加4个**不可重叠**周期，\(CPI_0=1.25\)，频率和退休指令数固定。推导新的CPI与运行时间相对变化，并解释该性能算式为什么不能替代安全性证明；最后说明TSO Store Buffering为何是不同的问题。

<details><summary>可选提示（不泄露答案）</summary>安全分析至少要同时给出控制输入、受保护对象、观察者权限和可区分观测；性能部分明确“增加时间”和“降低吞吐”的分母不同。</details>

---

## 作答格式与评分

~~~text
Lv1：
Lv2：
Lv3：（多选字母）
Lv4：
 A：
 B：
 C：
 D：
~~~

Lv1/Lv2/Lv3依次15/20/25分客观判分；Lv4为40分开放题，不伪装为全自动评分。总分≥80进入既定下一课，60–79补一例，低于60先复习第10、12、15课的架构恢复、预测历史和安全边界。**补练不改变次日课号。**

## 延伸阅读

- [Intel：Hardware Features and Behaviors Related to Speculative Execution](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/hardware-behavior-related-to-speculative-execution.html)。
- [Intel：Speculative Execution Side Channel Mitigations（Version 2.0，2021-05-26）](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/speculative-execution-side-channel-mitigations.html)。
- [Google Project Zero：Reading privileged memory with a side-channel（2018）](https://projectzero.google/2018/01/reading-privileged-memory-with-side.html)。

这些资料用于教学和防护理解，网页示意与构造数字不代表已在任何特定CPU上复现漏洞或验证缓解性能。
