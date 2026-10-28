/* Deterministic grading only. No eval/Function, network service, or proof-by-keyword. */
(function(global){'use strict';
const MAX_EXPRESSION=4096, MAX_NODES=512, MAX_VARIABLES=12;
const aliases={'!':'not','~':'not','¬':'not','&':'and','&&':'and','*':'and','∧':'and','|':'or','||':'or','+':'or','∨':'or','^':'xor','⊕':'xor',not:'not',and:'and',or:'or',xor:'xor'};
function parseExpression(input,variables,options={}){
 if(typeof input!=='string'||!input.trim())throw Error('请先填写布尔表达式。');
 if(input.length>MAX_EXPRESSION)throw Error('表达式过长；请使用不超过4096个字符的等价式。');
 if(!Array.isArray(variables)||variables.length>MAX_VARIABLES||new Set(variables).size!==variables.length)throw Error('题目变量配置无效。');
 const allowed=new Set(variables),tokens=[];let p=0,nodes=0;
 while(p<input.length){const ch=input[p];if(/\s/u.test(ch)){p++;continue;}
  if(ch==='('||ch===')'){tokens.push({type:ch,pos:p++});continue;}
  if(aliases[ch]){let op=ch;if((ch==='&'||ch==='|')&&input[p+1]===ch)op+=ch;tokens.push({type:aliases[op],pos:p});p+=op.length;continue;}
  const name=input.slice(p).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(name){if(!allowed.has(name[0]))throw Error('未允许的变量“'+name[0]+'”；本题变量：'+(variables.join('、')||'无，只可用0/1')+'。');tokens.push({type:'var',value:name[0],pos:p});p+=name[0].length;continue;}
  if(ch==='0'||ch==='1'){tokens.push({type:'const',value:Number(ch),pos:p++});continue;}
  throw Error('第'+(p+1)+'个字符不能识别。请使用变量、0/1、!、&、|、^和括号；不支持代码或隐式乘法。');
 }
 let at=0;const operators=new Set();
 function make(node){if(++nodes>MAX_NODES)throw Error('表达式节点过多，请简化后重试。');return node}
 function atom(depth){if(depth>64)throw Error('括号或取反嵌套过深。');const t=tokens[at++];if(!t)throw Error('表达式不完整。');
  if(t.type==='not'){operators.add('not');return make({op:'not',arg:atom(depth+1)})}
  if(t.type==='('){const v=binary(0,depth+1);if(tokens[at]?.type!==')')throw Error('缺少右括号。');at++;return v;}
  if(t.type==='var'||t.type==='const')return make({op:t.type,value:t.value});
  throw Error('第'+(t.pos+1)+'个字符前缺少操作数。');
 }
 const levels=[['or'],['xor'],['and']];
 function binary(level,depth){if(level===levels.length)return atom(depth);let a=binary(level+1,depth);while(tokens[at]&&levels[level].includes(tokens[at].type)){const op=tokens[at++].type;operators.add(op);a=make({op,left:a,right:binary(level+1,depth)});}return a;}
 const ast=binary(0,0);if(at!==tokens.length)throw Error('第'+(tokens[at].pos+1)+'个字符前缺少运算符，或有多余括号。乘法请显式写&。');
 if(options.allowedOperators){const permit=new Set(options.allowedOperators.map(o=>aliases[o]||o));for(const op of operators)if(!permit.has(op))throw Error('本题不允许'+({or:'OR（| / +）',xor:'XOR（^）',and:'AND（&）',not:'NOT（!）'}[op]||op)+'；不能用功能等价绕过运算符限制。');}
 return{ast,operators:[...operators],variables:variables.slice(),nodes};
}
function evaluateExpression(parsed,assignment){const walk=n=>{switch(n.op){case'const':return n.value;case'var':if(assignment[n.value]!==0&&assignment[n.value]!==1)throw Error('缺少二值变量 '+n.value);return assignment[n.value];case'not':return 1-walk(n.arg);case'and':return walk(n.left)&walk(n.right);case'or':return walk(n.left)|walk(n.right);case'xor':return walk(n.left)^walk(n.right);default:throw Error('非法表达式节点')}};return walk(parsed.ast||parsed)}
function finiteNumber(raw){if(typeof raw==='number')return Number.isFinite(raw)?raw:null;if(typeof raw!=='string'||!raw.trim())return null;const s=raw.trim();if(!/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null}
function isBlank(a){return a===undefined||a===null||a===''||(typeof a==='string'&&!a.trim())||(Array.isArray(a)&&(!a.length||a.every(isBlank)));}
function base(q,status,message,extra={}){return{status,correct:status==='correct',attempted:status!=='blank',awarded:status==='correct'?q.points:status==='manual'?null:0,max:q.points,message,...extra}}
function invalid(q,message,extra){return base(q,'invalid',message,extra)}
function eqNumber(a,b,t=0){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(0,Number(t)||0)+Number.EPSILON*Math.max(Math.abs(a),Math.abs(b))*4}
function expressionGrade(q,answer){let actual,target;try{actual=parseExpression(answer,q.variables,{allowedOperators:q.allowedOperators});target=parseExpression(q.answer,q.variables);}catch(e){return invalid(q,e.message)}
 const count=2**q.variables.length;for(let mask=0;mask<count;mask++){const a={};q.variables.forEach((v,i)=>a[v]=(mask>>(q.variables.length-i-1))&1);const got=evaluateExpression(actual,a),expected=evaluateExpression(target,a);if(got!==expected)return base(q,'incorrect','发现反例：'+(q.variables.length?q.variables.map(v=>v+'='+a[v]).join('，'):'常量表达式')+' 时，你的输出 '+got+'，目标输出 '+expected+'。',{counterexample:{assignment:a,actual:got,expected},checkedRows:mask+1});}
 return base(q,'correct','全部 '+count+' 行真值一致'+(q.allowedOperators?'，且满足运算符限制':'')+'。',{checkedRows:count,operators:actual.operators});}
function routing(){if(!global.EDARouting||!global.EDAGrids)throw Error('路由模型未加载，不能批改路径。');return global.EDARouting}
function pathGrade(q,answer){try{const r=routing().validatePath(q.grid,answer,{optimal_length:q.optimal_length,require_optimal:q.require_optimal!==false});return base(q,r.valid?'correct':'incorrect',r.message,{pathResult:r});}catch(e){return invalid(q,e.message)}}
function multirouteGrade(q,answer){try{const g=global.EDAGrids?.[q.grid];if(!g?.nets)throw Error('多网配置不存在。');const paths=answer&&typeof answer==='object'?answer:{};const results=[],occupied=new Map();
  for(const net of g.nets){const path=paths[net.id];if(isBlank(path))return base(q,'blank','请为每张网都绘制路径。');const r=routing().validatePath(g,path,{start:net.start,target:net.target,require_optimal:false});results.push({net:net.id,...r});if(!r.valid)return base(q,'incorrect',net.id+' 网：'+r.message,{paths:results});
   for(const p of path){const key=p.join(',');if(occupied.has(key))return base(q,'incorrect','网 '+net.id+' 与网 '+occupied.get(key)+' 共享格 ('+key+')，联合方案不可行。',{paths:results});occupied.set(key,net.id);
    if(g.nets.some(n=>n.id!==net.id&&[n.start,n.target].some(t=>t[0]===p[0]&&t[1]===p[1])))return base(q,'incorrect','网 '+net.id+' 穿过了另一网的端点。',{paths:results});}
  }return base(q,'correct','所有网均连通且合法，无共享格或其他网端点占用。',{paths:results,totalLength:results.reduce((s,r)=>s+r.length,0)});
 }catch(e){return invalid(q,e.message)}}
function routingSelection(q,answer){if(!Array.isArray(answer)||answer.length!==q.candidates.length||answer.some(isBlank))return base(q,'blank','请为每张网选择一个候选。');const loads=Array(q.edges.length).fill(0);let cost=0;for(let k=0;k<answer.length;k++){const a=finiteNumber(answer[k]);if(!Number.isInteger(a)||a<0||a>=q.candidates[k].length)return invalid(q,'候选编号无效。');const c=q.candidates[k][a];cost+=c.cost;for(const e of c.edges){const index=q.edges.indexOf(e);if(index<0)return invalid(q,'题目含未定义边。');loads[index]++;}}
 const overflow=loads.map((v,i)=>Math.max(0,v-q.capacities[i]));if(overflow.some(Boolean))return base(q,'incorrect','超过容量：'+q.edges.map((e,i)=>e+' '+loads[i]+'/'+q.capacities[i]).join('，')+'。',{loads,cost,overflow});
 const ok=eqNumber(cost,q.optimal_cost,q.tolerance);return base(q,ok?'correct':'incorrect',ok?'容量全部满足，总成本 '+cost+' 达到最优；接受任意等价最优组合。':'组合容量可行，总成本 '+cost+'，但还可降低。',{loads,cost,overflow,feasible:true});}
function rubric(q){const raw=(q.rubric||[]).map(text=>({text,points:Number((text.match(/[（(](\d+(?:\.\d+)?)(?:\s*分)?[）)]\s*$/)||[])[1])}));const exact=raw.length>0&&raw.every(r=>Number.isFinite(r.points))&&eqNumber(raw.reduce((s,r)=>s+r.points,0),q.points);return raw.map((r,i)=>({...r,points:exact?r.points:q.points/raw.length,scheme:exact?'题目给定分项':'自评均分建议，非官方评分细则'}));}
function grade(q,answer){if(!q||!Number.isFinite(q.points)||q.points<0)return{status:'invalid',correct:false,attempted:false,awarded:0,max:0,message:'题目评分配置无效。'};
 if(isBlank(answer))return base(q,'blank','尚未作答；空答不计分，也不显示参考答案。');
 switch(q.type){
  case'numeric':{const n=finiteNumber(answer);if(n===null)return invalid(q,'请输入有限十进制数或科学计数法；不接受空串、NaN、Infinity或代码。');const ok=eqNumber(n,q.answer,q.tolerance);return base(q,ok?'correct':'incorrect',ok?'数值符合容差。':'数值不符；请检查公式、单位和精度。',{actual:n,expected:q.answer,tolerance:q.tolerance||0});}
  case'vector':{if(!Array.isArray(answer)||answer.length!==q.answer.length)return invalid(q,'请按指定顺序填写全部 '+q.answer.length+' 项。');const items=answer.map((a,i)=>({label:q.labels?.[i]??String(i+1),actual:finiteNumber(a),expected:q.answer[i],blank:isBlank(a)}));if(items.some(x=>x.blank))return base(q,'blank','仍有未填写项；各项全填后再检查。',{items});if(items.some(x=>x.actual===null))return invalid(q,'每项都必须是有限十进制数。',{items});items.forEach(x=>x.correct=eqNumber(x.actual,x.expected,q.tolerance));const ok=items.every(x=>x.correct);return base(q,ok?'correct':'incorrect',ok?'所有分量均正确。':items.filter(x=>x.correct).length+'/'+items.length+' 项正确；本小题要求全部正确才得分。',{items});}
  case'single':{const n=finiteNumber(Array.isArray(answer)?answer.length===1?answer[0]:null:answer);if(!Number.isInteger(n)||n<0||n>=q.options.length)return invalid(q,'请选择一个有效选项。');return base(q,n===q.answer?'correct':'incorrect',n===q.answer?'选项正确。':'选项不正确。',{selected:n});}
  case'multi':{if(!Array.isArray(answer))return invalid(q,'请使用多选框作答。');const a=answer.map(finiteNumber);if(a.some(n=>!Number.isInteger(n)||n<0||n>=q.options.length)||new Set(a).size!==a.length)return invalid(q,'多选答案含无效或重复选项。');const ok=a.length===q.answer.length&&q.answer.every(v=>a.includes(v));return base(q,ok?'correct':'incorrect',ok?'全部应选项与不应选项均判断正确。':'多选未完全正确；本小题要求集合完全一致。',{selected:a});}
  case'expression':return expressionGrade(q,answer);
  case'path':return pathGrade(q,answer);
  case'multiroute':return multirouteGrade(q,answer);
  case'ip-routing':return routingSelection(q,answer);
  case'open':if(typeof answer!=='string')return invalid(q,'请提交文本推导或设计说明。');return base(q,'manual','已保存作答。机器未判断证明或设计是否正确；请按评分项人工评阅。',{rubric:rubric(q)});
  default:return invalid(q,'此题型尚未支持，不能自动评分：'+q.type);
 }
}
function gradeExample(example,answers={}){const results=example.questions.map(q=>({id:q.id,...grade(q,answers[q.id])}));const objectiveMax=example.questions.filter(q=>q.type!=='open').reduce((s,q)=>s+q.points,0),manualMax=example.questions.filter(q=>q.type==='open').reduce((s,q)=>s+q.points,0);return{results,objectiveScore:results.reduce((s,r)=>s+(Number(r.awarded)||0),0),objectiveMax,manualMax,allAttempted:results.every(r=>r.attempted),unanswered:results.filter(r=>r.status==='blank').map(r=>r.id)};}
global.EDAExampleEngine={version:1,parseExpression,evaluateExpression,finiteNumber,eqNumber,grade,gradeExample,rubric};
})(typeof window!=='undefined'?window:globalThis);
