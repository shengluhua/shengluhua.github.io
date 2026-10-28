/* Grids are independently transcribed from source figures; no private slide images. */
(function(){'use strict';
const large=['....##....##..###','....##....##.....','........####.....','........####.....','##...............','##...............','....##...........','....#####.#......','......####.......','..##.......##....','..##.......##....','.###.......##....','...........##..##','.................','.##.....##.....##','.##.....##.....##'];
const early=large.slice();early[8]='...#..####.......';
const detour=['.......','...#...','...#...','...###.','...#...','...#...','.......'];
const soukup=detour.slice();soukup[1]='..##...';
const grids={
 R032:{rows:['...','#..','#..'],start:[0,0],target:[2,2],optimal_length:4,source_pages:[32]},
 R033:{rows:early,start:[2,2],target:[13,11],optimal_length:22,source_pages:[33]},
 R034:{rows:['....','...#','#...','....'],start:[0,0],target:[3,3],optimal_length:6,source_pages:[34,35,36,40,41]},
 R037:{rows:large,start:[5,8],target:[13,11],optimal_length:13,source_pages:[37,46,47]},
 R043:{rows:detour,start:[2,1],target:[4,5],optimal_length:10,source_pages:[43,44]},
 R045:{rows:soukup,start:[2,1],target:[4,5],optimal_length:10,source_pages:[45,50]},
 R049:{rows:['....','#...','....','....'],start:[0,0],target:[0,3],other_targets:[[2,2]],optimal_length:3,source_pages:[49]},
 R049B:{rows:['....','#...','....','....'],sources:[[0,0],[0,1],[0,2],[0,3]],start:[0,2],target:[2,2],optimal_length:2,source_pages:[49]},
 R050L:{rows:soukup,start:[2,1],target:[6,5],optimal_length:8,source_pages:[50]},
 R059:{rows:['#######..','#######..','.........','.###.###.','.###.###.','.........','.........'],nets:[{id:'a',start:[0,7],target:[2,3]},{id:'b',start:[2,7],target:[5,7]}],source_pages:[59]}
};
const dirs=[[-1,0],[0,1],[1,0],[0,-1]],key=p=>p.join(','),same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function search(spec,mode='bfs'){
 const g=typeof spec==='string'?grids[spec]:spec;if(!g||!g.target)throw Error('Unknown point-to-point grid');
 const R=g.rows.length,C=g.rows[0].length,target=g.target,sources=g.sources||[g.start];
 const valid=p=>p[0]>=0&&p[0]<R&&p[1]>=0&&p[1]<C&&g.rows[p[0]][p[1]]!=='#';
 if(!sources.every(valid)||!valid(target))throw Error('Blocked or out-of-range endpoint');
 const h=p=>Math.abs(p[0]-target[0])+Math.abs(p[1]-target[1]);
 const dist=new Map(),parents=new Map(),closed=new Set(),front=[],trace=[];let serial=0,maxFrontier=0;
 function push(p,cost){front.push({p,cost,serial:serial++,priority:mode==='astar'?cost+h(p):cost,secondary:mode==='astar'?h(p):0});maxFrontier=Math.max(maxFrontier,front.length)}
 sources.forEach(p=>{if(!dist.has(key(p))){dist.set(key(p),0);push(p,0)}});
 while(front.length){
  if(mode!=='bfs')front.sort((a,b)=>a.priority-b.priority||a.secondary-b.secondary||a.serial-b.serial);
  const item=front.shift(),u=item.p,k=key(u);if(closed.has(k)||dist.get(k)!==item.cost)continue;
  closed.add(k);const step={expanded:u.slice(),cost:item.cost,newly_discovered:[],improved:[],target:same(u,target)};
  if(same(u,target)){trace.push(step);break;}
  for(const [dr,dc]of dirs){const v=[u[0]+dr,u[1]+dc],vk=key(v);if(!valid(v)||closed.has(vk))continue;
   const weight=mode==='hadlock'?(h(v)>h(u)?1:0):1,nc=item.cost+weight;
   if(nc<(dist.get(vk)??Infinity)){
    const fresh=!dist.has(vk);dist.set(vk,nc);parents.set(vk,u.slice());push(v,nc);
    (fresh?step.newly_discovered:step.improved).push({cell:v.slice(),cost:nc,parent:u.slice()});
   }
  }
  trace.push(step);
 }
 const found=closed.has(key(target));let path=[];
 if(found){let p=target.slice();path=[p];let guard=0;while(parents.has(key(p))){p=parents.get(key(p));path.push(p.slice());if(++guard>R*C)throw Error('Parent cycle')}path.reverse();}
 return{mode,found,path,length:found?path.length-1:null,cost:found?dist.get(key(target)):null,expanded:closed.size,discovered:dist.size,max_frontier:maxFrontier,trace,labels:Object.fromEntries(dist),convention:'行列零基；邻居上右下左；入队发现；目标有效出队停止；计数含源和目标。Hadlock按(detour,入队序)；A*按(f,h,入队序)。'};
}
function validatePath(gridId,path,options={}){
 const g=typeof gridId==='string'?grids[gridId]:gridId;if(!g)return{valid:false,message:'网格不存在'};
 if(!Array.isArray(path)||!path.length)return{valid:false,message:'尚未绘制路径'};
 const starts=options.sources||g.sources||[options.start||g.start],target=options.target||g.target;
 if(!starts.some(s=>s&&same(s,path[0])))return{valid:false,message:'路径必须从指定源点或源集合开始'};
 const seen=new Set();
 for(let i=0;i<path.length;i++){
  const p=path[i];if(!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[0]<0||p[0]>=g.rows.length||p[1]<0||p[1]>=g.rows[0].length)return{valid:false,message:'路径包含无效坐标'};
  if(g.rows[p[0]][p[1]]==='#')return{valid:false,message:'路径进入障碍格('+p+')'};
  if(i&&Math.abs(p[0]-path[i-1][0])+Math.abs(p[1]-path[i-1][1])!==1)return{valid:false,message:'连续两格必须上下左右相邻'};
  if(seen.has(key(p)))return{valid:false,message:'路径含重复格或回路；请用撤销后重新绘制'};seen.add(key(p));
 }
 if(!same(path[path.length-1],target))return{valid:false,message:'路径尚未到达目标'};
 const length=path.length-1,optimal=options.optimal_length??g.optimal_length;
 if(options.require_optimal!==false&&Number.isFinite(optimal)&&length!==optimal)return{valid:false,feasible:true,length,message:'路径可行，长度'+length+'，但还不是要求的最短路径'};
 return{valid:true,feasible:true,length,message:'路径合法'+(Number.isFinite(optimal)&&length===optimal?'且达到最短长度':'')+'：'+length+'条边'};
}
window.EDAGrids=grids;window.EDARouting={search,validatePath,dirs};
for(const [id,g]of Object.entries(grids)){if(g.target&&search(g,'bfs').length!==g.optimal_length)throw Error('Grid reference mismatch '+id);}
})();
