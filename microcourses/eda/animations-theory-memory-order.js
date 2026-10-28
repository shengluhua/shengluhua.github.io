/* New teaching model, not a hardware benchmark or a C++ implementation.
 * Reference: Sewell et al., x86-TSO, CACM 2010, §§1/3.1.
 * https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf
 * Restricted to ordinary aligned coherent WB loads/stores and MFENCE here;
 * no LOCK/RMW, mixed-size, devices or non-temporal accesses are modelled. */
(function(){'use strict';
const A=window.EDAAnimations,H=A.helpers,{esc,assert,table,svg,line,rect,text,note,player}=H;
function storeBuffer(v){
 const writes=Number(v.writes),first=Number(v.first),own=v.read==='own',fence=!!v.fence,policy=v.flush;
 assert([1,2].includes(writes)&&[0,1].includes(first),'写入数/读顺序无效');
 assert(['other','own'].includes(v.read)&&['none','p0','p1','both'].includes(policy),'调度选项无效');
 const mem={x:0,y:0},buffers=[[],[]],regs=[null,null],frames=[],events=[],flushed=[[],[]],names=['x','y'];let serial=0;
 function snap(kind,tid,message,more={}){const event={kind,tid,message,...more};events.push(event);frames.push({event,mem:{...mem},buffers:buffers.map(q=>q.map(w=>({...w}))),regs:regs.slice(),events:events.map(e=>({...e})),flushed:flushed.map(a=>a.slice())});}
 function enqueue(t,val){const w={addr:names[t],value:val,seq:serial++};buffers[t].push(w);snap('enqueue',t,'P'+t+'执行store '+w.addr+'='+val+'，追加到本核队尾；共享值尚未因这条指令改变。',{write:{...w}});}
 function drainOne(t){assert(buffers[t].length,'空队列不能排出');const w=buffers[t].shift();mem[w.addr]=w.value;flushed[t].push(w.seq);snap('flush',t,'P'+t+'只排出队首 '+w.addr+'='+w.value+'，更新一致性模型中的共享值；不是宣称已写到DRAM。',{write:{...w}});}
 function drain(t){while(buffers[t].length)drainOne(t);}
 function load(t){const addr=names[own?t:1-t],matches=buffers[t].filter(w=>w.addr===addr),latest=matches.at(-1),value=latest?latest.value:mem[addr];regs[t]=value;snap('load',t,'P'+t+'读取'+addr+'，r'+t+'='+value+'；'+(latest?'本核有同地址待写，从最新匹配项转发。':'本核无同地址待写，读取共享值，不能偷看另一核的队列。'),{addr,value,source:latest?'own-buffer':'shared',forwardSeq:latest?.seq??null});}
 snap('initial',null,'初始x=y=0，各核buffer为空。下方是可检查的事件顺序，不是按真实纳秒播放。');
 // Both hardware threads execute their stores in program order before the
 // selected load/propagation interleaving. Optional second writes expose FIFO.
 for(let val=1;val<=writes;val++){enqueue(0,val);enqueue(1,val);}
 for(const t of policy==='p0'?[0]:policy==='p1'?[1]:policy==='both'?[0,1]:[])drain(t);
 for(const t of [first,1-first]){
  if(fence){if(buffers[t].length)snap('fence-wait',t,'P'+t+'到MFENCE，本核先前store尚未全部排出，后续load不能越过它。');drain(t);snap('fence-pass',t,'P'+t+'的buffer已空，MFENCE可完成，才执行后面的load。');}
  load(t);
 }
 // Propagation eventually occurs, even if loads have already read old values.
 drain(0);drain(1);
 snap('finished',null,'所有待写都已按各核FIFO排出。r0/r1保留读取瞬间的结果；后来共享值变新，不会追溯修改已读寄存器。');
 return{frames,outcome:regs.slice(),writes,own,fence,policy,first,finalMemory:{...mem},flushed};
}
const inputs=[
 {key:'flush',label:'load前的排出调度',type:'select',value:'none',options:[['none','先都不排出（SB反例）'],['p0','先排出P0'],['p1','先排出P1'],['both','先排出双方']]},
 {key:'fence',label:'两核store后均加MFENCE',type:'checkbox',value:false},
 {key:'read',label:'load地址',type:'select',value:'other',options:[['other','读对方地址（SB）'],['own','读自身地址（转发对照）']]},
 {key:'writes',label:'每核同地址store次数',type:'select',value:1,options:[[1,'写1一次：原SB'],[2,'先写1再写2：FIFO变式']]},
 {key:'first',label:'先尝试load的核',type:'select',value:0,options:[[0,'P0'],[1,'P1']]}
];
function render(f,d){
 let drawing='';
 for(let t=0;t<2;t++){
  const x=12+t*320,hot=f.event.tid===t;
  drawing+=rect(x,12,296,48,'P'+t+'   r'+t+' = '+(f.regs[t]??'未读'),hot?'var(--anim-hot)':'var(--anim-soft)');
  drawing+=text(x+8,88,'FIFO：左为队首 → 右为队尾',14);
  if(!f.buffers[t].length)drawing+=rect(x+8,103,280,54,'空队列','var(--anim-soft)');
  else f.buffers[t].forEach((w,i)=>{const forwarded=f.event.kind==='load'&&f.event.tid===t&&f.event.forwardSeq===w.seq;drawing+=rect(x+8+i*144,103,136,54,w.addr+'='+w.value+(i===0?' [head]':''),forwarded?'var(--anim-good)':'var(--anim-soft)');if(forwarded)drawing+=line(x+76+i*144,103,x+148,60,'#157455',4);});
  drawing+=line(x+148,166,320,217,f.event.kind==='flush'&&hot?'#cc4545':'var(--anim-border)',f.event.kind==='flush'&&hot?5:2);
 }
 drawing+=rect(135,218,370,62,'共享值   x='+f.mem.x+'  y='+f.mem.y,'var(--anim-soft)');
 const code=t=>'P'+t+': W('+['x','y'][t]+',1)'+(d.writes===2?'; W('+['x','y'][t]+',2)':'')+(d.fence?'; MFENCE':'')+'; r'+t+'=R('+['x','y'][d.own?t:1-t]+')';
 const result=f.regs.every(x=>x!==null)?(f.regs.every(x=>x===0)?'当前两次读均为0：这是不同地址Store→Load放松的可达结果，不是丢失写入。':'当前读结果 ['+f.regs.join(', ')+']，取决于读取之前已经发生哪些排出。'):'继续逐步观察“入队”和“共享可见”之间的区别。';
 return '<div class="anim-code">'+esc(code(0)+'\n'+code(1))+'</div>'+svg(drawing,'两核独立FIFO写缓冲、同地址转发与共享值',640,300)+
 table(['事件','核','操作'],f.events.map((e,i)=>[i,e.tid===null?'—':'P'+e.tid,esc(e.message)]))+
 note('<b>'+esc(result)+'</b> '+esc(f.event.message))+
 note('本模型只展示所选的合法有限交错，不枚举完整x86。MFENCE等待本核先前写排出；不能让victim一类后续store越过更早flag写。改读自身地址时，优先取自己buffer里最新的同地址值；其他核不能直接读这个buffer。共享值是内存模型抽象，不等同DRAM。')+
 note('原SB每核仅写1；写1再写2是新增FIFO/转发变式。普通C++共享变量的数据竞争仍不合法，不能把这段伪码当C++锁实现。依据：<a href="https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf" target="_blank" rel="noopener">x86-TSO 原论文 §1、§3.1</a>。');
}
const tests=[
 {name:'无fence的原SB四种排出调度分别产生00/01/10/11',run:(m,a)=>{for(const [flush,expected]of [['none',[0,0]],['p0',[0,1]],['p1',[1,0]],['both',[1,1]]])a(JSON.stringify(m({writes:1,first:0,read:'other',fence:false,flush}).outcome)===JSON.stringify(expected),flush);}},
 {name:'所有参数交叉：fence排除双零，同地址读取最新写，FIFO只出队首',run:(m,a)=>{for(const writes of [1,2])for(const first of [0,1])for(const read of ['other','own'])for(const fence of [false,true])for(const flush of ['none','p0','p1','both']){const d=m({writes,first,read,fence,flush});a(d.finalMemory.x===writes&&d.finalMemory.y===writes);if(fence||read==='own')a(!d.outcome.every(x=>x===0));if(read==='own')a(d.outcome.every(x=>x===writes));for(let t=0;t<2;t++){a(d.flushed[t].length===writes);a(d.flushed[t].every((x,i,arr)=>i===0||x>arr[i-1]));}for(let i=1;i<d.frames.length;i++){const f=d.frames[i],prev=d.frames[i-1],e=f.event;if(e.kind==='flush')a(prev.buffers[e.tid][0].seq===e.write.seq);if(e.kind==='fence-pass')a(f.buffers[e.tid].length===0);if(e.kind==='load'){const ownWrites=prev.buffers[e.tid].filter(w=>w.addr===e.addr);a(e.value===(ownWrites.length?ownWrites.at(-1).value:prev.mem[e.addr]));}}}}},
 {name:'二次写的转发取2而非队首1，排出仍先1后2',run:(m,a)=>{const d=m({writes:2,first:0,read:'own',fence:false,flush:'none'});a(d.frames.filter(f=>f.event.kind==='load').every(f=>f.event.source==='own-buffer'&&f.event.value===2));a(d.frames.filter(f=>f.event.kind==='flush'&&f.event.tid===0).map(f=>f.mem.x).join(',')==='1,2');}}
];
A.register('tso-fifo-store-buffer-litmus',{unit:'T40',title:'真正的TSO写缓冲：双零、同地址转发与MFENCE',concept:'store先追加到本核FIFO；load匹配最新本核待写，否则读共享值；排出只取队首。改变排出顺序和屏障，观察SB双零何时允许、何时被排除。',source:'T40原课程SC互斥前提的新增内存模型扩展；Sewell等 x86-TSO (CACM 2010) §1/§3.1，非原PPT例题',model:storeBuffer,mount:host=>player(host,{inputs,compute:storeBuffer,render}),tests});
})();
