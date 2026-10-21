/* Small, dependency-free, fully accessible SVG concept animations. No external image assets. */
(function(){
'use strict';
const BLUE='#567dd9', GREEN='#18a38c', PURPLE='#8b72da', GOLD='#d89a52', INK='#405671', LIGHT='#dbe4f2';
const specs={
  amdahl:{title:'局部加速如何影响全局时间？',steps:6},
  pipeline:{title:'五级流水线：不同指令并行占用不同阶段',steps:9},
  array:{title:'动态数组：扩容不等于每次都复制',steps:10},
  recursion:{title:'递归树：每层工作量如何累加？',steps:5},
  convex:{title:'切线是凸函数的全局下界',steps:8},
  gradient:{title:'梯度下降：不同方向的收敛速度',steps:7},
  softmax:{title:'Softmax + 交叉熵怎样调整预测？',steps:7}
};
const rect=(x,y,w,h,fill,r=5,stroke='none')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const line=(x1,y1,x2,y2,color=LIGHT,width=1,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?'stroke-dasharray="'+dash+'"':''}/>`;
const txt=(x,y,t,size=13,color=INK,anchor='start',weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${t}</text>`;
const round=n=>Number(n).toFixed(2);
function amdahl(s){
 const ratios=[1,1.5,2,3,5,10],k=ratios[s],p=.4,optimized=p/k,remaining=.6+optimized,speed=1/remaining;
 let svg=txt(20,27,'原始执行时间',14,INK)+txt(20,114,'优化后执行时间',14,INK);
 svg+=rect(20,38,620*.6,43,BLUE,8)+rect(20+620*.6,38,620*.4,43,GOLD,8);
 svg+=rect(20,124,620*.6,43,BLUE,8)+rect(20+620*.6,124,620*optimized,43,GOLD,8);
 svg+=txt(205,65,'无法加速 60%',14,'#fff','middle',600)+txt(515,65,'可加速 40%',14,'#fff','middle',600);
 svg+=txt(205,151,'0.60 T',14,'#fff','middle',600)+txt(405+620*optimized/2,151,(optimized).toFixed(2)+' T',12,'#fff','middle',600);
 svg+=line(20,184,640,184,LIGHT)+txt(20,208,'局部加速：'+k+'×',13,BLUE)+txt(640,208,'整体加速：'+round(speed)+'×',15,GREEN,'end',700);
 return {svg,caption:`固定 40% 的原始时间可被加速 ${k} 倍，另外 60% 不变。新总时间 = 0.6T + 0.4T/${k}，整体加速为 ${round(speed)} 倍。`};
}
function pipeline(s){
 let svg=txt(20,23,'执行阶段',12,INK);for(let c=0;c<9;c++)svg+=txt(145+c*57,23,'C'+(c+1),11,INK,'middle');
 const stages=['IF','ID','EX','MEM','WB'],fills=['#4978d6','#1a9b92','#8e76d0','#db9b55','#64748b'];
 for(let r=0;r<5;r++){
  const y=45+r*41;svg+=txt(18,y+21,stages[r],12,INK,'start',600);
  for(let c=0;c<9;c++){
   const x=116+c*57,k=c-r+1;let fill='#edf2f8';if(k>=1&&k<=5)fill=(c===s?fills[r]:fills[r]+'bb');
   svg+=rect(x,y,52,32,fill,6);
   if(k>=1&&k<=5)svg+=txt(x+26,y+21,'I'+k,12,'#fff','middle',600);
  }
 }
 svg+=`<rect x="${116+s*57}" y="36" width="52" height="215" rx="8" fill="none" stroke="${BLUE}" stroke-width="2.2"/>`;
 return {svg,caption:`当前高亮第 ${s+1} 个时钟周期。同一个周期，不同指令同时位于 IF / ID / EX / MEM / WB 阶段。流水线提高的是稳定吞吐率，不是单条指令的延迟。`};
}
function array(s){
 const n=s,capacity=n<=1?1:Math.pow(2,Math.ceil(Math.log2(n))),copied=(n>1&&(n-1&(n-2))===0)?n-1:0;
 const cellW=34,st=24;
 let svg=txt(24,30,'逻辑元素 n = '+n,14,INK)+txt(620,30,'物理容量 C = '+capacity,14,BLUE,'end',600);
 svg+=txt(24,68,'分配空间',11,INK);
 for(let i=0;i<16;i++){
  const x=24+i*38;let fill=i>=capacity?'#f4f6fa':i<n?(i===n-1?GREEN:BLUE):'#e2e9f4';
  svg+=rect(x,79,34,49,fill,5,i<capacity?'#c5d2e7':'none');
  if(i<n)svg+=txt(x+17,108,String(i+1),12,'#fff','middle',600);
 }
 svg+=rect(24,160,616,49,'#edf2f8',7)+txt(42,190, n===0?'从空数组开始':copied?`第 ${n} 次插入：先复制 ${copied} 个元素，再写入 1 个新元素。`:`第 ${n} 次插入：容量足够，只需写入 1 个元素。`,13,INK);
 return {svg,caption:`第 ${n} 次操作结束时：n=${n}, C=${capacity}。${copied?'本次触发扩容，复制成本较高；但下一次扩容要等许多次普通插入。':'当前未触发复制。'} 连续插入的复制数量形成几何级数，所以总成本为 O(m)。`};
}
function recursion(s){
 let svg=txt(28,24,'T(n) = 2T(n/2) + n（设 n=16）',13,INK);
 const lengths=[1,2,4,8,16];
 for(let lev=0;lev<5;lev++){
  const y=40+lev*40,count=lengths[lev],gap=3,span=560/count;
  svg+=txt(24,y+20,'L'+lev,12,INK);
  for(let j=0;j<count;j++){
   const x=68+j*span,w=Math.max(3,span-gap);
   svg+=rect(x,y,w,30,lev===s?(lev===4?GREEN:BLUE):'#cfdbeb',4);
  }
  svg+=txt(648,y+19,'16',12,lev===s?GREEN:INK,'end',lev===s?700:400);
 }
 return {svg,caption:`第 ${s} 层有 ${lengths[s]} 个子问题，每个规模 ${16/lengths[s]}。第 ${s} 层总工作量始终为 ${lengths[s]} × ${16/lengths[s]} = 16；5 层合计 80。`};
}
function convex(s){
 const v=[-1.45,-1.05,-.65,-.25,.2,.6,1.05,1.45][s],sx=x=>352+x*110,sy=y=>218-y*37;
 let path='';for(let x=-2;x<=2.01;x+=.045){const xx=sx(x),yy=sy(x*x);path+=(path?'L':'M')+xx.toFixed(1)+' '+yy.toFixed(1)+' '}
 let svg=line(30,218,680,218,'#b5c3d8',1.3)+line(352,28,352,234,'#b5c3d8',1.3);
 svg+=`<path d="${path}" fill="none" stroke="${BLUE}" stroke-width="3.6" stroke-linecap="round"/>`;
 const tangent=x=>2*v*x-v*v;
 svg+=line(sx(-2),sy(tangent(-2)),sx(2),sy(tangent(2)),GOLD,2.8,'7 5');
 svg+=`<circle cx="${sx(v)}" cy="${sy(v*v)}" r="7" fill="${GREEN}" stroke="#fff" stroke-width="2"/>`;
 svg+=txt(28,27,'f(x)=x²',14,BLUE)+txt(670,27,`切点 x = ${round(v)}`,13,GREEN,'end',600);
 return {svg,caption:`取切点 a=${round(v)}：f'(a)=2a，切线为 ℓ(x)=2ax−a²。对任意 x，x²−ℓ(x)=(x−a)²≥0，因此切线始终在凸函数下方。`};
}
function gradient(s){
 const pts=[[4,2],[3,0],[2.25,0],[1.6875,0],[1.2656,0],[.9492,0],[.7119,0]],sx=x=>354+x*52,sy=y=>143-y*43;
 let svg=line(36,143,667,143,'#bfcee1')+line(354,20,354,232,'#bfcee1');
 for(let f of [1,3,6,12,20,30]){const rad=Math.sqrt(2*f);svg+=`<ellipse cx="354" cy="143" rx="${rad*52}" ry="${rad*43/2}" fill="none" stroke="#ccd7e8" stroke-width="1.2"/>`}
 const traj=pts.slice(0,s+1).map(p=>`${sx(p[0])},${sy(p[1])}`).join(' ');
 svg+=`<polyline points="${traj}" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
 pts.slice(0,s+1).forEach((p,i)=>{svg+=`<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="${i===s?7:4}" fill="${i===s?GREEN:GOLD}" stroke="#fff" stroke-width="1.8"/>`});
 svg+=txt(28,26,'f(x,y)=½(x²+4y²)',14,BLUE)+txt(665,26,'η = 1/4',13,INK,'end');
 const x=pts[s][0],y=pts[s][1],f=.5*(x*x+4*y*y);
 return {svg,caption:`第 ${s} 步：x=${round(x)}，y=${round(y)}，函数值 ${round(f)}。曲率大的 y 方向第一步归零；x 方向每次只乘以 3/4。`};
}
function softmax(s){
 let logits=[Math.log(2),0,Math.log(3)],eta=.7;
 for(let k=0;k<s;k++){let ex=logits.map(Math.exp),tot=ex.reduce((a,b)=>a+b,0),ps=ex.map(v=>v/tot);logits=logits.map((z,i)=>z-eta*(ps[i]-(i===1?1:0)))}
 let e=logits.map(Math.exp),tot=e.reduce((a,b)=>a+b,0),probs=e.map(v=>v/tot),labels=['类别 1','类别 2 · 真实','类别 3'];
 let svg=txt(22,26,'三分类概率分布',14,INK);
 for(let i=0;i<3;i++){
 const y=56+i*56;svg+=txt(23,y+15,labels[i],12,i===1?GREEN:INK);
 svg+=rect(178,y,416,26,'#e8eef6',6);
 svg+=rect(178,y,416*probs[i],26,i===1?GREEN:BLUE,6);
 svg+=txt(661,y+18,(100*probs[i]).toFixed(1)+'%',13,INK,'end',600);
 }
 svg+=txt(23,245,'真实类别：2　｜　损失 -log(p₂) = '+(-Math.log(probs[1])).toFixed(3),13,INK);
 return {svg,caption:`每步用 η=0.7 的梯度更新 Logit：∂CE/∂zᵢ=pᵢ−1[i=2]。真实类别概率由 ${(100*probs[1]).toFixed(1)}% 表示；注意更新会同时改变全部类别的归一化概率。`};
}
const painters={amdahl,pipeline,array,recursion,convex,gradient,softmax};
function mountOne(el){
 const type=el.getAttribute('data-diagram'),spec=specs[type];if(!spec)return;
 let step=0,playing=!window.matchMedia('(prefers-reduced-motion: reduce)').matches,timer=null;
 el.className='diagram';
 el.innerHTML=`<div class="diagram-top"><div><div class="diagram-eyebrow">INTERACTIVE CONCEPT DIAGRAM</div><h3>${spec.title}</h3></div><span class="diagram-progress" aria-live="off">步骤 <span class="frame-no">1</span> / ${spec.steps}</span></div><div class="diagram-scene" role="img" aria-label="${spec.title}"><svg viewBox="0 0 690 270" aria-hidden="true" preserveAspectRatio="xMidYMid meet"></svg></div><p class="diagram-caption" aria-live="polite"></p><div class="diagram-controls"><button type="button" class="play-btn">${playing?'暂停动画':'播放动画'}</button><button type="button" class="next-btn">下一步 →</button><button type="button" class="reset-btn">↺ 重置</button></div>`;
 const svg=el.querySelector('svg'),cap=el.querySelector('.diagram-caption');
 function draw(){const result=painters[type](step);svg.innerHTML=result.svg;cap.textContent=result.caption;el.querySelector('.frame-no').textContent=step+1}
 function tick(){step=(step+1)%spec.steps;draw()}
 function stop(){playing=false;if(timer)clearInterval(timer);timer=null;el.querySelector('.play-btn').textContent='播放动画'}
 function start(){stop();playing=true;el.querySelector('.play-btn').textContent='暂停动画';timer=setInterval(tick,1750)}
 el.querySelector('.play-btn').addEventListener('click',()=>playing?stop():start());
 el.querySelector('.next-btn').addEventListener('click',()=>{stop();tick()});
 el.querySelector('.reset-btn').addEventListener('click',()=>{stop();step=0;draw()});
 draw();if(playing)start();return stop;
}
let cleanups=[];
window.ConceptDiagrams={mountAll(root){cleanups.forEach(f=>f());cleanups=[];(root||document).querySelectorAll('[data-diagram]').forEach(el=>{const cleanup=mountOne(el);if(cleanup)cleanups.push(cleanup)})},stopAll(){cleanups.forEach(f=>f());cleanups=[]},types:Object.keys(specs)};
})();
