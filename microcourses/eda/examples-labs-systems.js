/* Reconciled against materials e54dfbaa; stable IDs preserve earlier drafts, which need regrading. */
(function(){'use strict';const{add:register,num:N,vec:V,single:S,multi:M,open:O}=window.EDAExampleTools;
function add(id,unit,week,section,title,stem,questions,solution){register(id,unit,'intelligent-computing/lab-guides/weeks/week'+week+'.html',section,title,stem,questions,solution,'extension');const e=window.EDAExamples.at(-1);e.source_section=section;e.source_note='基于当前指导书新增的合同辨析或数值变式，不冒充另一组原题；本组曾有旧接口描述，恢复草稿后请按现题复核。';e.reconciled_from='6b8004f97c2a68d5673e087a7663c950e760c130';}
add('LAB10-TRANSFER','L10','10','W10_T01与W10_T02；新增消费者例','新增：Pinned源、事件交接与缓冲区生命期','当前任务是Qwen3TorchBackend._to_device和TransferPipeline.submit，不存在本题所称的通用CPU/GPU planner。新增消费者独立计算y=2x，x=arange(8)；输入在H2D完成前必须稳定，输出保持独立。',[
V('新增消费者输出前四项。',['0','1','2','3'],[0,2,4,6],20,'逐项乘2。','0、2、4、6；这只是明确给出的新增计算，不是TransferPipeline内置算子。'),
M('按当前_to_device合同，哪些说法成立？',['目标非CUDA时直接tensor.to(device)，不调用CUDA API','non_blocking=True保证CPU返回时复制已完成','使用transfer stream复制后，compute须建立等待依赖','跨stream消费的张量还须record_stream维护分配器生命期'],[0,2,3],35,'提交、执行先后与内存生命周期分别检验。','A/C/D成立；API返回不是复制完成证据。'),
S('正确transfer→compute交接顺序是哪项？',['传输流copy并record事件，计算流wait事件后读取','CPU发起copy后计算流立即无依赖读取','每batch立刻全设备同步再称重叠','事件在copy前记录然后当作完成证据'],0,25,'事件应位于需要等待的工作之后。','copy后的事件代表此前传输完成，消费流等待该事件。'),
O('解释stream、event和源/目标缓冲区生命期，以及为什么非阻塞API返回不代表可立即重用Pinned源。',20,'最后一次使用之前数据都必须稳定。',['copy/compute使用区间与持有引用（10）','源不能提前改写、输出完成后CPU消费（10）'],'Pinned源要到H2D完成才可覆盖；设备结果若仍被compute消费，分配器必须知道该使用关系。event建立执行先后但不自动保留Python引用；record_stream告知显存使用流但不等待复制。当前课程每次to(device)创建新设备张量，host槽复用只须等待其旧复制，而非旧消费者全部完成。')],
'对正式接口、数据就绪、显存复用和host槽覆写分开建模。真实重叠仍需设备与环境证据，不从non_blocking参数推出。');
add('LAB11-CONTIGUOUS','L11','11','W11_T05生成循环与上下文上限','新增：只prefill一次与最后一步不多forward','新增单请求trace：prompt长度P=4，max_tokens=3，三次采样均非EOS。prefill处理4项，首token直接来自prefill logits；仅当还需下一token时才decode当前token。当前上下文预检为P+max(0,(max_tokens或1)−1)，这里需要6个位置。',[
V('最终生成数、decode调用次数、模型已处理的token前缀长度。',['生成数','decode调用','已处理前缀'],[3,2,6],30,'最后采样后已到上限，不再forward。','3、2、4+2=6；“已处理前缀”是本题计数，不假设存在cache.seq_len属性。'),
S('首轮采样即EOS时，事件和decode行为怎样？',['仍发出该EOS的token事件，再结束，不调用decode','先吞掉EOS且不发事件','清空prompt使前缀长度为0','忽略EOS直到长度上限'],0,25,'本课程token事件先于结束判断。','先追加并发token事件，然后EOS判停；释放当前KV句柄。'),
M('哪些做法属于当前正确性合同？',['空编码与容量不足在prefill前拒绝','用P+max_tokens强制比课程合同多占一个位置','异常或生成器close也在finally释放最新KV句柄','EOS、stop、长度的结束原因需要按规定优先顺序判断'],[0,2,3],25,'核对实际处理的token数，而非只数输出。','A/C/D成立。最大生成数3只需2次decode，容量本例为6而非7。'),
O('解释为什么生成token数量不同于已写入KV的新增token数量，并设计取消后的资源检查。',20,'最后一个token已经输出，却不必再送模型。',['首token由prefill产生、最后项不再forward（10）','在kv_cache或token事件后close，验证最新句柄只释放一次（10）'],'生成n项通常只执行n−1次decode；第n项是最后logits的采样，不再作为下一步输入。记录prefill/decode/release调用与句柄版本，在多个yield点close并确认finally释放最新句柄；不能只检查正常finished路径。')],
'P4/生成3是新增trace。保留EOS发出与先验容量检查；不引入当前课程没有的DecodeState或cache.seq_len接口。');
add('LAB12-PAGES','L12','12','BlockManager与逻辑/物理映射新增变式','新增：原子分配和blocks到tokens映射','新增教学allocator：block_size=2,num_blocks=3，按最小空闲编号分配。request1先取得2块[0,1]，再追加1块[2]。有效长度5需要3块，最后一块尾槽不得作为有效token读出。此B2变式不同于原公开B4测试。',[
V('free块数：初始、取得2块后、再取得1块后。',['初始','分配后','追加后'],[3,1,0],25,'申请成功才提交所有权变化。','3、1、0。'),
N('block_size2、有效长度5需要多少块？',3,20,'ceil5/2。','3。'),
V('逻辑token4的逻辑block编号与块内offset。',['逻辑block','offset'],[2,0],20,'商和余数。','2、0；随后还要查block table才能得到物理槽。'),
M('哪些说法成立？',['追加块不足时原block table/free list/length都应不变','所谓atomic只指一定调用GPU atomicAdd','有效前缀为5时不得把未写第6槽当作历史','最后一块有容量就等于所有槽都已写有效KV'],[0,2],20,'事务原子性与有效长度分别判断。','A/C成立。原子性在本实验指失败不留下部分状态，不是特定硬件指令。'),
O('说明先预检后提交的流程，以及释放后旧物理内容为何不应通过逻辑前缀泄漏。',15,'free不一定清零，但所有权/有效长度必须正确。',['先检查所需新增块数与资源，再统一提交（8）','有效长度和已写前缀限制读取（7）'],'ensure_capacity先算ceil(length/B)所需新增块，资源不足就报错且保持原表、空闲池和length。物理页复用不代表历史字节属于新请求；新请求只能读取其合法有效前缀，层和序列地址亦须隔离。')],
'B2/长度5/最小编号分配均为本题明确的新增条件，不替代当前源公开测试的B4和reserve接口。');
add('LAB13-SCHEDULE','L13','13','prefill优先与AsyncEngine.step新增变式','新增：先prefill、后decode与实际进度','当前Scheduler.schedule先尝试_schedule_prefill，无prefill批次才选择decode，且不混合两种BatchKind。新例max_num_seqs=3、max_num_batched_tokens=5、chunk开启：已有2条running decode请求，waiting中另有一个剩余10token的prefill。',[
V('本轮prefill token数与decode请求数。',['prefill token','decode请求'],[5,0],25,'不是decode优先预留2个token。','prefill优先，本轮5token全给等待prompt，decode暂停。'),
S('哪项正确地区分计划和执行？',['scheduled_start/end表示本次计划；引擎完成prefill后才推进prefill_offset','仅调用schedule就证明模型处理完成','每次查询都必须产生新token','等待请求一律永不进入running'],0,25,'调度器可更新计划状态，但模型完成需执行证据。','不能把排定区间当作已完成计算。当前接口不是select_batch/on_result，不承诺一个不存在的方法幂等。'),
V('另一新增例：prompt7、预算3、chunk开启、无其他请求。最少prefill轮数，以及首次发token事件最早第几轮step？',['prefill轮数','首token轮次'],[3,4],25,'三个prefill批次长度3/3/1，末批采样缓存next_token_id。','第1–3轮prefill不发token；第4轮decode接受并发出缓存的首token。'),
O('说明非末prefill chunk、末chunk和下一decode step各做什么，并解释长prompt造成的公平性边界。',25,'采样到token不等于已经发出token事件。',['非末chunk推进KV；末chunk采样并缓存；decode轮发出（15）','prefill优先可暂停既有decode，不能宣称无饥饿保证（10）'],'非末chunk只推进已处理前缀与KV；末chunk得到logits，采样存入next_token_id但本轮不emit；下一decode轮接受并发出token，再判断结束或forward。持续waiting可让running请求等待；本课程策略便于理解，不是自动公平、也不是混合批生产调度器。')],
'本题按当前源prefill优先合同纠正旧decode优先描述。新增7/3和10/5两组数值分别核算，不把mock通过当真实吞吐证据。');
add('LAB14-SLO','L14','14','测量范围与准入的新增综合题','新增：Goodput、联合达标与区间计量','独立定义2秒窗口完成10个请求，其中7个同时满足本题给定全部SLO。此处goodput定义为联合达标请求数/窗口；这些是扩展教学指标，不声称当前Week14定义了BenchRequest/BenchResult或MockClock接口。正式三任务为measure_three_runs、admission_decision与estimate_overlap_plan。',[
V('新增例请求吞吐与请求goodput，单位request/s。',['吞吐','goodput'],[5,3.5],25,'goodput只计同时达标请求。','10/2=5，7/2=3.5。',0.000001),
M('哪些测量判断成立？',['联合达标数作为goodput分子','TTFT达标率加TPOT达标率等于联合达标率','所有时间戳与duration须声明统一单位','单请求实验不能证明continuous batching吞吐伸缩'],[0,2,3],30,'联合事件不是边际概率相加。','A/C/D成立；联合达标须逐请求求交集。'),
V('新增工作区间[0,4]与[2,6]ms的时长和与并集。',['时长和','并集'],[8,6],20,'重叠2ms仅计一次。','8与6。'),
O('说明当前estimate_overlap_plan能证明什么、不能证明什么，并设计真实重叠验证。',25,'策略报告与设备测量是不同证据。',['同时pinned与transfer_stream才报告可重叠计划（10）','计划不测量复制/计算实际区间（5）','同负载真实事件或Systems轨道复测，保留数值正确性（10）'],'estimate_overlap_plan依据两个配置返回策略，不真实提交或计时GPU工作。要证明重叠需固定输入/消费者工作与设备环境，比较copy和compute区间及端到端完成时间，并验证依赖与结果正确。CPU逻辑测试不能证明带宽或实际GPU加速。')],
'新增10/7及区间数据不冒充原baseline。正式measure_three_runs预热后保留3次样本，报告均值、中位和离散，不能只挑最短。');
add('LAB15-PD','L15','15','KVTransferPlan与新增打包表','新增：KV字节、打包offsets和PD移交','采用原小模型维度2层、kv_heads2、head_dim4，但把源例BF16改为FP32：每token KV=2(K/V)×2层×2头×4维×4B=128B，长度3共384B。bandwidth_gbps仍按课程历史命名使用GB/s。额外固定延迟是本题新增网络模型，不是原KVTransferPlan参数。',[
V('新增FP32变式每token字节与长度3总字节。',['B/token','总B'],[128,384],30,'K/V都计，dtype每元素4B。','128、384；原BF16对应64B/token和192B总量。'),
V('独立打包例：请求长度[3,5]、B2，分别使用2和3块；按block数构造前缀offsets。',['offset0','offset1','offset2'],[0,2,5],25,'这里明确按块，不按token。','0、2、5；本题只是定义好的打包表示，不声称课程已有同名handoff API。'),
N('新增网络模型384B、1GB/s、额外固定延迟0.2ms，总传输耗时多少ms？',0.200384,25,'理想字节时间转ms后再加本题固定延迟。','0.2+384/1e9×1000=0.200384ms。','ms',0.0000001),
O('列出当前PDPhase合法阶段顺序，说明传输前后两侧KV何时可复用，并指出模拟器证据边界。',20,'当前枚举不是pending_kv/decode-ready。',['WAITING_PREFILL→PREFILLING→TRANSFERRING→DECODING→FINISHED及单调时间（12）','源最后读/目标到齐/模拟非真实传输（8）'],'当前顺序WAITING_PREFILL、PREFILLING、TRANSFERRING、DECODING、FINISHED，不得跳级且时间不倒退。真实系统源页须保留到发送完成，目标收到且验证完才可消费；当前课程只模拟阶段与共享资源时间线，未证明真实网络传输、缓存迁移或失败恢复已经实现。')],
'保留128/384数值作为明确FP32变式；0.2ms和offset打包都是新增定义，不伪造课程接口。');
add('LAB16-ACCEPT','L16','16','最终验收新增复核表','新增：综合证据不等于最快截图','Week16没有独立新代码任务，要求数值正确、关键模块接入、报告与可复现归档。此练习独立整理证据边界；不替代正式平台验收，不把未完成模块的Mock替身当真实实现。',[
M('哪些内容应进入最终证据索引？',['精确代码版本与设备/软件环境','各阶段pass/fail/not_run/not_integrated状态','只留最快一次并删掉失败日志','同负载baseline/优化结果与原始事件'],[0,1,3],40,'完整证据应可复查。','A/B/D；失败与未运行不能被抹掉。'),
S('CPU-only mock全通过，CUDA未运行，应如何写？',['mock逻辑通过，CUDA not_run，不能声称真实GPU加速','全部课程实验已通过','CUDA速度等于mock时间','无需记录设备'],0,25,'不同验证层不能互相冒充。','保留实际覆盖范围。'),
O('设计最终报告目录，让每个“提升”能追溯到代码、输入、计时与数值证据。',35,'图表指向同一实验ID及原始记录。',['任务/方法/正确性/性能/系统/局限（15）','环境版本、配置、样本、日志、命令（15）','失败与未验证边界（5）'],'包含目标合同、实现、数值/dispatch/integration、同负载性能和资源解释、Serving/PD结果与局限。每实验保存commit、输入/采样/负载、环境、命令与原始样本；图表由记录生成。当前未接HTTP的AsyncEngine、仅CPU模拟的PD应明确not_integrated或模拟，而非真实多机通过。')],
'不新增必交kernel或改正式分值。公开教学文本不替代受限个人作业，不代写明确要求独立完成的评审。');
})();
