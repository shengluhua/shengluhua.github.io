/* Original teaching content only. Private source documents are not copied here. */
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
 return '<h2>正式实验任务与源码入口</h2><p>下面的 ID、文件与符号沿用原课程，教学自测不替代正式提交，也不改变原任务分值。</p>'+(tasks.length?'<div class="table-wrap"><table><thead><tr><th>任务</th><th>实现目标</th><th>文件 / 符号</th></tr></thead><tbody>'+tasks.map(t=>'<tr><td>'+esc(t.id)+'</td><td>'+esc(t.title)+'</td><td><code>'+esc(t.path.replace('intelligent-computing/lab-repo/',''))+'</code><br><code>'+esc(t.symbol)+'</code></td></tr>').join('')+'</tbody></table></div>':'<p>本周没有独立 Wxx_Txx 代码任务。完成观察或综合验收即可，不编造额外必交任务。</p>')+
 '<h2>实现合同与已有伴读</h2><p>'+esc(b.implementation)+'</p><p>'+esc(b.trace)+'</p>'+
 '<h2>测试入口与证据边界</h2><pre><code>'+esc(b.commands)+'</code></pre><p>命令在学生实验仓库根目录执行。先确认实际模块已实现、依赖与设备可用，再保留完整输出。这里给出验证方法，不声称已经运行 CUDA 或通过课程平台评测；CPU、Mock 和真实 GPU 结果分开记录。</p><p>'+esc(b.pitfalls)+'</p>'+
 '<h2>交付与可复现记录</h2><p>'+esc(L.submission)+'</p><p>记录输入形状、dtype、设备、软件版本、预热次数、同步边界、重复测量样本、基线、正确性误差和提交版本。把 not_run、blocked、fail、pass 与 not_integrated 区分开；只有单元测试、真实调用链和端到端证据相互吻合，才支持“优化已接入”的结论。</p>';
}
function examAppend(u){if(u.track!=='exam')return '';return '<h2>原卷逐题定位与评分边界</h2><p>'+esc(D.scopeWarning)+'</p>'+D.exams.filter(q=>u.questions.includes(q.question)).map(q=>'<section class="panel"><h3>Q'+q.question+' · '+esc(q.topic)+' · 原卷 '+q.points+' 分</h3><p>'+esc(q.walkthrough)+'</p><p><b>边界：</b>'+esc(q.boundary)+'</p><p>对应讲义：'+q.units.map(id=>link(id)).join(' ')+'；原卷物理第 '+q.page+' 页。本站使用独立编写的解释，原图与完整题面请在有权限的原资料中核对。</p></section>').join('')}
function lesson(id,lead,sections,questions,next){
 const u=D.units.find(x=>x.id===id);if(!u)throw Error('Unknown unit '+id);
 if(F[id])throw Error('Refusing to replace an existing lecture: '+id);
 if(!Array.isArray(sections)||sections.length<6)throw Error('Too few substantive sections: '+id);
 if(questions.length!==4)throw Error('Exactly four questions required: '+id);
 const points=[15,20,25,40];
 const qs=questions.map((q,i)=>({...q,id:'q'+(i+1),level:i+1,points:points[i]}));
 for(const q of qs){if(!q.prompt||!q.hint)throw Error('Missing question text: '+id);if(q.options){const a=Array.isArray(q.answer)?q.answer:[q.answer];if(!a.every(x=>Number.isInteger(x)&&x>=0&&x<q.options.length)||new Set(a).size!==a.length)throw Error('Invalid answer '+id)}if(q.type==='numeric'&&(!Number.isFinite(q.answer)||!Number.isFinite(q.tolerance)||q.tolerance<0))throw Error('Invalid numeric '+id)}
 if(qs[3].type!=='open'||qs[3].rubric.length<3||!qs[3].model_answer)throw Error('Missing open rubric '+id);
 let body='<h1>'+esc(id)+' · '+esc(u.title)+'</h1><p class="lead">'+lead+'</p><p class="meta">按原课程材料组织的完整学习稿；本单元独立编号，不占用四门每日微课的日期和课号。</p>';
 body+=sections.map(([title,html])=>'<h2>'+title+'</h2>'+html).join('');
 body+=(window.EDAEnrichment?.[id]||'');
 body+=labAppend(u)+examAppend(u);
 body+='<h2>材料联系与先修回看</h2><p>先修：'+(u.prerequisites.length?u.prerequisites.map(p=>link(p)).join(' '):'无需本课程内先修单元。')+'</p><p>本节对应原材料：'+u.sources.map(s=>'<code>'+esc(s.path.split('/').pop())+'</code>'+(s.pages?'，物理页 / 张 '+s.pages.join('–'):'，'+esc(s.section||'对应正文'))).join('；')+'。页码按物理顺序计；完整路径在文末保留。讲解、示例和自测是独立编写的教学材料，不是原始课件的公开镜像。</p>'+(u.exam_questions?.length?'<p>往年题关联：'+u.exam_questions.map(n=>'<a class="unit-link" href="#exam='+n+'">Q'+n+'</a>').join(' ')+'。这是本卷知识映射，不是今年命题预测。</p>':'');
 body+='<h2>学习验收与下一步</h2><p>先在不看解析时完成下面四题：概念辨析15分、数值或执行过程20分、机制边界25分、综合推导或设计40分。客观计算使用有限数值或结构检查；综合题中的计算与开放解释可拆开计分。需要论证的部分依评分步骤人工或自评，自动上限按实际题型显示，不把未评的人工分算入总成绩。总分≥80继续，60–79补一例，低于60回看推导后再练。所有参考答案只在提交或主动展开后显示。</p>'+(next?'<p>下一单元：'+link(next)+'。先能复述本讲的假设、关键等式和一个失败反例，再把结论迁移到下一种模型。</p>':'<p>完成后返回课程地图，把理论、代码与实验观测相互核对；“已读”不是“实验已通过”。</p>');
 if(body.length<3000)throw Error(id+' needs a substantive lecture, not an outline ('+body.length+')');
 F[id]={html:body,quiz:{version:1,lesson_id:id,questions:qs}};u.status='full_ready';
 D.stats.fullLessons=Object.keys(F).length;
}
window.EDABuilder={lesson,single,numeric,multi,open,esc,link};
})();
