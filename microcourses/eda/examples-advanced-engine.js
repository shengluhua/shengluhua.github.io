(function(){'use strict';
const G=window.EDAGrader;if(!G)throw Error('Load base grader first');
const base=G.grade,validate=G.validateQuestion;
function parse(v){if(typeof v==='string')return JSON.parse(v);return v}
function evaluateIP(q,choice){
 if(!Array.isArray(choice)||choice.length!==q.candidates.length)return{valid:false,message:'每张网都必须选择一个候选。'};
 const usage=q.edges.map(()=>0);let cost=0;
 for(let i=0;i<choice.length;i++){
  if(choice[i]===''||choice[i]===null||choice[i]===undefined)return{valid:false,message:'第'+(i+1)+'张网尚未选择。'};
  const k=Number(choice[i]);if(!Number.isInteger(k)||!q.candidates[i][k])return{valid:false,message:'候选编号无效。'};
  const c=q.candidates[i][k];cost+=c.cost;
  for(const edge of new Set(c.edges)){const j=q.edges.indexOf(edge);if(j<0)throw Error('候选包含未知资源');usage[j]++}
 }
 const violations=usage.map((v,i)=>v>q.capacities[i]?q.edges[i]+': '+v+'>'+q.capacities[i]:null).filter(Boolean);
 return{valid:!violations.length,usage,cost,violations,message:violations.length?'容量超限：'+violations.join('；'):'容量可行，当前总成本 '+cost+'。'};
}
function optimalIP(q){
 let best=Infinity,choices=[];function walk(a){if(a.length===q.candidates.length){const r=evaluateIP(q,a);if(r.valid){if(r.cost<best){best=r.cost;choices=[a.slice()]}else if(r.cost===best)choices.push(a.slice())}return}
  if(choices.length>10000)throw Error('候选组合过大');for(let k=0;k<q.candidates[a.length].length;k++)walk([...a,k]);
 }walk([]);return{cost:best,choices};
}
G.grade=function(q,value){
 if(!['multiroute','ip-routing'].includes(q.type))return base(q,value);
 const r={type:q.type,max:q.points,points:0,correct:false,pending:false};
 try{
  const v=parse(value);
  if(q.type==='ip-routing'){
   const x=evaluateIP(q,v);Object.assign(r,x);r.correct=x.valid&&(!Number.isFinite(q.optimal_cost)||Math.abs(x.cost-q.optimal_cost)<=1e-9);
   r.message=x.message+(x.valid&&!r.correct?' 尚未达到题目要求的最小成本。':'');
  }else{
   const grid=window.EDAGrids[q.grid];if(!grid||!Array.isArray(grid.nets))throw Error('多网格定义缺失');
   const occupied=new Map(),lengths={};
   for(const net of grid.nets){
    const route=v?.[net.id];
    const x=window.EDARouting.validatePath(grid,route,{start:net.start,target:net.target,require_optimal:false});
    if(!x.valid)return{...r,message:'网'+net.id+'：'+x.message};
    for(const p of route){const key=p.join(',');if(occupied.has(key))return{...r,message:'网'+net.id+'与网'+occupied.get(key)+'共享格('+key+')，违反互斥约束。'};occupied.set(key,net.id)}
    lengths[net.id]=x.length;
   }
   r.correct=true;r.lengths=lengths;r.message='全部网端点连通、路径合法且互不占用相同格。长度：'+Object.entries(lengths).map(([id,n])=>id+'='+n).join('，')+'。此题只要求联合可行，不以参考折线形状判分。';
  }
  if(r.correct)r.points=q.points;return r;
 }catch(e){return{...r,message:'输入无法检查：'+e.message}}
};
G.validateQuestion=function(q){validate(q);if(q.type==='ip-routing'){if(q.edges.length!==q.capacities.length)throw Error('容量定义错误');const opt=optimalIP(q);if(Number.isFinite(q.optimal_cost)&&opt.cost!==q.optimal_cost)throw Error('参考最优值与枚举不一致')}if(q.type==='multiroute'&&!window.EDAGrids[q.grid]?.nets)throw Error('多网定义错误');return true};
G.evaluateIP=evaluateIP;G.optimalIP=optimalIP;
})();
