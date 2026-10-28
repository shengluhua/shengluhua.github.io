/* Pure grading logic. No eval, Function, network calls, or automatic grading of open proofs. */
(function(){'use strict';
function number(value){
 const s=String(value??'').trim();if(!s)return null;
 const fraction=s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i);
 const v=fraction?Number(fraction[1])/Number(fraction[2]):Number(s);
 return Number.isFinite(v)?v:null;
}
function compile(text,variables){
 const s=String(text??'').trim().replace(/[¬~]/g,'!').replace(/∧/g,'&').replace(/∨/g,'|').replace(/⊕/g,'^');
 if(!s||s.length>3000)throw Error('表达式为空或过长');
 const tokens=[];let p=0;
 while(p<s.length){
  if(/\s/.test(s[p])){p++;continue}
  const id=s.slice(p).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if(id){if(!variables.includes(id[0]))throw Error('未知变量 '+id[0]+'；允许：'+variables.join(', '));tokens.push(id[0]);p+=id[0].length;continue}
  if('01!&*|+^()'.includes(s[p])){tokens.push(s[p++]);continue}
  throw Error('不支持的符号 '+s[p]+'；只接受二值变量、0/1、!、&、|、^和括号');
 }
 let i=0,depth=0;
 function atom(){
  if(++depth>80)throw Error('括号或取反嵌套过深');
  let node,t=tokens[i++];
  if(t==='!')node=['not',atom()];
  else if(t==='('){node=or();if(tokens[i++]!==')')throw Error('缺少右括号')}
  else if(t==='0'||t==='1')node=['const',Number(t)];
  else if(variables.includes(t))node=['var',t];
  else throw Error('此处需要变量、常量或括号');
  depth--;return node;
 }
 function and(){let n=atom();while(tokens[i]==='&'||tokens[i]==='*'){i++;n=['and',n,atom()]}return n}
 function xor(){let n=and();while(tokens[i]==='^'){i++;n=['xor',n,and()]}return n}
 function or(){let n=xor();while(tokens[i]==='|'||tokens[i]==='+'){i++;n=['or',n,xor()]}return n}
 const tree=or();if(i!==tokens.length)throw Error('多余输入；AND乘法需要显式写&或*');
 function evaluate(node,env){switch(node[0]){case'const':return node[1];case'var':return env[node[1]];case'not':return 1-evaluate(node[1],env);case'and':return evaluate(node[1],env)&evaluate(node[2],env);case'or':return evaluate(node[1],env)|evaluate(node[2],env);case'xor':return evaluate(node[1],env)^evaluate(node[2],env);default:throw Error('无效语法树')}}
 return env=>evaluate(tree,env);
}
function equivalence(student,reference,variables){
 if(!Array.isArray(variables)||variables.length>16||new Set(variables).size!==variables.length)throw Error('变量定义无效');
 const a=compile(student,variables),b=compile(reference,variables);
 for(let row=0;row<2**variables.length;row++){
  const env={};variables.forEach((v,j)=>env[v]=(row>>(variables.length-j-1))&1);
  const got=a(env),expected=b(env);if(got!==expected)return{correct:false,counterexample:env,got,expected,rows:row+1};
 }
 return{correct:true,rows:2**variables.length};
}
function grade(q,value){
 const max=Number(q.points)||0,result={type:q.type,points:0,max,correct:false,pending:false};
 if(q.type==='open')return{...result,pending:true,message:'开放题已保存，需按评分细则人工评阅；未自动给分。'};
 try{
  if(q.type==='numeric'){
   const x=number(value);if(x===null)return{...result,message:'请填写有效数值；空白不当作0。支持小数、科学计数法和a/b。'};
   const tol=Number(q.tolerance??0);result.correct=Number.isFinite(q.answer)&&Math.abs(x-q.answer)<=tol;
   result.message=result.correct?'数值正确。':'数值未通过；请核对公式、单位和绝对误差范围。';
  }else if(q.type==='vector'){
   const v=Array.isArray(value)?value:[];
   if(v.length!==q.answer.length)return{...result,message:'分量数量不符。'};
   const parsed=v.map(number);if(parsed.some(x=>x===null))return{...result,message:'请填写每个分量；空白不当作0。'};
   result.badIndices=parsed.map((x,j)=>Math.abs(x-q.answer[j])<=Number(q.tolerance??0)?-1:j).filter(j=>j>=0);
   result.correct=!result.badIndices.length;result.message=result.correct?'全部分量正确。':'未通过的分量：'+result.badIndices.map(i=>q.labels[i]||String(i+1)).join('、')+'。本小题采用全对得分。';
  }else if(q.type==='single'||q.type==='multi'){
   const arr=Array.isArray(value)?value:(value===''||value===null||value===undefined?[]:[value]);
   const got=arr.map(Number),expected=Array.isArray(q.answer)?q.answer:[q.answer];
   result.correct=got.length===expected.length&&new Set(got).size===got.length&&expected.every(x=>got.includes(x));
   result.message=result.correct?'选项正确。':got.length?'选项未完全正确；多选按全对得分。':'尚未选择答案。';
  }else if(q.type==='expression'){
   const e=equivalence(value,q.answer,q.variables||[]);Object.assign(result,e);
   result.message=e.correct?'在全部 '+e.rows+' 组输入上等价，接受此写法。':'找到反例：'+Object.entries(e.counterexample).map(([k,v])=>k+'='+v).join(', ')+'；你的输出='+e.got+'，目标输出='+e.expected+'。';
  }else if(q.type==='path'){
   let route=value;if(typeof route==='string'){try{route=JSON.parse(route)}catch(e){return{...result,message:'路径坐标不是合法JSON。'}}}
   if(!window.EDARouting)throw Error('路径检查器未加载');
   const r=window.EDARouting.validatePath(q.grid,route,{optimal_length:q.optimal_length,require_optimal:q.require_optimal!==false,start:q.start,target:q.target,sources:q.sources});
   result.correct=r.valid;result.message=r.message;result.length=r.length;
  }else return{...result,message:'尚未支持的客观题类型，保留待人工检查：'+q.type,pending:true};
  if(result.correct)result.points=max;
  return result;
 }catch(error){return{...result,message:'输入无法检查：'+error.message};}
}
function validateQuestion(q){
 if(!q||typeof q.prompt!=='string'||!Number.isFinite(q.points)||q.points<0)throw Error('题面或分值无效');
 if(q.type==='open'){if(!Array.isArray(q.rubric)||!q.rubric.length||!q.model_answer)throw Error('开放题缺少评分要点');return true}
 if(['single','multi'].includes(q.type)){if(!Array.isArray(q.options))throw Error('选项缺失');const a=Array.isArray(q.answer)?q.answer:[q.answer];if(a.some(x=>!Number.isInteger(x)||x<0||x>=q.options.length)||new Set(a).size!==a.length)throw Error('选项答案无效')}
 if(q.type==='numeric'&&(!Number.isFinite(q.answer)||Number(q.tolerance??0)<0))throw Error('数值答案无效');
 if(q.type==='vector'&&(!Array.isArray(q.answer)||q.answer.length!==q.labels.length||q.answer.some(x=>!Number.isFinite(x))))throw Error('向量答案无效');
 if(q.type==='expression')compile(q.answer,q.variables||[]);
 if(q.type==='path'&&!window.EDAGrids?.[q.grid])throw Error('路径题网格缺失 '+q.grid);
 return true;
}
window.EDAGrader={number,compile,equivalence,grade,validateQuestion};
})();
