/* Authored curriculum; no private documents, student records or credentials. */
(function(){'use strict';
const sourceCommit='e54dfbaa6e3e3807193184f2d4c6eee9c4f809aa';
const decks={
B:['dacs/slides/04-Boolean-Algebra.pptx',58],S:['dacs/slides/02-LogicSynthesis.pptx',106],P:['dacs/slides/03.1-Placement-GP.pdf',93],R:['dacs/slides/04.1-Routing.pdf',74],A1:['dacs/slides/Lecture-10-Arch-1.pdf',68],A2:['dacs/slides/Lecture-11-Arch-2.pdf',53],
G01:['intelligent-computing/slides/week01-智能计算系统基本概念.pdf',56],G02:['intelligent-computing/slides/week02-Performance-Analysis-Roofline.pdf',75],G03:['intelligent-computing/slides/week03-CUDA编程.pdf',54],G04:['intelligent-computing/slides/week04-GPU架构机制与优化.pdf',59],G05:['intelligent-computing/slides/week05-全局内存访问.pdf',33],G06:['intelligent-computing/slides/week06-矩阵乘法与模型算子.pdf',78]};
const text=`T01|全局图景|从规格到芯片：表示、PPA 与可验证优化|B:1-10;S:1-10;A1:1-18||区分算法、RTL、门级和物理设计；目标、约束与代理指标|同一设计经过综合、布局、布线的依赖图
T02|布尔代数|真值表、布尔代数与 Boolean Ring|B:11-16|T01|AND/OR/NOT与GF(2)的XOR不能混用；代数性质逐项检验|输入开关同步更新真值表和门电路
T03|布尔代数|Cofactor 与 Shannon 展开：把函数变成 MUX|B:17-27|T02|由x=0与x=1证明F=xF1+¬xF0；多变量展开|双分支MUX与完整真值表同步高亮
T04|布尔代数|布尔差分与逻辑敏感性|B:28-36|T03|F1 XOR F0；门电路、全加器与条件敏感性|翻转输入，逐格比较输出
T05|布尔代数|存在/全称量词与变量消去|B:37-45|T03|存在用OR，全称用AND；嵌套量词与消元顺序|将两张子真值表折叠合并
T06|布尔代数|网络修复与量词约束|B:46-58|T04,T05|未知节点、MUX修复编码、功能约束与可修复条件|每次消去一个变量，保留约束的来源
T07|逻辑综合|SOP/POS、逻辑网络与多级优化|S:11-16|T02|literal成本；节点simplification/removal/extraction|网络逐步改写、共享子表达式计数
T08|逻辑综合|AIG、结构哈希与重写优化|S:17-24|T07|结构等价和功能等价；rewriting、resubstitution、balancing、refactoring|合并相同子图，追踪面积/深度变化
T09|技术映射|门库、Subject Graph 与成本模型|S:25-36|T07|NAND/INV规范化；AOI/OAI模式和面积/延迟|同一函数的不同库实现
T10|技术映射|Tree Covering 与 DAG 切分|S:37-53|T09|合法覆盖、重叠/遗漏、共享扇出与切树损失|共享节点复制前后对比
T11|技术映射|模式匹配、对称引脚与旋转|S:54-61|T10|递归匹配、外部叶子、不对称引脚枚举|逐层标出匹配或失败原因
T12|技术映射|最小成本 DP 与覆盖回溯|S:62-83|T11|cost(v)=min(门成本+边界叶成本和)；缓存、回溯、延迟扩展|课件候选15/14/12与原卷18/14分开比较的代价树
T13|形式化方法|CNF、Tseitin 与逻辑等价验证|S:84-97|T03,T08|逐门SAT约束、miter、反例与不可满足|真值表逐行验证CNF
T14|形式化方法|精确综合与 SAT 网络修复|S:98-106|T13,T06|结构、功能、连接、输出变量；规模递增搜索|候选门数变化与可行性
T15|布局|布局建模、网表与指标|P:1-14|T01|单元坐标、合法性、密度与HPWL|拖动引脚改变包围盒与真实树长
T16|布局|模拟退火与重叠控制|P:15-25|T15|exp(−ΔE/T)、降温、移动/交换、罚项与合法化|固定ΔE观察温度和接受率
T17|布局|FM 划分与终端传播|P:26-38|T15|增益、平衡约束、递归划分和跨区网|每次移动一个cell并更新cut
T18|布局|二次线长、Clique/Star 与线性系统|P:39-49|T15|从Σw(xi−xj)²构造Q/b；固定端点和退化|网表→矩阵→求解坐标
T19|布局|扩散、伪网与解析布局外循环|P:50-68|T18,T17|overlap、rough legalization、pseudo-net、Gordian、Kraftwerk|求解/扩散/重求解的一轮状态
T20|布局|平滑线长与非线性密度|P:69-77|T18|LSE/WA、max/min近似与梯度；宏单元密度|平滑参数变化与目标误差
T21|布局|静电、Poisson、线搜索与 DREAMPlace|P:78-93|T20|ePlace能量/密度、梯度求解、合法化接口|密度热图、力场和目标项轨迹
T22|布线|RSMT、MST 与路径目标|R:1-10|T15|Steiner点、矩形几何、线长/路径/拥塞取舍|同一pin集合的不同树
T23|布线|FLUTE、Hannan 网格与 POWV|R:11-19|T22|排序编码、候选线长向量、查表和分解|改变坐标间隙重算候选成本
T24|布线|SALT：线长和源到汇路径折衷|R:20-29|T22|SLT/SS、DFS断点、ε约束与stretch|逐个加入breakpoint并记录代价
T25|布线|Lee 波前与最短路回溯|R:30-38|T22|等权BFS、访问不变量和最短性证明|逐层波前与逐边回溯
T26|布线|Akers、Hadlock 与 Soukup|R:39-47|T25|紧凑标签、回溯、detour与启发式边界|同网格切换编码和搜索策略
T27|布线|多引脚、Pattern、粗化与 A*|R:48-53|T25|分解/增量连通、启发信息与保证条件|加入第三个pin后的连通过程
T28|布线|全局/详细布线与拥塞协商|R:54-61|T22,T25|G-cell容量、网序、rip-up/reroute与negotiation|占用热图和拆线重布
T29|布线|并发/层次布线的整数规划|R:62-74|T28|路径变量、容量约束、目标、2×2区域分解|小网格线路选择转换为IP
T30|静态时序|AT/RAT、Setup/Hold 与 Slack|N:static-timing-analysis|T01|max/min传播、发射/捕获边沿、符号和修复方向|时序DAG逐节点标注时间
T31|体系结构|RISC-V、寄存器、控制流与定制扩展|A1:19-43|T01|字节地址、load/store、调用栈、立即数、自定义指令|逐指令寄存器与内存trace
T32|体系结构|RVV：VLEN/SEW/LMUL/vl 与 Mask|A1:44-68|T31|VLMAX公式、AVL/vl规则、混合位宽与尾部|寄存器分组和每个lane有效性
T33|体系结构|单周期与多周期数据通路|A2:1-20|T31|关键路径、mux/control、多周期FSM|逐周期数据路径与控制信号
T34|体系结构|流水线与三类 Hazard|A2:21-32|T33|填充/吞吐、结构/数据/控制、forwarding|执行表和bubble插入
T35|体系结构|分支预测、BHT 与 BTB|A2:33-40|T34|方向/目标地址、预测状态更新、错误恢复|逐分支预测和冲刷时间线
T36|体系结构|乱序、相关性与 BOOM|A2:41-53|T34|RAW真依赖与WAR/WAW名字相关、issue/complete顺序|依赖图与可执行集合
T37|存储系统|局部性、Cache、Memory Wall 与 CPI|N:memory-architecture|T33|地址拆分、命中/缺失、每指令停顿及重叠边界|逐地址set/tag/命中trace
T38|并行基础|Amdahl 时间分解与反求加速倍率|N:mutual-exclusion|T01|串并行份额、分母条件、恰好/至少目标|核心数和串行倍率滑块
T39|并发正确性|Safety/Liveness/Fairness 与 LockOne/Two|N:mutual-exclusion|T38|互斥、死锁、饥饿和线程交错反例|两个线程的可暂停状态机
T40|并发正确性|Peterson 与内存模型前提|N:mutual-exclusion|T39|flag/victim配合、SC假设、语言data race区别|最后写victim者让步与全局可见性
G01|智能计算基础|文本、Token、Decoder 与自回归|G01:1-13||条件概率、首token与后续token、prefill/decode|Token时间线和模型调用
G02|智能计算基础|张量、线性层与训练/推理实现边界|G01:14-28|G01|参数/激活/shape、host-device分工、编译|FFN数据维度与驻留位置
G03|服务指标|TTFT/ITL/TPOT/E2E、吞吐与 SLO|G01:29-56|G01|窗口、完成口径、请求与token平均|三请求事件线和指标计算
G04|性能基础|加速比、扩展性与等效率|G02:1-12|G03|强弱扩展、Amdahl；旧版补充等效率与DAG关键路径|固定工作量和工作量增长对比
G05|性能模型|FLOP/Byte 与分层 Roofline|G02:13-29|G02,G04|精度、计算/DRAM/cache屋顶；链路和依赖下界|拖动流量与算术强度
G06|性能优化|复用、合并访问、融合与效率|G02:30-43|G05|哪些优化改变F/Q，哪些改变可达效率|优化前后流量与资源预算
G07|性能证据|计时边界、CUDA Event 与 Systems|G02:44-60|G05|hostwall/deviceevent；API/queue/kernel；时长和与区间并集|CPU提交/GPU执行双时间线
G08|性能证据|Nsight Compute 与证伪实验|G02:61-75|G07|active/eligible/issued、throughput/stall与缺证据|指标→假设→对照实验
G09|CUDA基础|CPU 循环到线程索引和启动|G03:1-29|G02|global index、ceil网格、边界、分配复制和错误|线程—元素所有权格子图
G10|CUDA基础|SM/Warp、异步执行与测量|G03:30-54|G09,G07|block不是batch；同步位置、CPU参考和计时|提交与执行的先后关系
G11|GPU机制|Warp 调度与延迟隐藏|G04:1-16|G10|resident/eligible/issued、SIMT简化与ITS限定|逐周期warp等待/切换
G12|GPU机制|寄存器、Shared/Cache/Local 与 Shuffle|G04:17-26|G11|存储归属、复用范围、spill与warp内交换|变量到各层存储的路径
G13|GPU机制|融合、分歧、展开与 Grid-stride|G04:27-41|G12|中间流量、predication、控制流与索引不变量|分支掩码与线程循环轨迹
G14|GPU机制|Occupancy、资源约束与块大小|G04:42-59|G13|线程/寄存器/shared上界取min，spill反作用|资源预算条形图
G15|访存|Row-major、Warp 地址与 Sector|G05:1-14|G09,G12|坐标→元素→字节→sector，架构前提|逐lane高亮sector集合
G16|访存|列序读取、转置与二维索引|G05:15-33|G15|输入/输出布局、二维边界、logical与physical流量|非方阵线程地址trace
G17|矩阵乘|Naive GEMM 与线性层工作量|G06:1-12|G16|M/N/K、每线程C元素、FMA计数|单个输出的完整K归约
G18|矩阵乘|Shared Tiling、同步与尾块|G06:13-38|G17|协同加载、补0、两barrier、不可提前return|2×5乘5×3、tile4两轮累加
G19|矩阵乘|Bank Conflict、广播与 Padding|G06:39-48|G18|bank取模、同地址广播、不同地址冲突|32×32与32×33地址对照
G20|模型接入|CourseLinear 与 Backend 合同|G06:49-56|G18|flatten/weight转置/gemm/reshape/bias；fallback|调用链着色检验真实接入
G21|模型算子|RoPE、SiLU、SwiGLU 与融合边界|G06:57-78|G20|旋转坐标约定、形状和数值；保留非必交理论|坐标对旋转与门控数据流`;
function parseRefs(s){return s.split(';').map(r=>{const [k,v]=r.split(':');return k==='N'?{path:'dacs/lecture-notes-2025/lectures/'+v+'/index.html',section:'专题正文'}:{path:decks[k][0],pages:v.split('-').map(Number)}})}
const units=text.split('\n').map(line=>{let [id,module,title,ref,pre,derivation,visual]=line.split('|');return{id,track:id[0]==='T'?'theory':'gpu',module,title,sources:parseRefs(ref),prerequisites:pre?pre.split(','):[],derivation,visual,status:id==='T03'?'full_ready':'planned',minutes:35}});
const labTitles=['请求时间线与推理服务指标','Nsight Systems / Compute 与证据链','CUDA Vector Add 与 SAXPY','Grid-stride 与算子融合','全局内存、列序读取与转置','矩阵乘、Shared Tiling 与线性层接入','三层并行归约','Stable Softmax 与 RMSNorm','因果 Prefill 与 Decode Attention','异步 H2D、Stream 与缓冲区生命周期','单请求引擎与连续 KV','分页 KV 与原子分配','连续批处理与在线调度','系统测量、准入与传输重叠','PD 解耦：状态、字节与时间线','综合验收、报告与代码归档'];
const labPrereq=['G01,G03','G05,G07,G08','G09,G10','G13,G14','G15,G16','G17,G18,G19,G20','G12,G18','G21,L07','G01,G21,L08','G07,G10,L09','L09,L10','L11','L11,L12','L10,L13','L11,L12,L14','L01,L02,L03,L04,L05,L06,L07,L08,L09,L10,L11,L12,L13,L14,L15'];
const taskCount=[0,1,3,2,3,3,3,3,3,2,5,5,4,3,3,0];
labTitles.forEach((title,i)=>{let w=String(i+1).padStart(2,'0');units.push({id:'L'+w,track:'lab',module:'实验 Week '+w,title,sources:[{path:'intelligent-computing/lab-guides/weeks/week'+w+'.html',section:'指导书全部正文'}],prerequisites:labPrereq[i].split(','),status:i===5?'full_ready':'guide_ready',tasks:Array.from({length:taskCount[i]},(_,j)=>'W'+w+'_T'+String(j+1).padStart(2,'0')),minutes:60})});
const exams=[
[1,2,'布尔代数',1,'T03','Shannon展开','令x=1/0分别检验：F=xF₁+¬xF₀。两分支互斥且穷尽。','“+”是OR，不是实数加法。'],
[2,2,'布尔代数',1,'T04','布尔差分','F₁ XOR F₀；固定其他输入后，两个输出不同表示对x敏感。','仍可依赖其他变量，不是普通微积分导数。'],
[3,9,'布尔代数',1,'T03,T04,T05','Cofactor、差分与量词','F(a,b)=ab+¬a，Fa1=b、Fa0=1。因此差分¬b、存在量词1、全称量词b；三个小题各3分。','反相横线已按原页图核对；XOR/OR/AND不能混用。'],
[4,2,'体系结构',1,'T01,T33','CPU时间','T=IC×CPI×时钟周期=IC×CPI/f。检查条×周期/条×秒/周期的量纲。','更高频率不自动等于更短程序时间。'],
[5,4,'体系结构',1,'T34,T35','三类hazard','结构：资源冲突；数据：操作数依赖；控制：下一条指令不确定。分支归控制冒险。','RAW/WAR/WAW不是这三个顶层类别。'],
[6,6,'体系结构',1,'T01,T31,T33','时钟周期因素','器件/工艺影响门线延迟；ISA及其硬件实现影响关键路径。固定硬件上算法/语言/编译器通常主要改变IC/CPI。','不是RISC必然比CISC高频；区分ISA和具体微架构、DVFS。'],
[7,2,'逻辑综合',2,'T07','SOP两级逻辑','每个product由AND计算，再用OR合并所有product。','输入反相器计级采用课程口径。'],
[8,2,'逻辑综合',2,'T09,T10','Subject Graph','本课程tree-covering流程用NAND与INV规范化。','属于指定算法约定，不是所有EDA工具唯一表示。'],
[9,10,'逻辑综合',2,'T11,T12','Tree Covering成本','Cost(r)=5,s=6，INV=2，NAND2=3。匹配INV：t的AND需NAND+INV，成本16，再加INV得18；直接NAND覆盖z/t得14；min=14。小题3/3/4分。','已被大模式覆盖的内部节点不额外收费；DAG共享与tree DP不同。'],
[10,3,'存储系统',3,'T37','局部性','时间局部性是重复访问，空间局部性是邻近访问。用变量复用和数组扫描分别举例。','不是每个工作负载都具备良好局部性。'],
[11,2,'存储系统',3,'T37','存储层次','在速度、容量、成本间取舍，用小而快上层缓存常用数据，大而慢下层提供容量。','平均成本取决于命中率，不是把各层简单相加。'],
[12,3,'存储系统',3,'T37,G05','Memory Wall','数据供给的延迟/带宽与计算增长不匹配。Cache、预取、MLP和局部性针对不同原因。','低带宽利用率仍可能延迟或依赖受限。'],
[13,5,'存储系统',3,'T37','含miss的CPI','停顿/指令=0.25×0.04×100=1；实际CPI=理想1+停顿1=2。','该乘式是每指令停顿，不是程序总周期；忽略重叠。'],
[14,5,'互斥与并行',4,'T38','反求Amdahl倍率','0.3/k+0.7/n=0.5，k=0.3/(0.5−0.7/n)；有限正解须分母>0。','若目标为至少2倍且k≥1，n≥4时原方案已达标，无需再加速。'],
[15,8,'互斥与并行',4,'T39,T40','Peterson的victim','删除victim时两线程都可能置flag=true后互相等待；保留时最后写victim的线程让步，另一线程越过while。两题各4分。','证明假设原子读写与顺序一致可见性；普通C++共享bool不可直接当正确实现。'],
[16,2,'布局',4,'T15,T18','HPWL/Clique','按课程口径HPWL为乐观包围盒估计，clique连多对pin通常偏悲观。','带权/二次/归一化模型不能无条件共享同一上下界。'],
[17,3,'布局',5,'T16','SA重叠处理','代价加入overlap/density惩罚，或拒绝/回滚非法移动，后续合法化。','罚项不意味着每步合法或有限权重保证零重叠。'],
[18,3,'布局',5,'T16','温度','坏移动ΔE>0时p=exp(−ΔE/T)。高温更愿探索，低温更保守。','不是实际芯片温度；有限退火无条件全局保证不成立。'],
[19,4,'布局',5,'T18,T20','平滑目标','HPWL的max/min在并列极值处不可微；可微代理便于梯度优化。','Star仅指拓扑，L1-star仍可不可微；HPWL也可用次梯度。'],
[20,2,'布线',5,'T22','RSMT方向','线段沿水平或垂直方向，可加入非原始pin的Steiner点。','与欧氏Steiner或障碍布线的模型不同。'],
[21,2,'布线',5,'T25','Lee算法','等权格图上逐层波前是BFS，首次访问得到最短边数，再回溯。','带权边/不同via成本时不能直接保证最小权重。'],
[22,2,'布线',5,'T25,T26','Lee/Akers空间','经典Lee保留距离标签，Akers用紧凑编码节约每格标记；题目答Lee更多。','总内存还含队列和障碍信息，不能只看标签bit数。'],
[23,3,'布线',5,'T25','交换源汇','无向等权图中任一路径反向仍同长，最短距离对称。','访问顺序/节点数可能不同；有向或非对称成本不适用。'],
[24,3,'布线',5,'T25,T26','双向Lee','两个frontier相向扩展，通常较少节点，但需正确距离与判相遇。','不是最坏时间必减半；2D网格不是指数增长搜索树。'],
[25,3,'布线',6,'T23','FLUTE查表','小degree预计算相对排序/候选POWV；运行时用坐标间隙评估；高度网分解，速度与线长质量兼顾。','不是所有度数、障碍条件下都一次精确查表。'],
[26,4,'静态时序',6,'T30','Setup/Hold','Setup是在捕获沿前至少t_setup稳定；Hold是在捕获沿后至少t_hold保持稳定。','分别对应最大/最小路径，不可都只查最长路径。'],
[27,2,'静态时序',6,'T30','频率与违例','降频通常放宽setup；同沿hold一般不能靠降频修复，要增加最小数据延迟等。','时钟偏斜、特殊边沿与多周期约束需具体建模。'],
[28,2,'静态时序',6,'T30','Negative Slack','按相应检查定义slack<0即该约束违例；setup常用RAT−AT。','先注明setup/hold和时钟参考，再决定符号。']
].map(([question,points,module,page,refs,topic,walkthrough,boundary])=>({question,points,module,page,units:refs.split(','),topic,walkthrough,boundary}));
['布尔代数','逻辑综合','布局','布线','静态时序','体系结构','存储系统','互斥与并行'].forEach((module,i)=>{const q=exams.filter(x=>x.module===module);units.push({id:'E'+String(i+1).padStart(2,'0'),track:'exam',module:'真题复盘',title:module+'：逐题步骤与条件',questions:q.map(x=>x.question),points:q.reduce((s,x)=>s+x.points,0),prerequisites:[...new Set(q.flatMap(x=>x.units))],sources:[{path:'dacs/exam/pku-dacs-final-2025.pdf',section:'对应题号'}],status:'guide_ready',minutes:45})});
for(const u of units)u.exam_questions=exams.filter(q=>q.units.includes(u.id)).map(q=>q.question);
const reviews={ 'boolean-algebra':['T02','T03','T04','T05','T06'], 'logic-synthesis':['T07','T08','T09','T10','T11','T12','T13','T14'], placement:['T15','T16','T17','T18','T19','T20','T21'], routing:['T22','T23','T24','T25','T26','T27','T28','T29'], 'static-timing-analysis':['T30'], 'computer-architecture':['T01','T31','T32','T33','T34','T35','T36'], 'memory-architecture':['T37'], 'mutual-exclusion':['T38','T39','T40'] };
const pageMap=[];for(const [key,[path,n]]of Object.entries(decks)){for(let p=1;p<=n;p++)pageMap.push({path,page:p,units:units.filter(u=>u.sources.some(s=>s.path===path&&s.pages&&s.pages[0]<=p&&p<=s.pages[1])).map(u=>u.id)})}
if(units.length!==85||pageMap.length!==807||pageMap.some(x=>!x.units.length)||exams.reduce((s,q)=>s+q.points,0)!==100||taskCount.reduce((a,b)=>a+b,0)!==43)throw Error('EDA curriculum integrity check failed');
window.EDACourse={version:1,date:'2026-10-28',sourceCommit,decks,units,exams,reviews,pageMap,stats:{units:85,theory:40,gpu:21,labs:16,exam:8,pages:807,dacsPages:452,gpuPages:355,tasks:43,fullLessons:2},examDate:'2026-01-07',scopeWarning:'文件名年份2025，卷面为2025–2026学年第一学期，日期2026-01-07；教师说明今年范围改变。往年已考不等于本年命题预测。',legacy:'六份非完全相同旧版共358页已建立文本回查；保留等效率、执行DAG关键路径、忙区间与时长和等差异。文本相似度不代表所有图像语义等价已核验。'};
})();
