/* Practice items are newly authored checks, not quotations of historical exam questions.
   Keys: ID|question|choice 0;choice 1;choice 2;choice 3|zero_based_answer|stepwise_explanation */
(function(){'use strict';
const bank={};
function ingest(rows){
 rows.trim().split('\n').forEach(line=>{
  const p=line.split('|');if(p.length!==5)throw Error('Invalid practice row: '+line.slice(0,90));
  const [id,prompt,opts,a,explanation]=p,options=opts.split(';'),answer=Number(a);
  if(bank[id]||options.length!==4||!Number.isInteger(answer)||answer<0||answer>3||!explanation.trim())throw Error('Invalid practice '+id);
  bank[id]={id,type:'single',points:10,prompt,options,answer,explanation};
 });
}
window.EDAPractice={bank,ingest};
})();