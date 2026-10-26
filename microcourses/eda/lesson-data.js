/* Original full teaching units. Quiz answers are displayed only on request. */
(function(){'use strict';
const T03=`<h1>T03 · Cofactor 与 Shannon 展开</h1><p class="lead">把布尔函数拆成两个分支，再把分支变成 MUX。来源：Boolean Algebra 第17–27张；往年 Q1、Q3 的基础。先修 T02，约30分钟。</p>
<h2>1. 从一个具体函数出发</h2><p>考虑 F(a,b,c)=ab+¬a·c。并列表示 AND，“+”表示 OR，¬表示 NOT，不能按实数算术理解。a=1时第一项负责输出，a=0时第二项负责输出。先枚举而不是背公式：</p><div class="table-wrap"><table><tr><th>a</th><th>b</th><th>c</th><th>ab</th><th>¬a·c</th><th>F</th></tr><tr><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>0</td><td>1</td><td>0</td><td>1</td><td>1</td></tr><tr><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td><td>1</td></tr><tr><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><td>1</td><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td></tr><tr><td>1</td><td>1</td><td>0</td><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>1</td><td>1</td><td>0</td><td>1</td></tr></table></div><p>按 a 分组：上半张 F=c，下半张 F=b。这个“固定一个变量、保留其余变量”的操作就是 cofactor。</p>
<h2>2. Cofactor 是代入，不是求导</h2><div class="formula">F<sub>x=0</sub>(y)=F(0,y)； F<sub>x=1</sub>(y)=F(1,y)</div><p>它们分别称为负、正 cofactor，不再依赖 x，但一般仍依赖其余变量 y。对本例：</p><div class="formula">F<sub>a=0</sub>=0·b+1·c=c<br>F<sub>a=1</sub>=1·b+0·c=b</div><p>每一步都同时替换 a 与 ¬a，再用 0·u=0、1·u=u、0+u=u 化简。只替换 a 而忘记 ¬a 会出错；只固定一个变量也不一定得到常数。</p>
<h2>3. Shannon 恒等式的完整证明</h2><div class="formula">F=xF<sub>x=1</sub>+¬xF<sub>x=0</sub></div><p>固定任意一组其余输入。若 x=1，右侧为 1·F₁+0·F₀=F₁，按定义等于 F(1,其余输入)。若 x=0，右侧为 0·F₁+1·F₀=F₀，等于 F(0,其余输入)。二值变量只有这两种取值，故对所有输入成立。</p><p>这里不是只检查两个样本：其余变量一直任意，我们检查的是覆盖全部输入的两类情况。这是证明中不能省略的量词。</p>
<h2>4. 从恒等式到 MUX</h2><p>二选一 MUX 的规则是 s=0 选 d₀，s=1 选 d₁，因此 Y=¬s·d₀+s·d₁。令 s=x、d₀=F₀、d₁=F₁，就得到 Shannon 实现。本例 select=a、0号口接 c、1号口接 b。</p><div data-demo="shannon"></div><p>先选 a=0，只翻转 b，观察输出不变；再选 a=1，只翻转 c，输出不变。这是条件屏蔽，而不是 b 或 c 永远无关。交换两数据端但不改变 select，一般会改变函数；同时反相 select 并交换数据端才保持功能。</p>
<h2>5. 选择不同展开变量会怎样？</h2><p>同一个 F 改为按 b 展开。逐项代入得 F<sub>b=0</sub>=¬a·c，F<sub>b=1</sub>=a+¬a·c。后一项用分配恒等式 A+BC=(A+B)(A+C)：</p><div class="formula">a+¬a·c=(a+¬a)(a+c)=1·(a+c)=a+c<br>F=b(a+c)+¬b(¬a·c)</div><p>按 a 展开只剩数据输入 b、c；按 b 展开还需子函数 a+c 和 ¬a·c。两者都保持功能，但表示大小、共享机会和门库成本可能不同。不能只因函数相等便说面积和延迟一样。</p>
<h2>6. 多变量展开，不省略代回步骤</h2><p>先按 x 展开：F=xF₁+¬xF₀。再分别对两支按 y 展开，且下标顺序固定为 (x,y)：</p><div class="formula">F₁=yF₁₁+¬yF₁₀<br>F₀=yF₀₁+¬yF₀₀<br>F=xyF₁₁+x¬yF₁₀+¬xyF₀₁+¬x¬yF₀₀</div><p>最后一行是将前两行代回并分配。四个选择条件互斥且穷尽，每组 (x,y) 恰好选一支。继续展开可形成 MUX 树；合并相同 cofactor 和删除两数据端相同的 MUX 能进一步缩减表示。</p>
<h2>7. 冗余输入的必要充分条件</h2><div class="formula">F 与 x 无关 ⇔ F<sub>x=0</sub> ≡ F<sub>x=1</sub></div><p>必要性：若与 x 无关，固定其余输入后翻转 x 不改变输出，两 cofactor 逐点相同。充分性：若两者共同等于 G，则 Shannon 化为 xG+¬xG=(x+¬x)G=G，已不依赖 x。</p><p>“≡”要求对全部其余输入恒等，不是测试几组碰巧一样；两个语法不同的表达式也可能功能等价。后续 SAT 或规范表示可以辅助检验。</p>
<h2>8. 与考试和后续单元连接</h2><p>往年 Q1 检查选择因子；Q3先算 cofactor，再分别用 XOR、OR、AND得到布尔差分、存在量词和全称量词。共同基础不是四条孤立公式，而是两张子真值表。T04讲差异，T05讲并与交，T06讲网络修复。</p><p class="notice">以下四级题是新自测，首次不显示答案。Lv1–Lv3客观判分，Lv4按证明步骤自评或由人工/ChatGPT批改；开放题不自动得分。</p>`;
const L06=`<h1>L06 · 从一个输出元素到整个线性层</h1><p class="lead">完整讲解 W06_T01/T02/T03：Naive GEMM → Shared-memory Tiling → CourseLinear。来源：Week06指导书、课件1–56页、microllm_ops.cu、ops.py及公开测试。</p><p class="notice">本讲提供推导、手算与实现路线；没有把教学模拟说成CUDA性能实测。基础代码中的TODO仍需完成，测试命令不代表本次已跑过并通过。</p>
<h2>1. 三个层次的交付不要混淆</h2><p>T01要证明每个输出值正确；T02在相同功能下增加共享复用；T03证明模型确实调用优化kernel。单独kernel通过不等于接入模型；F.linear输出正确也不证明自写CUDA被使用。数值、调用路径、性能应分别验证。</p>
<h2>2. M、N、K 与行主序地址</h2><div class="formula">A:[M,K]；B:[K,N]；C:[M,N]<br>C[r,c]=Σ<sub>k=0…K−1</sub>A[r,k]B[k,c]<br>A偏移=rK+k；B偏移=kN+c；C偏移=rN+c</div><p>每个矩阵用自己的列数作为行长。M=2、K=5、N=3时，A[1,3]偏移8，B[2,1]偏移7，C[1,2]偏移5。先在非方阵验证，避免K=N掩盖错误。</p>
<h2>3. 为什么 threadIdx.x 用来算列？</h2><pre>row = blockIdx.y * blockDim.y + threadIdx.y
col = blockIdx.x * blockDim.x + threadIdx.x</pre><p>这是本实验选择的映射，不是CUDA规定x必须表示矩阵哪一维。x在block线性线程编号中变化最快，让它沿行主序的列移动通常有利于相邻访问。Naive kernel不含barrier，越界线程可在读取之前退出；有效线程用float acc沿K累加，再转回scalar_t写入rN+c。</p>
<h2>4. 共享内存到底省了哪些读？</h2><p>每个C元素读A的K项和B的K项，MN个输出约2MNK次global元素请求。一个T×T块每轮装入两个T×T tile，却完成约T³次乘加，每份数据供多个输出复用。理想整除时总global读约2MNK/T。</p><p>这是逻辑请求量，不是DRAM物理流量；naive重复读取也可能命中Cache。共享装载、同步、寄存器和occupancy有成本，因此不能承诺16倍少请求就16倍快。</p>
<h2>5. 两个矩阵为什么用不同索引装载？</h2><pre>tileA[ty][tx] ← A[row, start+tx]     // A的K轴在列
tileB[ty][tx] ← B[start+ty, col]     // B的K轴在行
// 各自越界的源坐标应补0
acc += tileA[ty][offset] * tileB[offset][tx]</pre><p>shared数组都按[ty][tx]存放，但global源坐标不同。A按输出行固定、沿K取一段；B按输出列固定、沿K取一段。累加时从tileA取一行、tileB取一列，恰好对应数学求和。</p>
<h2>6. 两处 barrier 分别保护什么？</h2><pre>装载或补0 → 第一次同步 → 读取并累加 → 第二次同步 → 下一轮装载</pre><p>第一次保护生产者到消费者：不能在别的线程未装完时读shared。第二次保护消费者到下一轮生产者：快线程不能提前覆盖慢线程尚未读完的数据。</p><p>输出row越界的线程仍可能负责B tile的有效加载；它也必须按既定规则到达block同步点。因此T02不能照搬T01的early return。正确处理是加载时分别判界/补0，最终写回时再检查输出是否合法。</p>
<h2>7. 两轮 tile 的逐项手算</h2><pre>A = [[1, 2, 0, 1, 2],
     [2,-1, 1, 0, 3]]
B = [[1, 2, 0], [0, 1, 1], [2, 0, 1],
     [1,-1, 2], [3, 2, 1]]</pre><p>T=4，K=5分为k0…3和k4+三个补0槽。C[0,1]第一轮1×2+2×1+0×0+1×(−1)=3，第二轮2×2=4，合计7。acc跨轮保留；shared的越界槽必须每轮重新写0，不能留旧值。</p><div data-demo="gemm"></div><div class="table-wrap"><table><tr><th>输出</th><th>第0轮</th><th>第1轮</th><th>总和</th></tr><tr><td>C[0,0]</td><td>2</td><td>6</td><td>8</td></tr><tr><td>C[0,1]</td><td>3</td><td>4</td><td>7</td></tr><tr><td>C[0,2]</td><td>4</td><td>2</td><td>6</td></tr><tr><td>C[1,0]</td><td>4</td><td>9</td><td>13</td></tr><tr><td>C[1,1]</td><td>3</td><td>6</td><td>9</td></tr><tr><td>C[1,2]</td><td>0</td><td>3</td><td>3</td></tr></table></div>
<h2>8. 同 bank 不一定就是冲突</h2><p>采用本课32 banks、每bank4B模型，float tile[16][16]的bank=(16y+x) mod32。16×16 block中一个warp跨两行线程。读tileA[ty][offset]时每半warp读相同地址，可广播；两半warp的地址bank相差16。读tileB[offset][tx]时是16个连续地址被两半warp重复读取，也不因重复同地址而产生冲突。</p><p>不同地址落同bank才需要仔细分析串行化。32×32转置的按列访问可能所有lane同余，padding一列改变余数。必须逐warp、逐指令算地址，且声明设备模型，不把代际特性当永久定律。</p>
<h2>9. CourseLinear 的完整形状链</h2><p>Linear的weight布局是[out,in]，需要计算xWᵀ+b。输入[2,3,7]、out=5：</p><pre>x:[2,3,7]
→ flatten:[6,7]
weight:[5,7] → transpose.contiguous:[7,5]
→ tiled GEMM:[6,5]
→ bias broadcast
→ reshape:[2,3,5]</pre><p>reshape恢复原前导维度；bias转换到输出device/dtype。torch模式走F.linear；auto只对指定KernelUnavailable回退；cuda模式应重抛，不可把编译、shape或越界错误全吞掉。函数内动态导入cuda_matmul_tiled是本测试的可观察性约定，使monkeypatch能记录实际调用。</p>
<h2>10. 根据失败模式定位错误层次</h2><pre>python -m pytest tests/week06/test_matmul.py -q</pre><p>先T01非方阵/dtype，再T02尾块，再T03调用路径。方阵对、长方形错：看B的行长N。仅K不整除时错：查补0、acc与第二barrier。kernel单测对、模型错：查weight转置/flatten/bias。torch通过而cuda失败：不能说已完成优化接入。</p><p>FP32/FP16/BF16的容差以对应公开测试为准。性能另需固定设备、shape、dtype、预热、CUDA event计时，保存原始样本。没有GPU，只能验证手算和部分CPU逻辑，不虚报CUDA或速度。</p>
<h2>11. 下一步与自测</h2><p>完成T01→T02→T03后进入L07归约。RoPE/SwiGLU另在G21完整保留；Tensor Core、异步拷贝和双缓冲属于扩展，不冒充本周必交任务。</p><p class="notice">四题100分；前三题客观判分，开放设计按rubric人工/ChatGPT或自评，不自动添加40分。</p>`;
const quizT=[
{id:'q1',level:1,type:'single',points:15,prompt:'函数F(x,y,z)固定x=0得到cofactor，哪项正确？',options:['必定是0或1常数','一般仍依赖y,z，但已不依赖x','等于对x的普通微积分导数','在一个输入相同即可删除x'],answer:1,hint:'固定一个输入不等于固定全部输入。',explanation:'F(0,y,z)通常仍是y,z的函数。'},
{id:'q2',level:2,type:'numeric',points:20,prompt:'MUX以x为select，d0=y AND z，d1=y OR z。全部8种(x,y,z)中输出1共有多少种？',answer:4,tolerance:0,hint:'分别统计x=0和x=1。',explanation:'AND分支1种，OR分支3种，总计4。'},
{id:'q3',level:3,type:'multi',points:25,prompt:'哪些判断正确？',options:['F0≡F1时可用共同子函数替代MUX','只交换数据口永远不改变功能','不同变量顺序完整展开保持功能，但化简规模可能不同','表达式语法不同必然功能不同'],answer:[0,2],hint:'区分功能、语法和表示成本。',explanation:'A由(x+¬x)G=G；C由展开恒等式成立。交换端口一般改变函数，语法不同可能等价。'},
{id:'q4',level:4,type:'open',points:40,prompt:'F=(a OR b) AND ((NOT a) OR c)。A(10)求两cofactor并构造MUX；B(10)完整8行表验证；C(12)证明F0≡F1当且仅当F与选择变量无关；D(8)说明门库映射还需哪些成本信息。',hint:'分别代入a，注明恒等覆盖全部其余输入。',rubric:['Fa0=b，Fa1=c，MUX连接正确（10）','000至111输出00110101，原式与MUX逐行一致（10）','双向证明，量词覆盖全部输入（12）','库门面积/引脚延迟/负载/共享/物理成本（8）'],model_answer:'a=0时b(1+c)=b；a=1时(1+b)c=c，故F=¬a b+a c。真值向量00110101。若无关则两分支逐点同；若两分支均为G，则F=(a+¬a)G=G。功能等价不保证具体库与负载下PPA最优。'}];
const quizL=[
{id:'q1',level:1,type:'single',points:15,prompt:'Tiled GEMM某线程的输出row≥M，哪项最严谨？',options:['必须立即return','跳过最终输出，但仍按加载和barrier职责参与','跳过第一barrier，第二个自动修复','该block所有线程都无效'],answer:1,hint:'输出职责与协同加载职责不同。',explanation:'越界输出线程可能装载其他线程需要的数据，必须保持同步参与规则。'},
{id:'q2',level:2,type:'numeric',points:20,prompt:'A[3,7]、B[7,5]、C[3,5]均行主序。B[4,3]的零基元素偏移是多少？',answer:23,tolerance:0,hint:'B自己的列数是行长。',explanation:'4×5+3=23个元素，不是字节。'},
{id:'q3',level:3,type:'multi',points:25,prompt:'哪些优化/集成判断成立？',options:['两barrier分别保护装载完成与读取完成','global请求少T倍保证总耗时少T倍','Linear需flatten、weight转置、结果reshape','cuda模式静默回退仍能证明kernel接入'],answer:[0,2],hint:'区分逻辑请求、DRAM流量、执行时间和dispatch。',explanation:'A与C成立。Cache、同步、资源限制破坏简单加速比例；静默回退不能证明接入。'},
{id:'q4',level:4,type:'open',points:40,prompt:'A(10)推导A/B/C偏移和输出线程唯一性；B(12)给tiled伪代码，解释补0/两barrier/acc/写回；C(8)推导2MNK/T及前提；D(10)设计数值、尾块、dispatch测试并说明无GPU边界。',hint:'按生产者、消费者和下一轮覆盖顺序推理。',rubric:['rK+k、kN+c、rN+c及唯一映射（10）','正确循环/补0/同步/保留acc/写回（12）','(MN/T²)(K/T)2T²；整除和cache限制（8）','非方阵、K尾块、dtype、monkeypatch与真实CUDA证据分开（10）'],model_answer:'线程唯一分解row/col。每轮load A[row,start+tx]和B[start+ty,col]，越界0；同步；offset求积累加；同步；循环后合法写回。理想读量(MN/T²)(K/T)2T²=2MNK/T。数值正确和真实调用分别测试，无GPU不宣称CUDA通过。'}];
window.EDALessons={T03:{html:T03,quiz:{version:1,lesson_id:'T03',questions:quizT}},L06:{html:L06,quiz:{version:1,lesson_id:'L06',questions:quizL}}};
})();
