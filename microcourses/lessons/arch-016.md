---
title: "第16课｜间接分支预测的信任边界：BTB、RSB与Retpoline"
track: arch
number: 16
date: 2026-11-04
week: 3
minutes: 18
kind: full
summary: "区分间接分支真实目标与预测目标、BTB与返回地址栈；推导组相联BTB的冲突与性能成本，解释Spectre v2目标注入、Retpoline的工作机理、RSB下溢边界，以及eIBRS/IBPB/STIBP的不同作用。"
tags: [indirect-branch, BTB, RSB, branch-target-injection, Spectre-v2, retpoline, eIBRS, IBPB, STIBP, speculative-execution, TSO]
diagram: mermaid
---

# 计算机体系结构 · 第16课
## 间接分支预测的信任边界：BTB、RSB、目标注入与Retpoline

**2026年11月4日｜第3周第2节｜约18分钟**

昨天的第15课研究：错误路径被Squash后，架构状态正确不意味着Cache等微架构痕迹全部消失。今天继续讨论**错误路径究竟从哪个PC开始**。对条件分支，关键可能是预测Taken还是Not Taken；对间接分支，方向往往已知为跳转，困难在于目标地址需要运行时才能确定。两者对应不同的预测机制与安全风险。

本讲结束后应能回答：BTB命中与方向预测正确有何区别？RSB为什么比普通BTB更适合预测函数返回？Retpoline如何让“投机返回地址”与“架构返回地址”不同？为什么Retpoline不能脱离CPU特性、内核配置和威胁模型承诺绝对安全？

## 一、为什么间接分支比直接跳转更难预测？（2分钟）

比较三种控制流：

~~~text
条件分支：if (cond) goto L        // 判断方向，L通常可从指令编码求得
直接跳转：goto L                   // 目标通常由指令本身确定
间接跳转：goto target_register     // 目标来自寄存器/内存的运行时值
~~~

编译器生成的函数指针调用、虚函数分派、动态派发器，都可能包含间接CALL/JMP。执行单元真正读取到target_register之前，Fetch必须决定下一PC；否则即使后端有很多空闲执行单元，前端仍可能断供。

设间接分支所在地址为PC，真实目标为 \(T(PC,H,S)\)，依赖执行状态S和上下文H；预测器在操作数尚未准备好时给出 \(\widehat T\)。只有预测目标与真实目标一致且其他约束满足，提前取入的代码才属于正确路径。**“这条分支一定会跳”不能替代“它跳到哪里”。**

~~~mermaid
flowchart TD
  A["Fetch PC"] --> B["方向预测 / 解码信息"]
  A --> C["间接分支目标预测器（含BTB等）"]
  A --> D["返回预测器 RSB/RAS"]
  B --> E{"下一PC是否确定？"}
  C --> E
  D --> E
  E -->|"得到可用预测目标"| F["沿预测目标取指"]
  E -->|"目标尚未可用"| G["前端可能等待后续解析"]
  F --> H["执行时计算真实目标"]
  H --> I{"目标一致？"}
  I -->|"是"| J["保留正确路径"]
  I -->|"否"| K["Squash年轻错误路径；恢复重命名与预测状态"]
  K --> L["Redirect到真实目标"]
~~~

预测方向正确但目标错误，同样可能产生取指错误和恢复惩罚。

## 二、BTB：容量、组索引、Tag与别名（2分钟）

BTB（Branch Target Buffer）通常为分支PC缓存目标或相关元数据；实际高性能处理器的间接目标预测还可能结合路径历史及其他预测器，不一定只是简单的PC→target字典。今天先使用**教学用组相联BTB模型**：共E条、A路相联、S=E/A组，指令假定按4字节对齐，组索引为

\[
\operatorname{set}(PC)=((PC\gg2)\bmod S).
\]

同组不同PC还须比较Tag；若命中则使用缓存目标。容量未必足够，且多个不同PC会映射到同一组。**映射到同一组≠命中同一个Tag，更≠攻击已经发生。**

例：教学BTB有4组、每组2路、LRU替换、初始为空。三条间接分支PC分别是0x100、0x110、0x120，索引都是0。访问序列为A→B→A→C→A：

| 访问 | 查询结果 | 该组处理后最近使用→最久未用 |
|---|---|---|
| A | Miss并填入 | A |
| B | Miss并填入 | B,A |
| A | Hit | A,B |
| C | Miss，替换B | C,A |
| A | Hit | A,C |

共3次Miss。这里的Miss是**目标缓存没有该条记录**，不是方向预测错误；执行时仍可计算真实目标并更新表。真实处理器的BTB组织、共享与替换策略可能不同，这个例子不代表具体Intel或AMD硬件的真实索引算法。

## 三、RSB/RAS：为什么RET有专门预测结构？（2分钟）

当一条普通CALL在地址P执行，返回点是CALL之后的下一条指令地址。正常嵌套调用的返回遵循后进先出，因此返回地址栈（Return Stack Buffer，RSB；一些文献写RAS）能预测RET的目标。

~~~text
CALL A（返回点0x104）  RSB: [0x104]
  CALL B（返回点0x208）RSB: [0x104,0x208]
  RET B                   预测0x208；RSB:[0x104]
RET A                     预测0x104；RSB:[]
~~~

注意两类存储不能混淆：**架构栈**中的返回地址是程序的内存状态；**RSB**则是微架构预测结构，用来猜测RET在真实内存返回地址确定之前将跳向哪里。正常情况下二者常一致，但不是同一个存储物体。

若错误路径上投机CALL改变了RSB，发现分支误预测后，需要按实现的协议恢复或修复返回预测状态，否则正确路径RET可能使用错误历史。RSB容量有限；深度过大、非配对CALL/RET、异常控制流或上下文切换等还可能使预测不准确。某些CPU在RSB下溢时会采用其他预测机制，不能假定所有RET永远只依赖可靠RSB。

**算例：** 假设一次真实CALL位于0x400，返回地址是0x404；其调用的函数在0x700处再CALL，返回点是0x704。若此后错误路径又投机CALL并被Squash，在正确恢复后，函数内最近的一次RET应首先使用仍有效的0x704预测，然后外层RET才使用0x404。本例忽略指令长度变化，明确采用每条CALL为4字节的教学规则。

## 四、Spectre v2 / BTI：预测目标如何跨越信任边界？（2分钟）

Spectre v1（上一讲）重点讨论条件分支的边界检查绕过；Spectre v2则关注Branch Target Injection（BTI）：某种执行上下文可能影响间接分支目标预测，受害执行在真实目标解析前沿不应采用的预测目标进行瞬态执行。

不能仅凭“两个PC碰巧映射到同一个BTB组”宣称存在漏洞。要成立有意义的威胁，至少需要分析：

1. **观察者和保护边界**：谁应无法读取哪些信息？是否跨进程、跨权限或虚拟机？
2. **影响预测的能力**：外部上下文在该CPU、固件和隔离策略下，是否能真正影响受害的目标预测？
3. **可达瞬态路径**：错误预测目标处是否存在会引发相关微架构活动的代码，且在真实目标解析前确实被执行？
4. **可观察通道**：该活动是否使后续观测分布依赖受保护信息，而不只是产生与秘密无关的缓存噪声？

即使四个环节中的某一步失败，结果可能只是一次分支误预测和性能损失，而不是已证实的泄漏。Intel的相关技术文档也把间接预测器行为、历史影响和缓解控制分别讨论。参考[硬件推测行为技术说明](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/hardware-behavior-related-to-speculative-execution.html)。

## 五、Retpoline到底改变了什么？（3分钟）

Retpoline（Return Trampoline）是一种特定适用条件下，将可能受到目标注入影响的**间接JMP/CALL**改写为带返回指令的跳板序列的方法。它不是让所有投机执行停止，也不是让普通条件边界检查自动安全。

关键是**制造出两个不同的“返回目标”**：一个是RSB用于推测的安全捕获位置，另一个是架构栈被改写后、真实RET最终要使用的合法目标。

~~~text
原代码：
  indirect_jump target_register

概念上的retpoline（只用于机理说明，非可直接替换的ABI实现）：
  CALL setup            # 架构栈和RSB先记录 capture
capture:
  PAUSE / 屏障
  JMP capture           # 推测路径限制在捕获循环内
setup:
  将架构栈顶返回地址改为真实target
  RET                   # 实际完成时使用架构返回地址
~~~

逐步推导：CALL首先向架构栈与RSB放入capture地址；setup只改**内存中的**返回地址，令其等于target，但不会相应修改刚才写入RSB的预测记录。遇到RET时，在适用的微架构上，前端预测沿RSB跳到capture；等真正解析返回地址，发现架构栈中的目标是target，预测路径被撤销并重定向到真实目标。安全收益来自**受预测影响的瞬态目标受到限制**，不是说架构上真的永远执行一个无限循环。

这种描述是概念模型；实际间接CALL版本需要保持真正调用者的返回地址和栈/ABI语义，不能照搬上述JMP示意。Intel明确给出了JMP与CALL的不同汇编序列，并指出CPU型号及RSB行为是Retpoline生效的重要前提。参考[Intel：Retpoline技术说明](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/retpoline-branch-target-injection-mitigation.html)。

### 失效边界：RSB下溢

若RSB为空，部分CPU上的RET可能退回使用其他间接分支预测器，这就削弱了“RET只按预期RSB目标投机”的假设。因此历史上出现了RSB填充、抑制替代预测等补充机制。不同CPU上的适用性不同，不应把“已经编译为Retpoline”当作所有新旧处理器、所有相关威胁下的通用完美防护证明。

## 六、Retpoline与eIBRS、IBPB、STIBP不是同一个机制（2分钟）

| 机制 | 核心作用（以支持的x86硬件与系统配置为背景） | 重要限制 |
|---|---|---|
| Retpoline | 软件跳板限制适用间接分支的投机目标 | 依赖硬件返回预测行为、编译覆盖与补充防护 |
| IBRS / enhanced IBRS | 硬件限制某些间接预测的跨域影响 | 覆盖依赖CPU能力、模式及其他威胁条件 |
| IBPB | 建立预测器域之间的隔离屏障，抑制此前历史对以后预测的影响 | 有成本，使用时机和硬件实现重要 |
| STIBP | 限制同一物理核的Sibling线程影响间接预测 | 针对同核SMT线程关系，而非一般全系统清空 |
| RSB保护 | 防止不可信或无效返回历史影响敏感RET预测 | 具体措施取决于下溢/替代预测行为 |

还存在Branch History Injection（BHI）等进一步威胁，不能以“已经有eIBRS”四个字代替威胁模型审计；相关控制和系统更新需按CPU、微码与内核能力选择。**不要为了跑一个课程性能基准而关闭真实机器的安全缓解。**

Linux内核会根据CPU能力、编译配置、微码和策略选择防护；用户可在有权限的系统上只读查看漏洞与缓解状态，例如：

~~~sh
cat /sys/devices/system/cpu/vulnerabilities/spectre_v2
~~~

这只说明系统报告的保护状态；不能仅凭一行字符串证明所有用户程序都不存在侧信道。参考[Linux内核Spectre说明](https://docs.kernel.org/admin-guide/hw-vuln/spectre.html)以及[Intel间接分支缓解说明](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/speculative-execution-side-channel-mitigations.html)。

## 七、数值性能账本：准确率、性能和安全分别评估（2分钟）

定义：
- \(N\)：退休指令数；
- \(f_i\)：间接分支占退休指令比例；
- \(p_t\)：本次目标预测错误概率，**按间接分支为分母**；
- \(P_t\)：每次错误造成的额外、没有与其他停顿重叠的周期数；
- \(d\)：某缓解方案对每次间接分支新增的平均周期（仅在给定性能模型下）。

若误预测额外损失不重叠，可有

\[
N_{\mathrm{target\ miss}}=Nf_ip_t,\qquad
\Delta C_{\mathrm{target}}=Nf_ip_tP_t,
\]

并得到

\[
\boxed{\Delta CPI_{\mathrm{target}}=f_ip_tP_t.}
\]

教学算例：一百万条退休指令，10%为间接分支；目标误预测率3%；每次额外损失12周期。这给出3000次目标预测错误、36000个额外周期、\(\Delta CPI=0.036\)。

若某替代机制改用Retpoline，不能将原来目标预测错误惩罚和新序列开销**默认直接相加**，因为它改变了预测机制与指令路径。应分别测配置A与B的真实退休指令、周期、前端空泡、替代序列和安全状态。若为了算数量级，明确设每次受保护间接分支额外成本2周期且完全不与其他开销重叠，则该项预算为 \(0.1\times2=0.2\) CPI；这不是任何具体CPU上的测量或推荐值。

**性能上界**是资源与时间模型的陈述，**缓解有效性**是特定威胁模型的安全陈述。一个方案即使使预测错误数变小，也不意味着一定更快；即使更慢，也不能据此断言已经安全。真实防护的有效性和性能成本必须分别取证。

## 八、回顾ROB、GHR与TSO：三种“恢复/提交/可见”不要混淆（1分钟）

若一次间接目标预测错误，处理器会丢弃对应年轻错误路径，不允许它们产生不可回滚的架构提交，并恢复需要的Rename/预测状态。但错误路径对Cache或预测器的微架构变化可能仍可观测，这就是安全分析不能止于ROB的原因。

另一方面，**Store从ROB退休以后可能仍在Store Buffer中等待对其他核可见**。这是内存模型的概念，而不是间接分支预测的概念。

~~~text
预测目标错误 → Squash与重定向 → 保证架构执行正确
瞬态访存   → 可能留下可观测微架构痕迹 → 需要独立保密性检查
Store退休  → 可能仍驻留Store Buffer   → 全局可见另按内存模型判断
~~~

特别记住：TSO Store Buffering允许的跨地址Store→Load顺序，与Spectre v2的目标注入泄漏，是不同问题。它们都涉及投机和缓冲，却不能混为一谈。

## 九、实践中的验证顺序与反例（1分钟）

**反例一：** 两个间接分支同组冲突导致BTB Miss。它能解释性能损失，但不能单独证明存在跨安全域攻击者或秘密泄漏。

**反例二：** 函数嵌套正常时RSB表现很好，但下溢后不同CPU可能采用替代预测；“所有RET都按理想栈预测”不是普适定律。

**反例三：** 所有间接CALL都已做Retpoline，不代表条件分支的Spectre v1、数据相关侧信道和其他新威胁全部解决。

**反例四：** 把目标预测器准确率从95%提高到99%，若新结构显著增加取指时延或能耗，最终IPC或成本仍可能更差。

做研究实验时，应在自有或授权机器上检查CPU能力、系统缓解报告、编译选项和实际生成代码，再固定负载比较前端停顿、目标错误、吞吐与延迟。不要只依据一个“Mitigation”状态词推断所有程序安全，更不要为了构造基线而关闭生产机器防护。

## 十、总结与下一讲

今天需要记住四句：

1. **方向预测正确不等于目标预测正确**，间接CALL/JMP通常需要额外目标预测。
2. **RSB是返回预测状态，不是架构栈**；误预测、深调用和下溢会影响它的行为。
3. **Retpoline借助RSB捕获投机RET，把真实架构返回导向合法目标**，但其有效性有CPU与系统前提。
4. **ROB保证可提交的架构顺序，安全缓解约束危险的瞬态路径，内存模型再规定跨核可见性**，三个问题不可互换。

**下一讲：2026年11月5日，第17课《控制流完整性与瞬态执行：IBT、Shadow Stack、预测器隔离和验证边界》**，继续第3周的分支与推测执行主题，重点比较程序控制流安全与瞬态预测安全。

---

# 四级分级测评（共100分）

**首次发送不展示标准答案。** 前三题由网站客观判分；Lv4保存完整分析文字，以评分要点人工或自评，不声称全自动验证开放设计。

### Lv1｜间接目标预测与架构提交（15分｜单选｜预计2分钟）

某条间接跳转的真实寄存器目标直到执行阶段才知道，前端此前预测了另一个PC。哪一项最严谨？

A. 既然间接跳转方向已确定为Taken，目标预测必然正确。

B. 可以暂沿预测目标取指；当真实目标不一致时，必须恢复错误年轻路径，不允许其产生不正确的架构提交。

C. 返回地址预测栈RSB能保证任意间接JMP的目标绝对正确。

D. 错误路径的指令只要写回物理寄存器，就必须视为已退休。

<details><summary>可选提示（不泄露答案）</summary>
把“能提前Fetch”与“允许最终Commit”分成两个判断，再区分间接JMP和RET。
</details>

### Lv2｜RSB投机恢复与返回目标Trace（20分｜数值｜预计4分钟）

教学模型规定所有CALL长度均为4字节，RSB容量至少4项、初始为空，RET遵循标准LIFO预测；错误路径CALL已经更新的RSB状态在Squash时被**完整恢复**。指令顺序：

- 正确路径CALL A位于0x410；
- A内部正确路径CALL B位于0x728；
- B内部错误路径投机CALL C位于0xA10，随后整条错误路径被Squash；
- B现在执行一次RET。

**这个RET从恢复后的RSB预测的返回PC，转换成十进制是多少？**

<details><summary>可选提示（不泄露答案）</summary>
每个CALL先把自己的下一指令地址压栈；错误路径的那次压栈在Squash时撤销；然后从正确栈顶预测RET。
</details>

### Lv3｜缓解边界与预测器隔离（25分｜多选｜预计5分钟）

根据上述教学模型与公开的硬件/内核缓解文档，选择所有正确陈述。

A. 间接CALL的目标可来自寄存器或内存，前端可以利用目标预测器提前获得候选下一PC。

B. 两个分支PC落入BTB同组，已经足以证明跨安全域的秘密泄漏真实存在。

C. RSB对于正常嵌套CALL/RET很有用；错误路径CALL的预测状态及下溢行为都需要考虑。

D. Retpoline在满足相关微架构前提时通过捕获RET的投机目标限制适用的间接分支投机；不能因此保证所有Spectre变种已解决。

E. enhanced IBRS保证所有CPU、所有配置和所有Spectre v1/v2/BHI变体均无需其他分析。

F. IBPB与STIBP面对的隔离情形不同：前者强调屏障前后预测影响，后者涉及同物理核Sibling线程。

<details><summary>可选提示（不泄露答案）</summary>
检查“共享预测器结构”和“成功泄漏”之间还缺哪些条件；RSB历史、Retpoline适用性和各控制的隔离边界是否相同。
</details>

### Lv4｜BTB冲突、返回栈恢复与缓解性能评估（40分｜开放推导｜预计10分钟）

请完成四部分，明确所用的简化模型及其不能推广到真实CPU的地方。

**A．组相联BTB执行Trace（12分）**：教学BTB有4组、每组2路、LRU替换、初始为空。使用 \(\operatorname{set}(PC)=((PC\gg2)\bmod4)\)，三条分支PC分别为A=0x100、B=0x110、C=0x120。按照 A→B→A→C→B→A 查询并在Miss后装入，逐项列命中/未命中、被替换的条目及总Miss数。解释“同组冲突”为什么不自动证明目标注入攻击成立。

**B．RSB恢复（10分）**：仍用4字节CALL教学模型、容量足够、初始空。正确路径先CALL于0x400，再CALL于0x700；错误路径随后CALL于0x900但被Squash，恢复正确RSB后依次执行两个RET。写出两个预测返回PC（十六进制），并解释若RSB下溢，为什么不能假定所有处理器仍只会预测这个理想栈。

**C．安全威胁与机制选择（10分）**：针对一个含间接函数指针调用的多租户服务，写出至少三个证明存在BTI风险需要检验的条件；说明Retpoline保护的步骤，以及为什么不能用它直接替代Spectre v1边界检查保护。比较IBPB和STIBP所针对的两个不同场景。

**D．性能反事实（8分）**：固定200,000条退休指令，其中10%为间接分支。方案A目标预测失误率5%，每次独立额外损失12周期，其余基线CPI=1.0。方案B在**特定假设下**采用有效缓解后，目标预测失误对应的这笔额外损失不再计入，但每条间接分支增加1.5个完全不重叠的额外周期，其他工作量和基线CPI不变。分别计算两方案总周期与CPI，解释为什么不能只根据哪一个更快就推断哪一个更安全。

<details><summary>可选提示（不泄露答案）</summary>
先按组索引追踪两路LRU；然后把返回预测用正确路径的后进先出栈列出来。性能部分分别建立A与B的时间账本，注意缓解会改变执行路径，因此题目已明确两种不重叠代价口径。
</details>

作答格式：

~~~text
Lv1：
Lv2：
Lv3：（所有选中字母）
Lv4：
  A：
  B：
  C：
  D：
~~~

评分：Lv1=15、Lv2=20、Lv3=25、Lv4=40。总分≥80继续既定课程；60–79补针对性trace；低于60复习目标预测、RSB恢复和隔离前提后再练。**任何补练都不改变第17课的日期和课号。**

## 本讲参考资料

- [Intel：Retpoline的机理、CALL/JMP版本与适用硬件限制](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/retpoline-branch-target-injection-mitigation.html)
- [Intel：推测执行相关硬件行为与BHI等边界](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/hardware-behavior-related-to-speculative-execution.html)
- [Intel：间接分支预测缓解控制](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/speculative-execution-side-channel-mitigations.html)
- [Linux内核：Spectre缓解及状态查询](https://docs.kernel.org/admin-guide/hw-vuln/spectre.html)
- [BOOM：Next-Line Predictor与BTB/BIM/RAS](https://docs.boom-core.org/en/latest/sections/branch-prediction/nl-predictor.html)
