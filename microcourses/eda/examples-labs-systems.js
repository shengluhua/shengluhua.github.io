(function(){'use strict';const{add,num:N,vec:V,single:S,multi:M,open:O}=window.EDAExampleTools;
add('LAB10-TRANSFER','L10','LAB10',[1],'原Week10：Pinned源、事件交接与不修改输入','传输接口只接受CPU源，dtype匹配、目标显式索引CUDA设备。GPU mode强制nonblocking；课程策略auto按Pinned源决定，explicit nonblocking的CPU源也须Pinned。示例micro-pipeline逐batch计算y=αx，若target=None也不能直接就地修改src。新增x=arange(8),α=2。',[
V('新增例的输出前四项。',['0','1','2','3'],[0,2,4,6],20,'独立输出，不改src。','0、2、4、6。'),
M('按课程planner合同，哪些请求应拒绝？',['src位于CUDA而非CPU','目标写cuda但未给设备索引','dtype与src不匹配','CPU planner且明确非异步的普通CPU源'],[0,1,2],35,'源/目标/精度/异步条件分别检验。','A/B/C拒绝；D可按CPU路径合法复制。'),
S('正确transfer→compute交接顺序是哪项？',['传输流copy并record事件，计算流wait事件后读取','CPU发起copy后计算流立即无依赖读取','每batch立刻全设备同步再称重叠','事件在copy前记录然后当作完成证据'],0,25,'事件应位于需要等待的工作之后。','copy后的事件代表此前传输完成，消费流等待该事件。'),
O('解释stream、event和源/目标缓冲区生命期，以及为什么非阻塞API返回不代表可立即重用Pinned源。',20,'最后一次使用之前数据都必须稳定。',['copy/compute使用区间与持有引用（10）','源不能提前改写、输出完成后CPU消费（10）'],'传输尚未完成时Pinned源必须保持，目标在compute完成前不能被下一batch覆盖。event建立顺序不自动保存Python对象生命周期，需持有正确引用并在最终需要时同步，不以API返回当全部完成。')],
'这些是本课程planner与流水接口合同，不把Pinned条件泛化为所有CUDA API的唯一行为。真实重叠仍需设备与环境证据。');
add('LAB11-CONTIGUOUS','L11','LAB11',[1],'原Week11：只prefill一次与最后一步不多forward','单请求引擎：prompt已读P个token时cache.seq_len=P；对logits先采样，只有还要生成下一项时才把新token送入decode forward。新增P=4,max_new_tokens=3，三次采样都非EOS。容量检查按P+max_new_tokens≤capacity保守执行。',[
V('新增例最终生成数、decode forward次数、cache.seq_len。',['生成数','decode forward','cache长度'],[3,2,6],30,'最后一次采样后已到上限，不必再forward。','3、2、4+2=6。'),
S('首轮采样即EOS时，cache和decode行为怎样？',['生成该EOS后结束，不做decode forward，cache仍只有prompt','仍必须forward一次EOS才结束','清空prompt使seq_len为0','继续到max_new_tokens才结束'],0,25,'终止条件应在下一次forward之前检查。','避免无意义计算和cache增长。'),
M('哪些做法属于本课程正确性合同？',['new/decode的输入和logits秩必须核对','cache读取未写前缀可直接返回未初始化张量','输出列表和DecodeState保持一致','decode未prefill或容量不足应显式报错'],[0,2,3],25,'接口错误不要由下游随机失败替代。','A/C/D成立。'),
O('说明温度greedy、多batch采样和cache容量为何是不同层验证，并给输入不应被修改的检查。',20,'采样是logits到token，cache管理已执行前缀。',['采样shape/温度合同与状态分离（10）','保留输入副本、先验容量与合法前缀（10）'],'greedy是确定选择规则，多batch返回每行token；cache状态说明模型处理过哪些token，不能由输出数量直接推断。先验证rank、temperature和容量，保留输入tensor/列表副本，读取只允许已append前缀。')],
'P4/生成3是明确新增trace，原引擎避免最后多forward、EOS立即终止和保守容量合同保留。');
add('LAB12-PAGES','L12','LAB12',[1],'原Week12：原子分配和blocks到tokens映射','原公开例block_size=2,num_blocks=3，为request1分配2块得到[0,1]，追加1块得到[2]。另cacheblock2、连续K/V长度5，需3块并返回[H,5,D]精确前缀；最后一块尾槽不进入读结果。',[
V('原allocator三次状态：初始free数、分配2块后、追加1块后。',['初始','分配后','追加后'],[3,1,0],25,'append成功才提交所有权变化。','3、1、0。'),
N('block_size2、seq_len5需要多少块？',3,20,'ceil5/2。','3。'),
V('逻辑token4的逻辑block编号与块内offset。',['逻辑block','offset'],[2,0],20,'商和余数。','2、0，随后通过block table查物理块ID。'),
M('哪些验证成立？',['请求追加块数不足时原block table/free list必须不变','所谓atomic只指一定调用GPU atomicAdd','release空/不存在请求按合同为no-op','read返回完整块容量6而不是有效长度5也算正确'],[0,2],20,'这里atomic是全有或全无的状态转移。','A/C成立；B混淆事务原子性，D会暴露未写尾槽。'),
O('解释先预检后提交的流程以及释放后旧物理内容为何不应通过逻辑前缀泄漏。',15,'free不一定清零，但所有权/有效长度必须正确。',['先检查资源与所有输入，再统一修改（8）','有效长度和重新append限制读取（7）'],'先验证request、块数、所有层shape/dtype/device与资源，足够后一次提交映射/写入；失败无部分改动。释放后物理字节可未清零，但新请求只能读其已写有效前缀，不能把历史内容当新KV。')],
'原返回块编号和5token尾块实例保留；测试不要求为每次free清零全部物理页，但要求状态隔离。');
add('LAB13-SCHEDULE','L13','LAB13',[1],'原Week13：decode优先、预算和幂等select','原mock引擎max_new_tokens=2，prompt[1,2]→[4,5]，prompt[4]→[6,7]；完成后的step返回空。scheduler.select_batch只返回选择，不应提前更新已处理token数；on_result才按runner结果推进。',[
V('原两个请求的生成token序列合并填写。',['req1-0','req1-1','req2-0','req2-1'],[4,5,6,7],25,'mock输出用于状态验证，不是模型预测质量。','4、5、6、7。'),
S('在未提交新结果前连续调用select_batch，正确行为是什么？',['选择与请求进度保持幂等，不因查询而消耗prompt','每次调用都自动把prompt进度加一','每次都释放请求页','必须产生新token'],0,25,'选择计划不等于执行完成。','进度由结果事件推进。'),
V('新增预算例：max_batch_size3,max_batch_tokens5，两条decode各花1，等待prefill剩余10。若有空位，该prefill本轮最多取几token，合计token多少？',['prefill chunk','总token'],[3,5],25,'decode先保留2，剩余预算3。','3与5。'),
O('说明非末prefill chunk与末chunk输出策略，以及为什么busy loop不能作为容量不足的调度方案。',25,'token=None不等于请求失败。',['非末chunk只推进KV，不采样；末chunk产生首token（15）','资源不足明确定义等待/失败且避免无进展循环（10）'],'非末chunk返回token=None，仍报告processed数和cache增长；末chunk才采样首输出。容量或预算不足时保持可恢复状态并报告原因，不能重复选择零进展batch无限循环。')],
'原mock生成序列保留；真实模型runner、采样和pagedcache需另做integration，不把mock通过当CUDA吞吐证据。');
add('LAB14-SLO','L14','LAB14',[1],'原Week14：Goodput、准入与mock并行区间','BenchRequest包含arrival_time,prompt_tokens,max_new_tokens（默认到达0）；BenchResult保留每请求TTFT/TPOT/E2E、各自SLO和联合SLO比例、吞吐/goodput、wait_ms、max_queue_depth、Makespan。新增2秒窗口完成10请求，其中7同时满足全部SLO。',[
V('新增例请求吞吐与请求goodput，单位request/s。',['吞吐','goodput'],[5,3.5],25,'goodput只计同时达标的请求。','10/2=5，7/2=3.5。',0.000001),
M('哪些原指标合同成立？',['goodput_numerator保存联合达标数','按TTFT达标率加TPOT达标率得到联合达标率','arrival_time与duration必须明确统一单位','单请求实验不能证明continuousbatch吞吐伸缩'],[0,2,3],30,'联合事件不是边际概率相加。','A/C/D成立。'),
V('新增两工作区间[0,4]与[2,6]ms的时长和与并集。',['时长和','并集'],[8,6],20,'区间重叠2ms。','8与6。'),
O('说明原pipeline_ratio和benchmark_ratio各来自哪种范围，并解释MockClock为何不能被报告成真实GPU加速。',25,'构造时钟检验时间线逻辑，不提供硬件测量。',['单工作流串行路径/异步makespan与多请求bench区分（10）','相同工作和依赖边界（5）','mock非GPU，需真实事件/环境复测（10）'],'pipeline_ratio比较同工作串行模拟时间与流水makespan；benchmark_ratio比较定义一致的请求集合基准。MockClock可验证计划与重叠算式，不能证明真实传输并发、设备带宽或端到端收益，必须单独标明并真实运行。')],
'保留原结果字段和arrival_time接口；新增10/7与区间数据用于客观判分，不冒充原baseline_json数值。');
add('LAB15-PD','L15','LAB15',[1],'原Week15：KV字节、offsets和PD移交顺序','模型2层、kv_heads=2、head_dim4、float32，给定seq_len3时每token KV=2(K/V)×2层×2头×4维×4B=128B，总384B。传输参数名bandwidth_gbps在课程实现中按GB/s使用，原shape接口retains此历史命名。',[
V('填写每token字节和长度3总字节。',['B/token','总B'],[128,384],30,'K与V都要计入。','128、384。'),
V('新增handoff请求长度[3,5]、block_size2、物理块分别[0,1]和[2,3,4]，offsets按block计。填写。',['offset0','offset1','offset2'],[0,2,5],25,'不是token前缀[0,3,8]。','0、2、5。'),
N('384B、bandwidth_gbps=1且base_latency_ms=0.2，按课程GB/s口径传输耗时多少ms？',0.200384,25,'bytes/(1e9B/s)转ms再加固定延迟。','0.2+384/1e9×1000=0.200384ms。','ms',0.0000001),
O('按顺序列PREFILL_DONE后pending_kv、transfer、decode-side ready与首decode，并说明源页何时可释放。',20,'目标KV写完前不能消费，源页在传输最后读前不能复用。',['状态与依赖顺序（12）','两侧所有权/失败清理/生命期（8）'],'prefill完成进入pending_kv，生成带request IDs/block tables/offsets/dtype/device/position的handoff，传输完且decodecache准备好后进入decode-ready，再发首decode。源页须在transfer完成或确定不再读后释放，失败两侧按合同清理。')],
'原128B/token计算保留；1GB/s和0.2ms是明确新增代入。单位纠错不是擅改课程API，需保持测试期望。');
add('LAB16-ACCEPT','L16','LAB16',[1],'原Week16：综合证据不等于单张最快截图','原Week16没有独立新代码任务，要求数值正确、关键模块统一接入、完整报告和可复现归档。评分看单测、模型生成和Serving、benchmark、端到端路径、报告；明确禁止把未完成模块的Mock替身当作真实实现证据。',[
M('哪些内容应进入最终证据索引？',['精确代码版本与设备/软件环境','各阶段pass/fail/not_run/not_integrated状态','只保留最快一次且删掉失败日志','同负载baseline/优化结果与原始事件'],[0,1,3],40,'完整证据应可复查而非只选好结果。','A/B/D必要。'),
S('CPU-only mock全部通过，CUDA实验未运行，应如何写？',['mock逻辑通过，CUDA not_run，不能声称真实GPU加速','全部课程实验已经通过','CUDA速度等于mock时间','无需再记录设备'],0,25,'不同验证层不能互相冒充。','保留真实限制比虚构完成更可信。'),
O('设计最终报告目录并说明怎样让任何一个“提升”追溯到代码、输入、计时与数值证据。',35,'每个图表应指向同一实验ID及原始记录。',['任务/方法/正确性/性能/系统/局限（15）','环境版本、配置、原始样本、日志和复现命令（15）','失败与未验证边界（5）'],'报告包括目标和合同、各模块实现、数值/dispatch/integration、同负载性能与资源解释、Serving/PD结果、失败和限制。为每实验保存commit、环境、输入/采样/负载、命令、日志和原始时间，图表由这些记录生成，不靠无法追溯截图。')],
'本组不增加原课程没有的必交kernel或改变正式分值。公开教学文本不替代受限个人作业，也不代写明确禁止AI的Shadow PC评审。');
})();
