/* Guided, touch-friendly visual explanations; self-contained SVG and inputs. */
(function(){
"use strict";
const defs={
 roofline:{title:"Roofline：两条时间下界",params:[["F","运算量 GFLOP",80,20,160,10],["Q","DRAM 流量 GB",16,2,32,2],["P","计算吞吐 GFLOP/s",1000,200,2000,100],["B","带宽 GB/s",100,25,200,25]],steps(v){
 let a=1000*v.F/v.P,b=1000*v.Q/v.B,I=v.F/v.Q;
 return ["固定工作量 F="+v.F+" GFLOP、Q="+v.Q+" GB。先不判断瓶颈。",
 "算术强度 I=F/Q="+I.toFixed(2)+" FLOP/Byte，它衡量每搬运一个字节做多少计算。",
 "计算下界 T计算=F/P="+a.toFixed(2)+" ms。","带宽下界 T访存=Q/B="+b.toFixed(2)+" ms。",
 "两个约束必须同时成立：T≥max("+a.toFixed(2)+","+b.toFixed(2)+")="+Math.max(a,b).toFixed(2)+" ms。下界不是实测预测。"];
 },draw(v){let a=1000*v.F/v.P,b=1000*v.Q/v.B,m=Math.max(1,a,b);return bars([["计算",a],["DRAM",b]],m)}},
 little:{title:"Little 定律：并发槽位和带宽",params:[["H","在途请求数 H",16,4,64,4],["s","每请求字节数",64,32,128,32],["W","平均延迟 ns",100,20,200,20],["B","通道 GB/s",80,10,160,10]],steps(v){let x=v.H*v.s/v.W;return [
 "假定有 H="+v.H+" 个在途槽位，每个请求占用槽位至完成。",
 "Little 定律 N=λW，在途 N≤H，因此每秒完成请求数 λ≤H/W。",
 "每请求传输 "+v.s+" Byte，因此带宽≤Hs/W="+x.toFixed(2)+" GB/s。",
 "通道另有上限 "+v.B+" GB/s，两者同时成立。",
 "有效带宽上界为 min("+x.toFixed(2)+","+v.B+")="+Math.min(x,v.B).toFixed(2)+" GB/s。槽位容量不等于软件真的填满。"];},draw(v){let x=v.H*v.s/v.W;return bars([["MLP",x],["通道",v.B]],Math.max(1,x,v.B))}},
 vc:{title:"VC 维：移动阈值，看可实现标记",params:[["t","阈值 t",1.5,0,4,.5]],steps(v){let a=[1,2,3].map(x=>x>=v.t?1:0).join("");return [
 "固定三个点 x₁=1、x₂=2、x₃=3。分类器 hₜ(x)=1[x≥t]。",
 "阈值 t="+v.t+"，逐点比较 x≥t，输出标签 "+a+"。",
 "连续移动 t，只会依次产生 000、001、011、111 四种标签组合。",
 "两个递增点不可能实现 (1,0)：它同时要求 t≤x₁ 与 t>x₂。",
 "任意两个点都不能打散，但单个点能打散，因此这个单向阈值类的 VC 维为 1。"];},draw(v){return '<svg viewBox="0 0 400 115" role="img" aria-label="三个样本的阈值分类标记"><line x1="30" y1="52" x2="370" y2="52" stroke="#b5c2d3" stroke-width="2"/>'+[1,2,3].map((x,i)=>{let cx=70+i*125,yes=x>=v.t;return '<circle cx="'+cx+'" cy="52" r="21" fill="'+(yes?'#188f80':'#8798b7')+'"/><text x="'+cx+'" y="57" text-anchor="middle" fill="#fff" font-size="17">'+(yes?1:0)+'</text><text x="'+cx+'" y="93" fill="currentColor" text-anchor="middle" font-size="13">x='+x+'</text>'}).join('')+'</svg>'}},
 select:{title:"Quickselect：分区的每一步",params:[],steps(){return [
 "输入 [9,1,6,3,8,2,7]，要找第 4 小，选最后的 7 为枢轴。",
 "扫描 9，9>7，保留在右侧。已扫描的≤7前缀仍为空。",
 "扫描 1、6，依次交换至前缀：[1,6,9,3,8,2,7]。",
 "扫描 3、8、2：[1,6,3,2,8,9,7]；其中 8>7 不加入前缀。",
 "枢轴归位得 [1,6,3,2,7,9,8]，7 为第 5 小。第 4 小只需去左侧找。"];},draw(v,i){const arrays=[[9,1,6,3,8,2,7],[9,1,6,3,8,2,7],[1,6,9,3,8,2,7],[1,6,3,2,8,9,7],[1,6,3,2,7,9,8]];return '<svg viewBox="0 0 446 92" role="img" aria-label="数组分区状态">'+arrays[i].map((x,k)=>'<rect x="'+(k*63+3)+'" y="10" width="55" height="58" rx="7" fill="'+(x===7?'#d78535':i===4&&k<4?'#188f80':'#4b73c9')+'"/><text x="'+(k*63+30)+'" y="45" text-anchor="middle" fill="#fff" font-size="20">'+x+'</text>').join('')+'</svg>'}},
 projection:{title:"凸集投影：把不可行点投到三角形",params:[],steps(){return [
 "最小化 ‖x−z‖²/2，z=(0.8,0.7)，约束 x≥0、y≥0、x+y≤1。",
 "z₁+z₂=1.5>1，所以 z 不在三角形内。",
 "猜测最近点在斜边。沿法向 (1,1) 减去共同的 τ。",
 "(0.8−τ)+(0.7−τ)=1，解得 τ=0.25，候选 p=(0.55,0.45)。",
 "p 的两坐标非负且满足边界；投影最优性 (z−p)ᵀ(y−p)≤0 可验证它是唯一投影。"];},draw(v,i){let X=x=>35+215*x,Y=y=>225-190*y;return '<svg viewBox="0 0 320 247" role="img" aria-label="三角形可行域与不可行点的投影"><polygon points="'+[[0,0],[1,0],[0,1]].map(a=>X(a[0])+","+Y(a[1])).join(" ")+'" fill="#7d9fe1" fill-opacity=".2" stroke="#547ecb" stroke-width="2"/><path d="M'+X(.8)+' '+Y(.7)+' L'+X(.55)+' '+Y(.45)+'" stroke="#d8873a" stroke-width="2" stroke-dasharray="5 4"/><circle cx="'+X(.8)+'" cy="'+Y(.7)+'" r="7" fill="#d8873a"/><text x="'+(X(.8)+9)+'" y="'+(Y(.7)-9)+'" fill="currentColor">z</text><circle cx="'+X(i>=3?.55:.8)+'" cy="'+Y(i>=3?.45:.7)+'" r="7" fill="#188f80"/><text x="'+(X(.55)+6)+'" y="'+(Y(.45)-8)+'" fill="currentColor">p</text><text x="12" y="241" fill="currentColor" font-size="12">x≥0, y≥0, x+y≤1</text></svg>'}}
};
function bars(list,max){return '<svg viewBox="0 0 440 130" role="img" aria-label="两个资源时间或带宽上限的条形图">'+list.map((a,i)=>'<text x="6" y="'+(29+58*i)+'" fill="currentColor" font-size="13">'+a[0]+'</text><rect x="95" y="'+(11+58*i)+'" width="'+(Math.max(2,a[1]/max*325))+'" height="32" rx="6" fill="'+(i?'#16958a':'#4d73ce')+'"/><text x="104" y="'+(32+58*i)+'" fill="#fff" font-size="13">'+a[1].toFixed(2)+'</text>').join('')+'</svg>'}
function mount(el){let type=el.dataset.viz,g=defs[type];if(!g)return;let values={},step=0;g.params.forEach(p=>values[p[0]]=p[2]);el.classList.add('viz-card');el.innerHTML='<div class="viz-kicker">交互推演 · 可逐步查看</div><h3>'+g.title+'</h3><div class="viz-fields">'+g.params.map(p=>'<label class="viz-field"><span>'+p[1]+'：<b data-display="'+p[0]+'">'+p[2]+'</b></span><input type="range" aria-label="'+p[1]+'" data-key="'+p[0]+'" value="'+p[2]+'" min="'+p[3]+'" max="'+p[4]+'" step="'+p[5]+'"></label>').join('')+'</div><div class="viz-picture"></div><p class="viz-caption" aria-live="polite"></p><div class="viz-controls"><button type="button" data-prev>← 上一步</button><span data-counter></span><button type="button" data-next>下一步 →</button></div>';let picture=el.querySelector('.viz-picture'),caption=el.querySelector('.viz-caption'),counter=el.querySelector('[data-counter]'),prev=el.querySelector('[data-prev]'),next=el.querySelector('[data-next]');function draw(){let t=g.steps(values);step=Math.max(0,Math.min(t.length-1,step));picture.innerHTML=g.draw(values,step);caption.textContent=t[step];counter.textContent=(step+1)+' / '+t.length;prev.disabled=step===0;next.disabled=step===t.length-1}el.addEventListener('input',e=>{if(!e.target.dataset.key)return;values[e.target.dataset.key]=Number(e.target.value);el.querySelector('[data-display="'+e.target.dataset.key+'"]').textContent=e.target.value;draw()});el.addEventListener('click',e=>{if(e.target.closest('[data-prev]'))step--;if(e.target.closest('[data-next]'))step++;draw()});draw()}
window.LearningViz={types:Object.keys(defs),mountAll(root){(root||document).querySelectorAll('[data-viz]').forEach(mount)}};
})();
