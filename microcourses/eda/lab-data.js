/* Independent teaching companions. No student submissions or private host details. */
(function(){'use strict';
const rows=`W02_T01|提交GPU性能分析记录|labs/week02/analysis-sheet.md|phase_range
W03_T01|向量加法kernel|kernels/vector_add.cu|vector_add_kernel
W03_T02|向量加法launch|kernels/vector_add.cu|vector_add
W03_T03|SAXPY|kernels/saxpy.cu|saxpy_kernel
W04_T01|Grid-stride SAXPY|kernels/saxpy.cu|saxpy_grid_stride_kernel
W04_T02|融合缩放/偏置/ReLU|kernels/elementwise.cu|fused_scale_bias_relu_kernel
W05_T01|连续copy|kernels/memory_access.cu|copy_coalesced_kernel
W05_T02|列序读取|kernels/memory_access.cu|copy_strided_kernel
W05_T03|矩阵转置|kernels/memory_access.cu|transpose_naive_kernel
W06_T01|Naive GEMM|kernels/microllm_ops.cu|matmul_kernel
W06_T02|Shared Tiled GEMM|kernels/microllm_ops.cu|matmul_tiled_kernel
W06_T03|线性层接入|microllm/model/ops.py|CourseLinear.forward
W07_T01|Warp sum/max|kernels/reduction.cu|warp_reduce_sum
W07_T02|逐行sum|kernels/reduction.cu|row_sum_kernel
W07_T03|逐行max|kernels/reduction.cu|row_max_kernel
W08_T01|Stable Softmax|kernels/microllm_ops.cu|softmax_kernel
W08_T02|RMSNorm kernel|kernels/microllm_ops.cu|rms_norm_kernel
W08_T03|RMSNorm接入|microllm/model/qwen3_torch.py|Qwen3RMSNorm.forward
W09_T01|Prefill dispatch|microllm/model/ops.py|dense_attention_prefill
W09_T02|Causal Prefill|kernels/microllm_ops.cu|dense_attention_prefill_kernel
W09_T03|Decode Attention|kernels/microllm_ops.cu|dense_attention_decode_kernel
W10_T01|异步H2D|microllm/model/qwen3_continuous_backend.py|Qwen3TorchBackend._to_device
W10_T02|传输缓冲池|microllm/runtime/pipeline.py|TransferPipeline.submit
W11_T01|追加token|microllm/engine/request.py|Sequence.append_token
W11_T02|同步结束状态|microllm/engine/request.py|Sequence.finish
W11_T03|追加连续KV|microllm/engine/kv_cache.py|ContinuousKVCache.append
W11_T04|释放序列KV|microllm/engine/kv_cache.py|ContinuousKVCache.release
W11_T05|流式生成|microllm/engine/engine.py|Engine.generate_stream
W12_T01|原子分配块|microllm/engine/block_manager.py|BlockManager.ensure_capacity
W12_T02|逻辑到物理槽位|microllm/engine/block_manager.py|BlockManager.slot_mapping
W12_T03|预留token容量|microllm/engine/paged_kv_cache.py|PagedKVCache.reserve
W12_T04|写入分页KV|microllm/engine/paged_kv_cache.py|PagedKVCache.write
W12_T05|分页Decode|kernels/microllm_ops.cu|paged_attention_decode_kernel
W13_T01|请求入队|microllm/engine/scheduler.py|Scheduler.add
W13_T02|Prefill调度|microllm/engine/scheduler.py|Scheduler._schedule_prefill
W13_T03|Decode调度|microllm/engine/scheduler.py|Scheduler._schedule_decode
W13_T04|在线引擎迭代|microllm/engine/async_engine.py|AsyncEngine.step
W14_T01|预热和三次测量|microllm/benchmarks/system_optimization.py|measure_three_runs
W14_T02|准入控制|microllm/benchmarks/system_optimization.py|admission_decision
W14_T03|重叠计划|microllm/benchmarks/system_optimization.py|estimate_overlap_plan
W15_T01|PD状态机|microllm/distributed/pd_runtime.py|PDRequestState.advance
W15_T02|KV传输计划|microllm/distributed/pd_runtime.py|KVTransferPlan.for_request
W15_T03|资源时间线|microllm/distributed/pd_simulator.py|PDRouter.schedule`;
const tasks=rows.split('\n').map(s=>{let[id,title,path,symbol]=s.split('|');return{id,title,week:Number(id.slice(1,3)),path:'intelligent-computing/lab-repo/'+path,symbol}});
const labs=[
['事件指标与统计口径','先列到达a、首token t₁、末token tₙ和完成f。TTFT=t₁−a；ITLᵢ=tᵢ−tᵢ₋₁；TPOT=(tₙ−t₁)/(n−1)，n=1为N/A而非0；E2E=f−a。完成事件不必与末token相同。',
'仓库窗口[0,2]秒：A到达0，tokens=[0.8,1.0,1.3]，完成1.4；B到达0.2，单token0.7，完成0.8；C到达0.5，token0.9，未完成。A的TTFT/TPOT/E2E为0.8/0.25/1.4；B为0.5/N/A/0.6。完成口径只计A+B：2请求、4token，得到1 request/s、2 output tokens/s。',
'先填worksheet，再运行check_trace。该脚本本次已实际运行，输出与手算一致；它只算事件日志，不运行GPU。现行Week01指导书明确无平台提交，旧课件中的服务运行示例不改写成额外必交。',
'python labs/week01/check_trace.py labs/week01/trace.json',
'错把单token TPOT填0、把未完成请求的部分token计入完成吞吐、由长TTFT直接断言GPU算力不足。留存观察、候选解释和所缺证据。'],
['两种Profiler不能混成一次实验','Systems用于阶段/CPU API/stream/kernel时间关系；Compute用于选中kernel的资源指标。先定计时边界，再读指标。API duration、排队时间与kernel duration不同。',
'本周Systems与Compute样例来自不同工作负载，应各建一行证据。Compute的flash_fwd_splitkv_kernel可见grid(8,4,1)、block128，但不能只凭启动形状断言occupancy。未给SOL/stall字段时写“资料未包含”。',
'W02_T01填写analysis-sheet.md，按事实→假设→缺失证据→下一步实验。报告accepted只证明接收，不是自动检查分析内容正确。个人测量与课程样例分开。',
'本周无代码pytest；使用 labs/week02/analysis-sheet.md 和指导书中的独立报告。',
'混用不同报告、从低DRAM吞吐直接判compute-bound、补造缺失指标、把收到报告当正确性证明。'],
['索引、边界与异步错误','i=blockIdx.x×blockDim.x+threadIdx.x；grid=ceil(n/block)负责覆盖，i<n负责防越界。SAXPY先核对接口中y是输入/原地输出还是独立out。',
'n=1000、block256、grid4，总1024线程；block3/thread231得到i999有效，下一线程i1000无效。分别验证最后有效与第一个无效位置。空输入需按launcher合同处理。',
'T01填vector_add_kernel；T02填launch；T03填SAXPY。只改对应TODO，保留签名和标记；本地测试导入实际工程模块，不直接读取下载模板。launch成功不代表异步执行无越界。',
'python -m pytest tests/week03 -q',
'网格向下取整、只保护写不保护读、空grid、无意改输入、CPU提交计时冒充GPU执行时间。'],
['Grid-stride与融合的正确性','线程负责i,i+G,i+2G…，G为整个grid的线程数。任意j按除法唯一分解成线程余数和迭代商。融合删除中间global写读，但需守住dtype和舍入顺序。',
'n1000、G256：线程0处理0/256/512/768；线程231最后999；232仅三项。FP32的z=ReLU(a×x+y)逻辑流量：两kernel约20n字节，融合约12n字节；不是实测DRAM或保证加速比。',
'T01替换grid-stride索引；T02用寄存器计算并一次写出。覆盖负/零/正值、尾部与低精度；扫block大小时固定输入、预热、计时。资源增加造成spill可能抵消收益。',
'python -m pytest tests/week04 -q',
'stride只用blockDim导致重复、忽略原地语义、低精度中间舍入改变、通过不同预热/工作量虚报优化。'],
['坐标→物理地址→Sector','A[r,c]的行主序偏移r×cols+c。列序读取：row=logical mod rows，col=floor(logical/rows)，读A[row,col]。转置将A[r,c]写B[c,r]，输出行长为rows。',
'2×3输入[1,2,3,4,5,6]按列读为[1,4,2,5,3,6]。32B sector模型中32个对齐FP32连续地址覆盖4个sector；步长8个float可能覆盖32个sector。Cache会过滤访问，因此不等于DRAM流量。',
'T01连续copy，T02列序read，T03二维transpose；x映射列、y映射行分别判界。先证每个输出唯一写入，再数warp地址。使用非方阵才能暴露rows/cols互换。',
'python -m pytest tests/week05 -q',
'把input cols与output rows混用、缺第二维检查、认为有效带宽超过HBM必测错（可能命中Cache）、把sector预测倍数当实测加速。'],
['数学定义、共享复用与真实接入','A[M,K]×B[K,N]=C[M,N]。A/B/C偏移分别rK+k、kN+c、rN+c。T×T块协同加载两tile，第一barrier等装载，第二barrier防下一轮覆盖。越界输出线程仍可能承担加载，不能提前return。',
'2×5乘5×3、T4有两轮：k0…3及k4+三个补0槽。课程矩阵输出[[8,7,6],[13,9,3]]。每轮acc保留，而越界shared槽必须重新写0。理想global请求约从2MNK降为2MNK/T，cache、同步与occupancy使实测比例不同。',
'T01naive、T02tiled、T03CourseLinear。输入[...,in]展平；weight[out,in]转置连续后gemm；加bias再还原。torch走F.linear；auto只对KernelUnavailable回退；cuda必须暴露异常。forward内动态导入方便测试记录真实调用。',
'python -m pytest tests/week06/test_matmul.py -q',
'B行长误用K、缺尾块补0、缺第二barrier、half直接累加、单独kernel通过但模型一直用F.linear。完整逐步讲义另见L06。'],
['线程→Warp→Block三级归约','每线程stride读一行的局部元素；warp shuffle合并；warp leader写shared；warp0再次归约。sum单位元0、max为−∞。无数据lane贡献单位元，但仍需遵守shuffle mask和参与线程约定。',
'一行35项配256线程，前35线程读有效值，余者持单位元。warp0合并32项，warp1合并3项，其余warp产单位元，随后归约8个warp结果。全负数据用max初值0会错。',
'T01warp_sum/max，T02rowsum，T03rowmax。跨warp读shared前同步；R0返回空，C0按接口拒绝。浮点树形相加与顺序相加不逐位等价，按规定容差验证。',
'python -m pytest tests/week07/test_reduction.py -q',
'只让有有效数据线程执行full-mask shuffle、错误单位元、漏同步、假定列数整除32、把舍入差异一律认定bug。'],
['稳定Softmax与RMSNorm','softmax先减行最大m：exp(x−m)/Σexp(x−m)，避免溢出。RMSNorm=x/sqrt(mean(x²)+eps)×weight，不减均值，eps在sqrt内部。存储低精度与float归约分开。',
'[1000,1001]直接exp可能∞/∞；减max后[-1,0]，概率约[0.26894,0.73106]。RMSNorm对[3,4]先平方[9,16]、均方12.5、加eps开根，再逐项除；不同于LayerNorm。',
'T01rowmax/expsum/normalize；T02平方归约、除列数、eps、rsqrt、权重；T03接入Qwen3RMSNorm。独立编译的microllm_ops.cu不能直接借用另一个编译单元的私有helper。核对CPU与CUDA cast次序。',
'python -m pytest tests/week08/test_numerical_kernels.py -q',
'eps放根号外、漏除列数、平方均值变成均值平方、half累加溢出、独立测试过却dispatch绕过目标函数。'],
['因果Mask与Online Softmax','Attention=softmax(QKᵀ/√d)V。prefill第q行只看t≤q；decode单query使用全部已缓存历史，不是只看当前token。在线算法维护m、l、o，新max出现时旧l/o都需乘exp(m_old−m_new)。',
'三个token的mask为下三角：query0只看0，query1看0/1，query2看0/1/2。逐个score更新m，再缩放已有l/o，再加新项，最后o/l；缺重新缩放就把不同指数尺度混在一起。',
'T01prefill dispatch，T02causal prefill，T03decode。核对shape/stride、1/√d、mask位置及共享状态barrier。严格cuda模式不能静默回退。',
'python -m pytest tests/week09/test_week09_attention.py -q',
'未来信息泄漏、完整softmax后才mask而不重归一化、忘缩放、decode误用KV长度1、精度类型不一致。'],
['三个不同的异步生命周期','compute等待transfer event/stream保证执行先后；device tensor.record_stream(compute)保证allocator生命周期；host槽复用前等旧H2D event防CPU过早覆盖DMA源。三者不能互相替代。',
'双槽0→1→0，第三次写槽0前只等待槽0上次传输，而非全局同步。示意CPU准备2ms/H2D3ms/计算4ms，两批流水可形成13ms而非串行18ms；这是依赖图例，不是测量结果。',
'T01区分CPU/CUDA目标及pinned/nonblocking；T02submit只接受CPU源，维护环形slot、event与ticket。不用cuda.synchronize掩盖全部依赖，也不把non_blocking参数当实际重叠证据。',
'python -m pytest tests/week10/test_transfer.py -q',
'host覆盖过早、compute未等待、显存提前复用、CPU路径调用CUDA、错误接受CUDA输入、依赖正确却未证明copy/compute重叠。'],
['请求状态和KV所有权','Request保存prompt/参数/编号；Sequence分开保存prompt和generated token，max_tokens只数后者。KV按(seq_id,layer_id)隔离，shape[1,kv_heads,tokens,head_dim]沿−2追加，首次clone防别名修改。',
'[1,2,3,4]接[1,2,2,4]应变[1,2,5,4]。先prefill采首token，追加并发token事件，再判断EOS/stop/长度；未结束才decode。产生两个token可能只调用一次decode。',
'先T01append/T02finish，再T03appendKV/T04release，最后T05generate_stream。finish同步两个status但不改finish_reason。prefill取得句柄后用try/finally覆盖所有yield；正常结束、异常、调用方close均释放最新句柄一次。',
'python -m pytest tests/week11 -q',
'prompt重复入generated、只改一个status、拼head_dim、缓存别名污染、只在正常return释放、EOS事件顺序错误。Mock通过不证明GPU服务。'],
['原子分配与分页寻址','token位置t→逻辑块floor(t/B)、块内offset=t mod B；物理块由序列block table取。分配前先确认全部所需块足够，失败不消耗部分free list。GQA以KVheads存储，不能按Qheads重复占用。',
'B4、block table=[5,2,9]：token6在逻辑块1、offset2，对应物理块2中的slot2。7token新增3token需共3块，原2块只补1块；不能只对新增3取ceil而忽略已有尾块。',
'T01ensure_capacity，T02slot_mapping，T03reserve，T04write，T05paged attention。先验证shape与容量再修改状态；decode按表读且屏蔽未写尾部。',
'python -m pytest tests/week12 -q -k "not w12_t05"\npython -m pytest tests/week12 -q',
'分配失败仍弹出部分块、逻辑块号误作物理号、tail未屏蔽、写错layer/head轴、释放其他序列资源。CPU管理与CUDA验证分开。'],
['连续批处理与预算','max_num_seqs与max_num_batched_tokens是两个不同预算。Chunked prefill用scheduled_start/end和prefill_offset记录切片与已完成进度。只有完整prefill后采首token，课程prefill优先策略不等于最优公平调度。',
'A先prefill，再发10；B到达后单独prefill，此轮A暂停；下一轮A发11、B发10。连续批处理允许旧请求未结束就接纳新请求，但prefill仍可能拉长旧请求ITL。',
'T01入队，T02完整/分块prefill遵守预算，T03按状态过滤并保持顺序，T04写回KV和offset、采样/发事件、完成释放。状态和模型输出需保持一致，不重复发首token。',
'python -m pytest tests/week13/test_continuous_batching.py -q',
'预算混用、offset过早前移、decode早于prefill、finish后仍占running/KV、把并发吞吐改善说成每用户时延都改善。'],
['测量、准入与重叠计划','性能比较固定模型、shape、dtype、到达流和计时范围。预热不计正式样本，按任务保留三次原始结果。准入数/拒绝数同样影响服务指标，不能通过少做工作伪造加速。',
'比较pinned/transfer stream开关，保持prompt/output长度与batch预算不变，记录3个样本、均值/中位数、完成数和TTFT/TPOT。若吞吐提升同时拒绝更多请求，必须报告完成率。',
'T01 warmup后三次测量，T02 admission，T03 overlap plan。先函数级/mock，再真实后端；时间计划仅证明依赖顺序，GPU并发与带宽要看实际timeline。',
'python -m pytest tests/week14 -q\npython -m microllm.benchmarks.system_optimization --pinned-memory --transfer-stream',
'只报最好一次、预热混样本、wall计时未同步、不同工作量比较、模拟计划冒充profiler实测。未测项填not_run。'],
['PD状态、字节数与共享链路','WAITING_PREFILL→PREFILLING→TRANSFERRING→DECODING→FINISHED，先检查合法阶段与有限非倒退时间，再修改history。KV bytes=2×layers×KVheads×head_dim×prompt_tokens×dtype_bytes。参数bandwidth_gbps在本题实际为GB/s。',
'2层、2KVheads、dim4、prompt3、BF16：192B；2GB/s传输9.6e−8s。各阶段start=max(依赖完成,资源空闲)。一prefill/一link/一decode的例子A完成3.5s、B完成4.5s；这是CPU确定性模拟，不是真实网络。',
'T01拒绝跳阶段/倒退且失败不改变状态；T02校验正带宽；T03按(arrival,request_id)处理、选最早空闲worker、更新唯一link，每请求3个资源事件。TRANSFERRING状态始于prefill完毕，链路start可更晚。AFD只作补充示例，传层激活，不能套PD KV公式。',
'python -m pytest tests/week15/test_pd_week15.py -q',
'用Qheads或生成token算KV、错乘8、NaN绕过校验、给每请求独立链路、round-robin代替最早空闲、复用已推进的状态对象。'],
['从模块通过到系统证据','把数值正确、真正接入、服务行为正确、性能可复现四种结论分开。Kernel通过不证明forward调用它；返回文本不证明EOS/取消/KV回收正确；吞吐高不证明SLO达标。',
'完整链路：tokenizer→scheduler→prefill→KV→sampling→decode→finished/release。逐边写实际实现与测试证据，汇合L06 dispatch、L11 early-close、L12 atomic、L13错峰请求、L14原始样本和L15模拟限制。',
'执行验收前列明TODO完成状态，不改测试掩盖错误。标记pass/fail/not_run/not_integrated/blocked；CPU/mock/CUDA分开。归档排除账号、token、权重、内部路径和其他学生代码。本周无独立W16代码任务ID。',
'python -m microllm.benchmarks.grader week16\npython -m pytest tests -q',
'没有原始样本、拿更短负载比较、未运行CUDA却标全通过、模拟PD冒充真实分布式实验。交付环境、数据流、集成表、故障复盘和限制。']
].map((a,i)=>({id:'L'+String(i+1).padStart(2,'0'),week:i+1,focus:a[0],concept:a[1],trace:a[2],implementation:a[3],commands:a[4],pitfalls:a[5]}));
if(tasks.length!==43||new Set(tasks.map(t=>t.id)).size!==43||labs.length!==16)throw Error('Lab coverage mismatch');
window.EDALabs={tasks,labs,validation:'Week01事件检查脚本已实际运行。其他CUDA、模型集成、课程平台和性能评测未在本次整理中运行；这些章节是教学伴读，不是已完成学生代码或已通过实验。',submission:'保留函数签名和TODO标记，只填写本题区域并上传完整模板；本地测试须同步到实际工程模块。开放代码与实验报告不能假称机器自动理解其正确性。'};
})();
