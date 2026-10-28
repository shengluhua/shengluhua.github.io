(function(){'use strict';
const registry=window.EDAExamples=window.EDAExamples||[];
function num(prompt,answer,points=100,hint='先写出公式并检查单位。',explanation='',unit='',tolerance=0){return{type:'numeric',prompt,answer,points,hint,explanation,unit,tolerance}}
function vec(prompt,labels,answer,points=100,hint='按题目指定顺序逐项计算。',explanation='',tolerance=0){return{type:'vector',prompt,labels,answer,points,hint,explanation,tolerance}}
function expr(prompt,variables,answer,points=100,hint='可用!表示NOT，&或*表示AND，|或+表示OR，^表示XOR；乘法请显式写出。',explanation=''){return{type:'expression',prompt,variables,answer,points,hint,explanation}}
function single(prompt,options,answer,points=100,hint='逐项检查必要条件和反例。',explanation=''){return{type:'single',prompt,options,answer,points,hint,explanation}}
function multi(prompt,options,answer,points=100,hint='逐项独立判断；可能有多个正确项。',explanation=''){return{type:'multi',prompt,options,answer,points,hint,explanation}}
function open(prompt,points=100,hint='写清假设、中间步骤和验证方法。',rubric=[],model_answer=''){return{type:'open',prompt,points,hint,rubric,model_answer}}
function add(id,unit,deck,pages,title,stem,questions,solution,origin='source'){
 if(registry.some(x=>x.id===id))throw Error('Duplicate example '+id);
 if(!window.EDACourse.units.some(u=>u.id===unit))throw Error('Unknown unit '+unit);
 const qs=questions.map((q,i)=>({...q,id:q.id||'q'+(i+1)}));
 if(qs.reduce((s,q)=>s+q.points,0)!==100)throw Error('Example points must total 100: '+id);
 for(const q of qs){if(!q.prompt||!q.hint)throw Error('Missing question text: '+id);if(q.type==='open'&&(!q.rubric.length||!q.model_answer))throw Error('Missing manual rubric: '+id);if(q.type==='vector'&&q.labels.length!==q.answer.length)throw Error('Vector mismatch '+id);}
 registry.push({id,unit,origin,deck,pages,title,stem,questions:qs,solution,source_note:origin==='source'?'原课件例子保留函数、数值与条件；文字、图表和交互提问独立重写。':'新增变式 / 推导练习，不冒充原课件原题。'});
}
window.EDAExampleTools={add,num,vec,expr,single,multi,open};
})();
