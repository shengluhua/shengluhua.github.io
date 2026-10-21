/* Learning Atlas - progressive formative assessment, static client-side grading. */
(function(){
'use strict';
const REPO='shengluhua/shengluhua.github.io';
const ROOT='microcourses';
const RAW=`https://raw.githubusercontent.com/${REPO}/main/${ROOT}/quizzes/`;
const LEVELS=['','理解与辨析','数值与演算','迁移与推理','证明与设计'];
const cache=new Map();
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scoreKey=id=>'learning-atlas-quiz-v1-'+id;
const load=id=>{try{let x=JSON.parse(localStorage.getItem(scoreKey(id))||'null');return x&&typeof x==='object'?x:null}catch(e){return null}};
const save=(id,record)=>{try{localStorage.setItem(scoreKey(id),JSON.stringify(record))}catch(e){}};
const clear=id=>{try{localStorage.removeItem(scoreKey(id))}catch(e){}};
async function fetchQuiz(id){
 if(cache.has(id))return cache.get(id);
 const urls=[`./quizzes/${id}.json`,RAW+id+'.json'];
 for(const url of urls){
  try{const resp=await fetch(url,{cache:'no-store'});if(!resp.ok)continue;
   const data=await resp.json();
   if(!data||!Array.isArray(data.questions)||data.questions.length!==4||data.lesson_id!==id)continue;
   if(data.questions.some((q,i)=>q.level!==i+1||Number(q.points)!==[15,20,25,40][i]||!['single','multi','numeric','open'].includes(q.type)))continue;
   cache.set(id,data);return data;
  }catch(e){}
 }
 return null;
}
const choiceName=(id,q)=>'choice-'+id+'-'+q.id;
function inputFor(q,id,ans,done){
 const dis=done?'disabled':'';
 if(q.type==='single'||q.type==='multi'){
  let selected=Array.isArray(ans)?ans:[ans];
  return `<div class="quiz-options">${(q.options||[]).map((opt,i)=>{
    const checked=selected.includes(i)?'checked':'';
    const typ=q.type==='multi'?'checkbox':'radio';
    return `<label class="quiz-option"><input type="${typ}" name="${esc(choiceName(id,q))}" data-qid="${esc(q.id)}" value="${i}" ${checked} ${dis}><span class="quiz-choice">${String.fromCharCode(65+i)}</span><span>${esc(opt)}</span></label>`;
   }).join('')}</div>`;
 }
 if(q.type==='numeric')return `<label class="quiz-number-label">计算结果 <input type="number" inputmode="decimal" data-qid="${esc(q.id)}" value="${ans==null?'':esc(ans)}" step="any" ${dis} placeholder="输入数字"><span>${esc(q.unit||'')}</span></label>`;
 return `<label class="quiz-answer-label">你的推导或设计思路<textarea data-qid="${esc(q.id)}" rows="5" ${dis} placeholder="尝试写出关键假设、推导步骤、结论与边界条件">${esc(ans||'')}</textarea></label>`;
}
function answerKey(q){
 if(q.type==='single')return `${String.fromCharCode(65+Number(q.answer||0))}：${q.options?.[q.answer]||''}`;
 if(q.type==='multi')return (q.answer||[]).map(i=>String.fromCharCode(65+i)).join('、');
 if(q.type==='numeric')return String(q.answer)+(q.unit?' '+q.unit:'');
 return '';
}
function equal(q,raw){
 if(q.type==='single')return Number(raw)===Number(q.answer);
 if(q.type==='multi'){
  const a=Array.isArray(raw)?raw.map(Number).sort((x,y)=>x-y):[];
  const b=Array.isArray(q.answer)?q.answer.map(Number).sort((x,y)=>x-y):[];
  return a.length===b.length&&a.every((v,i)=>v===b[i]);
 }
 if(q.type==='numeric'){
  if(raw==null||String(raw).trim()==='')return false;
  const n=Number(raw),v=Number(q.answer),tol=Number(q.tolerance)||0;
  return Number.isFinite(n)&&Number.isFinite(v)&&Math.abs(n-v)<=tol;
 }
 return null;
}
function formatUserAnswer(q,a){if(a==null||a===''||(Array.isArray(a)&&a.length===0))return '未作答';
 if(q.type==='single')return `${String.fromCharCode(65+Number(a))}（${q.options?.[a]||''}）`;
 if(q.type==='multi')return a.map(i=>String.fromCharCode(65+Number(i))).join('、');
 return String(a);
}
function math(root){if(!window.renderMathInElement)return;
 try{window.renderMathInElement(root,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],throwOnError:false,ignoredTags:['script','noscript','style','textarea','pre','code']})}catch(e){}
}
function render(root,data,record){
 const done=!!record.submitted;
 let objective=0;
 if(done)data.questions.forEach(q=>{if(q.type!=='open'&&equal(q,record.answers[q.id]))objective+=Number(q.points)||0});
 const openQ=data.questions.find(q=>q.type==='open');
 const openScore=(record.openScore===null||record.openScore===undefined)?null:Number(record.openScore);
 const total=openScore==null?null:objective+openScore;
 root.innerHTML=`<div class="quiz-head"><span class="quiz-eyebrow">PROGRESSIVE KNOWLEDGE CHECK · 课后分级测评</span><h2>学完这一课，试试四级挑战</h2><p>先理解概念，再完成计算与迁移，最后独立证明或设计。前三题客观判分，开放题仅提供评分标准用于自评或交给老师/ChatGPT 批改。</p><div class="quiz-weight-line"><span>Lv1 · 15分</span><span>Lv2 · 20分</span><span>Lv3 · 25分</span><span>Lv4 · 40分</span></div></div>`+
 data.questions.map(q=>{
 const a=record.answers[q.id];const res=done&&q.type!=='open'?equal(q,a):null;
 const feedback=done?(q.type==='open'?`<div class="quiz-feedback open"><strong>开放题评估标准（最多 ${q.points} 分）</strong><ol>${(q.rubric||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol><details><summary>查看参考推导与答案</summary><p>${esc(q.model_answer||'暂未提供参考思路')}</p></details><p>参考以上要点后，请给自己的答案一个合理分数。此分数是<strong>自评</strong>，并非系统自动批改。</p><label class="quiz-self-score">Lv4 自评分：<select id="quiz-self-grade"><option value="" ${openScore==null?'selected':''}>暂不评分</option>${[0,10,20,30,40].map(n=>`<option value="${n}" ${openScore===n?'selected':''}>${n} / 40 分</option>`).join('')}</select></label></div>`:
 `<div class="quiz-feedback ${res?'correct':'incorrect'}"><strong>${res?'✓ 答案正确':'✕ 需要复习'} · ${res?q.points:0} / ${q.points} 分</strong><p>参考答案：${esc(answerKey(q))}</p><p>${esc(q.explanation||'')}</p></div>`):'';
 return `<fieldset class="quiz-question" data-level="${q.level}"><legend><span class="quiz-level">LV ${q.level}</span><span class="quiz-level-name">${LEVELS[q.level]}</span><span class="quiz-points">${q.points} 分</span></legend><p class="quiz-prompt">${esc(q.prompt)}</p>${inputFor(q,data.lesson_id,a,done)}<details class="quiz-hint"><summary>需要一点提示？</summary><p>${esc(q.hint||'先从本节定义和基本公式出发。')}</p></details>${feedback}</fieldset>`
 }).join('')+
 `<div class="quiz-bottom">${done?`<div class="quiz-summary" aria-live="polite"><strong>客观题：${objective} / 60 分</strong><span>${total==null?'Lv4 开放题尚未自评，总分暂不确定':`开放题自评 ${openScore} / 40 分 · 综合 ${total} / 100 分`}</span>${total==null?'':`<small>${total>=80?'掌握较好，可以继续学习并关注细节。':total>=60?'基本理解，建议针对错题补一个例子。':'建议先复习本课核心机制并尝试再做。'}</small>`}</div>`:`<div class="quiz-summary"><strong>准备好了就交卷</strong><span>交卷前不会显示标准答案；做不出来可以先展开提示。</span></div>`}<div class="quiz-buttons">${done?`<button type="button" class="quiz-primary" data-quiz-action="copy">复制我的答案与成绩</button><button type="button" data-quiz-action="reset">重新挑战</button>`:`<button type="button" class="quiz-primary" data-quiz-action="submit">提交并查看解析</button><button type="button" data-quiz-action="reset">清空重做</button>`}</div><p class="quiz-privacy">作答内容与成绩只保存在此浏览器，不上传服务器，也不会自动跨设备同步。要获得 Lv4 的详细批改，可复制答题内容回到 ChatGPT。</p></div>`;
 const grade=root.querySelector('#quiz-self-grade');if(grade)grade.addEventListener('change',()=>{record.openScore=grade.value===''?null:Number(grade.value);save(data.lesson_id,record);render(root,data,record)});
 math(root);
}
function bind(root,data,record){
 root.addEventListener('change',e=>{
  const el=e.target;if(!el.dataset.qid||record.submitted)return;
  const id=el.dataset.qid,q=data.questions.find(x=>x.id===id);if(!q)return;
  if(q.type==='multi'){
   const vals=[...root.querySelectorAll(`input[data-qid="${id}"]:checked`)].map(n=>Number(n.value));record.answers[id]=vals.sort((a,b)=>a-b);
  }else if(q.type==='single')record.answers[id]=Number(el.value);
  else record.answers[id]=el.value;
  save(data.lesson_id,record);
 });
 root.addEventListener('input',e=>{
  const el=e.target;if(!el.dataset.qid||record.submitted)return;
  if(el.tagName==='TEXTAREA'||el.type==='number'){record.answers[el.dataset.qid]=el.value;save(data.lesson_id,record)}
 });
 root.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-quiz-action]');if(!btn)return;
  const action=btn.dataset.quizAction;
  if(action==='submit'){
    record.submitted=true;record.openScore=null;save(data.lesson_id,record);render(root,data,record);root.scrollIntoView({behavior:'smooth',block:'start'});
  }else if(action==='reset'){
    clear(data.lesson_id);record.answers={};record.submitted=false;record.openScore=null;render(root,data,record);
  }else if(action==='copy'){
   let lines=[`【${data.lesson_id} 分级测验】`,...data.questions.map(q=>`Lv${q.level}（${q.points}分） ${q.prompt}\n我的答案：${formatUserAnswer(q,record.answers[q.id])}`)];
   lines.push('客观题成绩：'+data.questions.filter(q=>q.type!=='open').reduce((s,q)=>s+(equal(q,record.answers[q.id])?q.points:0),0)+'/60');
   if(record.openScore!=null)lines.push('开放题自评：'+record.openScore+'/40');
   lines.push('请逐题点评、批改Lv4的推导并给出针对性补练。');
   const str=lines.join('\n\n');
   try{await navigator.clipboard.writeText(str);btn.textContent='已复制 ✓'}catch(e){window.prompt('请复制以下答案内容',str)}
  }
 });
}
async function mount(root,id){
 if(!root)return;
 root.innerHTML='<div class="quiz-loading">正在加载本课分级测验…</div>';
 const data=await fetchQuiz(id);
 if(!root.isConnected||root.dataset.lesson!==id)return;
 if(!data){root.innerHTML='<div class="quiz-loading">本课互动测验尚未归档。你仍可以完成上面的课后练习；新增测验发布后此处会自动出现。</div>';return}
 const record=load(id)||{answers:{},submitted:false,openScore:null};
 if(!record.answers||typeof record.answers!=='object')record.answers={};
 render(root,data,record);bind(root,data,record);
}
window.ProgressiveQuiz={mount};
})();
