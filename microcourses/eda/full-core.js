/* Original teaching content; source examples are independently re-authored. */
(function(){'use strict';
const D=window.EDACourse,L=window.EDALabs,F=window.EDALessons;
if(!D||!L||!F)throw Error('Load curriculum, lab companions and existing lessons first');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(id,text)=>'<a class="unit-link" href="#lesson='+esc(id)+'">'+esc(text||id)+'</a>';
function single(prompt,options,answer,hint,explanation){return{type:'single',prompt,options,answer,hint,explanation}}
function numeric(prompt,answer,tolerance,unit,hint,explanation){return{type:'numeric',prompt,answer,tolerance,unit,hint,explanation}}
function multi(prompt,options,answer,hint,explanation){return{type:'multi',prompt,options,answer,hint,explanation}}
function open(prompt,hint,rubric,model_answer){return{type:'open',prompt,hint,rubric,model_answer}}
function labAppend(u){
 const b=L.labs.find(x=>x.id===u.id);if(!b)return '';
 const tasks=L.tasks.filter(t=>t.week===b.week);
 return '<h2>正式实验任务与源码入口</h2><p>任务ID、文件与符号沿用原课程，教学自测不替代正式提交，不改变原任务分值。</p>'+(tasks.length?'<div class="table-wrap"><table><thead><tr><th>任务</th><th>实现目标</th><th>文件 / 符号</th></tr></thead><tbody>'+tasks.map(t=>'<tr><td>'+esc(t.id)+'</td><td>'+esc(t.title)+'</td><td><code>'+esc(t.path.replace('intelligent-computing/lab-repo/',''))+'</code><br><code>'+esc(t.symbol)+'</code></td></tr>').join('')+'</tbody></table></div>':'<p>本周没有独立Wxx_Txx代码任务。按课程完成观察或综合验收，不编造额外必交任务。</p>')+
 '<h2>实现合同与已有伴读</h2><p>'+esc(b.implementation)+'</p><p>'+esc(b.trace)+'</p>'+
 '<h2>测试入口与证据边界</h2><pre><code>'+esc(b.commands)+'</code></pre><p>命令在学生实验仓库根目录执行。先确认实际模块已实现、依赖和设备可用，再保留完整输出。给出测试命令不表示本站已运行CUDA或通过课程平台评测；CPU、Mock和真实GPU结果分开记录。</p><p>'+esc(b.pitfalls)+'</p>'+
 '<h2>交付与可复现记录</h2><p>'+esc(L.submission)+'</p><p>记录输入形状、dtype、设备、软件版本、预热次数、同步边界、重复测量样本、基线、正确性误差和提交版本。区分not_run、blocked、fail、pass与not_integrated。单元正确、真实调用链与端到端收益是三个不同验收层。</p>';
}
function examAppend(u){if(u.track!=='exam')return '';return '<h2>原卷逐题定位与评分边界</h2><p>'+esc(D.scopeWarning)+'</p>'+D.exams.filter(q=>u.questions.includes(q.question)).map(q=>'<section class="panel"><h3>Q'+q.question+' · '+esc(q.topic)+' · 原卷 '+q.points+' 分</h3><details><summary>作答后展开原卷解题路线</summary><p>'+esc(q.walkthrough)+'</p><p><b>边界：</b>'+esc(q.boundary)+'</p></details><p>对应讲义：'+q.units.map(id=>link(id)).join(' ')+'；原卷物理第 '+q.page+' 页。原题图形仅在有权限的源材料中保留，网页题面与解释独立重写。</p></section>').join('')}
function exampleAppend(id){
 const rows=(window.EDAExamples||[]).filter(e=>e.unit===id);
 if(!rows.length)return '';
 return '<h2>原课件例题与新增练习路径</h2><p>以下每组均在本课末尾提供可保存的作答表单。原题保留参数、输入和约束；新增变式单独标注。先读题并独立推导，提交后才展示答案；等价布尔式和不同合法最短路径不要求逐字匹配。</p>'+rows.map(e=>'<section class="source-example-intro"><h3>'+esc(e.id)+' · '+esc(e.title)+'</h3><p>'+esc(e.stem)+'</p><p class="meta">'+(e.origin==='source'?'原材料例子':'新增练习')+' · '+esc(e.deck)+' · 物理页/张 '+(e.pages||[]).join('、')+' · <a href="#example='+encodeURIComponent(e.id)+'">打开互动题 →</a></p></section>').join('');
}
function lesson(id,lead,sections,questions,next){
 const u=D.units.find(x=>x.id===id);if(!u)throw Error('Unknown unit '+id);
 if(F[id])throw Error('Refusing to replace an existing lecture: '+id);
 if(!Array.isArray(sections)||sections.length<6)throw Error('Too few substantive sections: '+id);
 if(questions.length!==4)throw Error('Exactly four questions required: '+id);
 const qs=questions.map((q,i)=>({...q,id:'q'+(i+1),level:i+1,points:[15,20,25,40][i]}));
 for(const q of qs){
  if(!q.prompt||!q.hint)throw Error('Missing question text '+id);
  if(q.options){const a=Array.isArray(q.answer)?q.answer:[q.answer];if(!a.every(x=>Number.isInteger(x)&&x>=0&&x<q.options.length)||new Set(a).size!==a.length)throw Error('Invalid option answer '+id)}
  if(q.type==='numeric'&&(!Number.isFinite(q.answer)||!Number.isFinite(q.tolerance)||q.tolerance<0))throw Error('Invalid numeric '+id);
 }
 if(qs[3].type!=='open'||qs[3].rubric.length<3||!qs[3].model_answer)throw Error('Missing open rubric '+id);
 let body='<h1>'+esc(id)+' · '+esc(u.title)+'</h1><p class="lead">'+lead+'</p><p class="meta">材料驱动的系统课程，独立编号；不占用四门每日微课的日期和课号。</p>';
 body+=sections.map(([title,html])=>'<h2>'+title+'</h2>'+html).join('');
 body+=labAppend(u)+examAppend(u)+exampleAppend(id);
 body+='<h2>材料联系与先修回看</h2><p>先修：'+(u.prerequisites.length?u.prerequisites.map(p=>link(p)).join(' '):'无需本课程内先修单元。')+'</p><p>来源：'+u.sources.map(s=>'<code>'+esc(s.path.split('/').pop())+'</code>'+(s.pages?'，物理页/张 '+s.pages.join('–'):'，'+esc(s.section||'对应正文'))).join('；')+'。物理页序与印刷编号可能不同。公开页面只发布独立讲解、重绘示意和练习，不复制原始私有课件、个人作业或账户信息。</p>'+(u.exam_questions?.length?'<p>往年题关联：'+u.exam_questions.map(n=>'<a class="unit-link" href="#exam='+n+'">Q'+n+'</a>').join(' ')+'；这不是今年命题预测。</p>':'');
 body+='<h2>学习验收与下一步</h2><p>四级自测依次15、20、25、40分。前三题客观判分；开放题保留过程、评分要点和人工/自评结果，不把60分自动成绩伪装成完整总分。总分≥80继续，60–79补一例，低于60回看推导再练。所有参考答案需提交或主动展开后查看。</p>'+(next?'<p>下一单元：'+link(next)+'。先解释假设、公式和失败反例，再迁移方法。</p>':'<p>返回课程地图，核对理论、实现和实验观测；已读不等于实验已通过。</p>');
 if(body.length<3000)throw Error(id+' needs expanded explanation or source examples ('+body.length+')');
 F[id]={html:body,quiz:{version:1,lesson_id:id,questions:qs},sourceExampleIds:(window.EDAExamples||[]).filter(e=>e.unit===id).map(e=>e.id)};
 u.status='full_ready';D.stats.fullLessons=Object.keys(F).length;
}
window.EDABuilder={lesson,single,numeric,multi,open,esc,link};
})();
