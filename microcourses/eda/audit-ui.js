/* Public evidence metadata only: no private source document bodies. */
(function(){'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function row(a){return '<tr>'+a.map(x=>'<td>'+x+'</td>').join('')+'</tr>'}
function table(head,rows){return '<div class="table-wrap"><table><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'}
function render(query=''){
 const D=window.EDACourse,F=window.EDALessons,E=window.EDAExamples,A=window.EDAAnimations.registry,source=E.filter(e=>e.origin==='source'),extra=E.filter(e=>e.origin!=='source'),allq=E.flatMap(e=>e.questions),auto=allq.filter(q=>q.type!=='open'),manual=allq.filter(q=>q.type==='open');
 const filter=x=>!query||JSON.stringify(x).toLowerCase().includes(query),link=(id,t=id)=>'<a href="#lesson='+esc(id)+'">'+esc(t)+'</a>';
 const builtins={T03:'MUX分支选择 / 两余因子数值跟踪',L06:'GEMM单输出点积 / 行列地址与tile尾项'};
 const modelTests=window.EDAAnimations.test();
 const decks=Object.entries(D.decks).map(([k,[p,n]])=>{let ex=source.filter(e=>e.deck===k||e.deck===p);return row([esc(k+' · '+p.split('/').pop()),n,ex.length,ex.reduce((s,e)=>s+e.questions.length,0),D.units.filter(u=>u.sources.some(s=>s.path===p)).map(u=>link(u.id)).join(' ')])});
 const units=D.units.filter(filter).map(u=>{const l=F[u.id],es=E.filter(e=>e.unit===u.id),models=A.filter(a=>a.unit===u.id);const chars=l?l.html.replace(/<[^>]+>/g,'').length:0;return row([link(u.id,u.id+' '+u.title),l?'正文已加载 · '+chars+'字元 / '+(l.html.match(/<h2[ >]/g)||[]).length+'节':'缺失',es.filter(e=>e.origin==='source').length+' / '+es.filter(e=>e.origin!=='source').length,models.map(m=>esc(m.id)).join('<br>')||builtins[u.id]||(u.track==='exam'?'复用先修概念，不复制动画：'+u.prerequisites.map(i=>link(i)).join(' '):'<b>无模型</b>'),u.sources.map(s=>esc(s.path.split('/').pop())+' '+(s.pages?esc(s.pages.join('–')):esc(s.section||''))).join('<br>')])});
 const questions=E.filter(filter).map(e=>row(['<a href="#example='+esc(e.id)+'">'+esc(e.id)+'</a>',link(e.unit),e.origin==='source'?'原资料教学转述':e.category==='lesson-check'?'本讲新增四级自测':'新增变式',esc((D.decks[e.deck]?.[0]||e.deck)+' · '+(Array.isArray(e.pages)?e.pages.join('、'):e.pages)),e.questions.map(q=>esc(q.type)).join(' / '),e.questions.filter(q=>q.type!=='open').reduce((s,q)=>s+q.points,0)+' 自动 + '+e.questions.filter(q=>q.type==='open').reduce((s,q)=>s+q.points,0)+' 人工']));
 return '<header class="section-head"><p class="eyebrow">EVIDENCE, NOT A FILE COUNT</p><h1>覆盖、题目、动画与测试矩阵</h1><p class="lead">区分文件存在、成功解析、入口可达、内容/模型有效四层；数字是可核查索引，不单凭字数或数量宣称教学质量。</p></header>'+ 
 '<div class="metrics"><div><strong>'+Object.keys(F).length+'/85</strong><span>完整讲义已加载</span></div><div><strong>'+source.length+' / '+extra.length+'</strong><span>原例组 / 新增题组</span></div><div><strong>'+auto.length+' / '+manual.length+'</strong><span>自动小题 / 人工小题</span></div><div><strong>'+(A.length+2)+'</strong><span>独立模型含原有2项</span></div></div>'+
 '<div class="notice"><b>不把证明自评叫自动判分。</b> 自动检查涵盖选项、有限数值与容差、向量各项、布尔真值及运算符约束、网格路径、联合布线与IP候选。开放推导有独立答题和分项评分，始终标注为人工/自评。新题的知识来源是依托材料，不冒充原PPT原题。</div>'+
 '<h2>验收证据与执行边界</h2><div class="evidence-list"><a href="./evidence/coverage.json">下载完整覆盖/题目/动画矩阵 JSON</a><a href="./evidence/verification.json">发布前测试结果 JSON</a><a href="https://github.com/shengluhua/shengluhua.github.io/actions/workflows/eda-complete-qa.yml" target="_blank" rel="noopener">精确提交的自动化验证与浏览器截图</a><a href="./evidence/source-audit.md">原资料例题与版本独立审计记录</a></div><p>网页小模型是教学解释，不是真实CUDA、生产EDA或课程平台运行结果。实体iPad Safari未在此环境验收；浏览器证据注明Chromium及视口。未执行的GPU实验保持not_run，平台专属grader不伪装成本地命令。</p>'+
 '<h2>12份课件与原例分布</h2>'+table(['源','页/张','原例组','原例小题','正文定位'],decks)+
 '<h2>85讲：正文、原例/新增、独立模型、来源</h2>'+table(['单元','可加载正文','原例/新增组','定向模型','原材料'],units)+
 '<h2>逐组题目来源与评分合同</h2>'+table(['例题','单元','性质','物理页/章节','题型','分值性质'],questions)+
 '<h2>动画模型与可执行断言</h2>'+table(['模型','单元','解释对象','断言'],modelTests.filter(filter).map(m=>row([esc(m.id),link(m.unit),esc(m.concept),esc(m.status)+' · '+m.checks.map(c=>esc(c.name+': '+c.status)).join('<br>')])) )+
 '<p>原有T03 MUX与L06点积控件另在浏览器回归中检查。共享绘图/播放控件不等于共享计算模型；每条登记含独立计算函数和概念专属断言。考试专题引用已有概念，不为凑数量复制同一动画。</p>'+
 '<h2>材料版本</h2><p>源提交 <code>'+esc(D.sourceCommit)+'</code>；12份现行课件共807页/张与旧快照逐文件SHA相同。43项正式实验任务、16周指导书、8个复习专题和28道原卷题均独立映射。原始资料保持私有，网站正文和重绘示例可独立学习。</p>';
}
window.EDAAuditUI={render};
})();
