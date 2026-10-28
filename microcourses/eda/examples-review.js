/* Source review quizzes, independently restated and structured for checking. */
(function(){'use strict';const{add,num:N,vec:V,single:S,multi:M,open:O,expr:X}=window.EDAExampleTools;
const src='dacs/lecture-notes-2025/lectures/mutual-exclusion/index.html';
add('REV-Amdahl90','T38',src,['Amdahl / Quiz'],'复习原题：90%并行、核心数与同步分母','基线时间归一1，其中0.9理想并行，0.1保持串行。原题问10核、至少5倍和10%同步开销；最后一项先明确两种分母。',[
N('10核无开销时整体速度比？',100/19,30,'先算时间0.1+0.9/10。','新时间0.19，速度100/19。','倍',1e-6),
N('至少5倍需要最少整数处理器数？',9,30,'0.1+0.9/n≤0.2。','n≥9，等号可达。'),
V('n=10：若同步为并行后计算时间的10%，以及为原始并行时间的10%，两种新总时间依次多少？',['相对并行后','相对原并行'],[0.199,0.28],40,'分别0.1+1.1×0.9/10与0.1+0.9/10+0.09。','10%没有分母就没有唯一数值。',1e-9)
],'这是复习原参数，不将两种解释混为一个确定的同步模型。');
add('REV-LockReorder','T39',src,['双线程互斥 / Quiz'],'复习原题：把flag写移到while之后','初始flag0=flag1=false。线程i先while(flag[j])，循环结束后才flag[i]=true，再进入CS。按P0读、P1读、P0写、P1写的交错观察。',[
V('两次读取的值，以及最后进入CS的线程数。',['P0读flag1','P1读flag0','CS线程数'],[0,0,2],60,'两次写都在两次读之后。','两人先读false而通过，再各自举手，最后同时进入。'),
S('这个反例直接违反哪项？',['Safety（互斥）','仅证明执行太慢','只违反数组长度','不能说明任何性质'],0,40)
],'单独原子读写也允许这个SC交错；check-then-set不是原子操作。');
add('REV-Philosophers','T39',src,['互斥 / 哲学家就餐 Quiz'],'复习原题：五筷等待环与三种性质','哲学家i的左筷i、右筷(i+1) mod 5；五人各持左筷、等待右筷。此处Safety指每根筷子互斥，不误解成五人全局只许一人吃。',[
V('按哲学家0..4填其所等右筷当前持有者。',['P0等待','P1等待','P2等待','P3等待','P4等待'],[1,2,3,4,0],35,'右筷由下一位哲学家作为左筷持有。','形成0→1→2→3→4→0循环等待。'),
V('当前可开始吃饭人数、形成环的资源数。',['可吃人数','资源数'],[0,5],25,'每人只有一根，不会释放直到吃完。','没有人能完成吃饭，五资源形成循环等待。'),
M('哪些描述正确？',['每根筷子仍可保持互斥占用','公平轮流调度可自动打破此等待环','无死锁性质失败','每个请求最终完成的性质失败'],[0,2,3],40)
],'资源安全仍成立不表示活性成立；死锁由持有并等待形成，不是单纯调度暂停。');
add('REV-PhilosopherPolicies','T39',src,['互斥 / 哲学家就餐 Quiz'],'复习原题：防死锁还不等于防饥饿','比较资源全序、最多四人尝试和FIFO服务员一次授予两筷。前提是吃饭有限且服务员/获准线程最终被调度。',[
M('哪些策略可破坏当前五人循环等待？',['按全局资源号递增获取','最多四人同时尝试取筷','仍允许五人各占左筷且永不释放','服务员只在两筷可用时原子授予'],[0,1,3],40),
S('资源排序单独是否自动证明无饥饿？',['不，资源竞争仍需公平机制或更强证明','是，无需任何调度前提','只有五人时必公平','排序等于严格FIFO'],0,30),
S('严格FIFO服务员只服务队首、一次授两筷，怎样论证无饥饿？',['有限先来请求依次完成，后来者不能无限越过','任意时刻只随机挑一个请求就够','不需要吃饭终止','所有筷子永不释放'],0,30)
],'两阶段占有资源与排队规则必须明示。严格FIFO可能牺牲并行度，但在给定进展前提下提供等待论证。');

const notes='dacs/lecture-notes-2025/lectures/';
add('REV-SquareNet','T18',notes+'placement/index.html',['Wirelength models / Quiz'],'复习原例：单位正方形四引脚','A(0,1),B(1,1),C(0,0),D(1,0)。分别计算包围盒、无权clique及最优平方star，不混用范数。',[
N('HPWL是多少？',2,20),N('无向clique共有多少条两两边？',6,20),
V('平方star的最优中心(x,y)与总平方成本。',['x','y','平方成本'],[0.5,0.5,2],40,'中心是均值，每个点距中心的平方为0.5。','4×0.5=2。',1e-9),
N('无权平方clique总成本是多少？',8,20,'四边各1，两对角各2。','4+4=8，等于4倍star。')
],'HPWL2、clique6边、平方clique8、平方star2是不同对象。');
window.EDAExamples.at(-1).visual={type:'grid-points',width:1,height:1,points:[['A',0,1],['B',1,1],['C',0,0],['D',1,0]]};
window.EDAGrids.REVLEE5={rows:['.....','.###.','.....','.....','.....'],start:[0,0],target:[2,4],optimal_length:6,source_pages:['Routing HTML末幅5×5图']};
if(window.EDARouting.search('REVLEE5').length!==6)throw Error('Review grid shortest distance mismatch');
add('REV-Lee5x5','T25',notes+'routing/index.html',['Lee算法 / 末幅5×5网格'],'复习原图：不要把5×5末图混成前面的4×4','使用复习正文末幅5×5图：S在行0列0，障碍在行1列1/2/3，T在行2列4。原文T(4,2)使用xy，本题统一零基行/列；不把前一幅4×4图拼进本例。',[
{type:'path',grid:'REVLEE5',points:70,prompt:'画任意一条合法最短路线。',optimal_length:6,require_optimal:true,hint:'顶行到第4列再向下，或从左侧绕过障碍。',explanation:'端点、障碍、四邻接与长度6均核对；同长不同形状接受。'},
N('最短边数是多少？',6,30,'Manhattan下界2+4可达到。','存在长度6的无障碍路径，达到下界。')
],'此5×5例与课件R034的4×4例是不同原材料实例，必须分别定位。');
window.EDAExamples.at(-1).visual={type:'routing-grid',grid:'REVLEE5'};
add('REV-SOPPOS','T07',notes+'logic-synthesis/index.html',['Logic representation / Quiz'],'复习原题：两种形式与literal账本','两个不同函数分别写成F=ab∨¬ac∨bc与G=(a∨b)(¬a∨c)。计算各自形式与literal数；不假设F和G等价。',[
V('SOP=1、POS=2；填F/G形式。',['F','G'],[1,2],40),
V('按变量每次出现（含反相）记一个literal，填F/G数量。',['F literals','G literals'],[6,4],40),
S('形式不同是否表示函数一定不同或一定相同？',['均不能，只能通过功能验证判断','必定相同','必定不同','literal数相同才可等价'],0,20)
],'F三项各2个literal，总6；G两括号各2，总4。表示形状与功能等价是两个问题。');
add('REV-TwoVariableShannon','T03',notes+'boolean-algebra/index.html',['Cofactor / Shannon Quiz'],'复习原题：对a、b两次展开','F(a,b,c)=ab∨¬ac。先固定a，再固定b；下标顺序为ab，不按字母排序猜测。',[
X('F00(c)=？',['c'],'c',20),X('F01(c)=？',['c'],'c',20),X('F10(c)=？',['c'],'0',20),X('F11(c)=？',['c'],'1',20),
X('用a,b,c写一个等价展开式（可化简）。',['a','b','c'],'(a&b)|(!a&c)',20)
],'两变量展开Σab的四个互斥选择项分别乘c、c、0、1；化简回ab∨¬ac。');
add('REV-DifferenceBoth','T04',notes+'boolean-algebra/index.html',['Boolean difference / Quiz'],'复习原题：同一函数分别对a、b敏感吗','F(a,b)=ab∨¬a，不能把对a的结果直接复制给对b。',[
X('输入∂F/∂a（只含b）。',['b'],'!b',40),X('输入∂F/∂b（只含a）。',['a'],'a',40),
V('输入(a,b)=(0,0)时，分别翻a、翻b是否改变F？',['翻a','翻b'],[1,0],20)
],'对a两支b与1，差分¬b；对b两支1与¬a，差分a。')

})();
