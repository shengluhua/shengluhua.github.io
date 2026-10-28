/* Interactive answer/check/explanation for 105 source-mapped teaching units.
   Historical exam original questions are not treated as objectively machine-gradable;
   each has an analogous objectively-graded knowledge check plus explicit self-assessment. */
(function(){'use strict';
const D=window.EDACourse,questions=window.EDAPractice?.bank;
if(!D||!questions)throw Error('Missing EDA data for quiz');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function key(id){return 'eda-practice-v2-'+id}
function get(id){try{const raw=localStorage.getItem(key(id));if(raw!==null){const s=JSON.parse(raw);return s&&typeof s==='object'?s:{}}if(!/^original-/.test(id)){const oldRaw=localStorage.getItem('eda-v2-attempt:practice:'+id);if(oldRaw!==null){const old=JSON.parse(oldRaw),a=old?.answers?.[0],value=Array.isArray(a)&&a.length===1?a[0]:a,choice=String(value??''),n=Number(choice),q=questions[id];if(choice.trim()!==''&&Number.isInteger(n)&&q&&n>=0&&n<q.options.length){const migrated={choice:n,submitted:false,migration:{source:'reader-v2',historical:old}};set(id,migrated);return migrated}}}return{}}catch(e){return{}}}
function set(id,v){try{localStorage.setItem(key(id),JSON.stringify(v))}catch(e){}}
function baseId(id){return /^[0-9]+$/.test(String(id))?'Q'+Number(id):String(id)}
function render(id,brief=false){
 id=baseId(id);const q=questions[id];if(!q)return '<div class="practice-unavailable">本单元的客观知识检查尚未准备好，不能自动评分。</div>';
 const stored=get(id),done=stored.submitted===true,chosen=Number(stored.choice),hasSelection=stored.choice!==null&&stored.choice!==undefined&&String(stored.choice).trim()!==''&&Number.isInteger(chosen)&&chosen>=0&&chosen<q.options.length;
 const correct=done&&hasSelection&&chosen===q.answer;
 return '<section class="practice-card" data-practice="'+esc(id)+'"><div class="practice-head"><span class="unit-id">'+id+'</span><span>交互知识检查 · 10 分</span></div><h3>'+(brief?'这道题的相关知识自测':'学完以后，独立回答这一题')+'</h3><p class="practice-prompt">'+esc(q.prompt)+'</p>'+
 '<form data-practice-form="'+esc(id)+'"><div class="practice-options">'+q.options.map((o,i)=>'<label class="practice-option '+(done&&i===q.answer?'is-answer ':'')+(done&&i===chosen&&!correct?'is-mistake':'')+'"><input type="radio" name="practice-'+esc(id)+'" value="'+i+'" '+(hasSelection&&chosen===i?'checked':'')+(done?' disabled':'')+'><span class="choice-letter">'+String.fromCharCode(65+i)+'</span><span>'+esc(o)+'</span></label>').join('')+'</div>'+
 (done?'<div class="practice-feedback '+(correct?'is-correct':'is-wrong')+'" role="status"><strong>'+(correct?'✓ 回答正确 · 10 / 10 分':'✕ 回答不正确 · 0 / 10 分')+'</strong><p>正确选项：'+String.fromCharCode(65+q.answer)+'。'+esc(q.explanation)+'</p></div>':'<p class="practice-assist">'+(stored.migration?'已恢复旧版作答草稿，旧分数不沿用；请重新检查。':'先选择答案，提交后才显示标准答案和逐步解释。')+'</p>')+
 '<div class="practice-actions">'+(done?'<button type="button" data-practice-retry="'+esc(id)+'">重新作答</button>':'<button type="submit" class="primary">检查答案</button>')+
 '<span class="practice-score">'+(done?'这次知识检查 '+(correct?10:0)+'/10':'尚未提交')+'</span></div></form></section>';
}
function exam(q){
 const id='Q'+q.question,st=get('original-'+id),opened=st.submitted===true;
 const meta='<p class="practice-assist">此处是根据往年题目的知识点制作的<b>独立作答练习</b>，不是原题逐字复制。复述／证明题由本人依据参考步骤自评；下方另有同知识点的客观题可自动判对错。</p>';
 const saved=typeof st.answer==='string'?st.answer:'';
 return '<div class="exam-interactive" data-exam-original="'+id+'">'+meta+
 '<form data-exam-form="'+id+'"><label class="exam-answer-label"><strong>先尝试完成 Q'+q.question+'：'+esc(q.topic)+'</strong><textarea name="original-'+id+'" rows="4" placeholder="写下推导、关键公式、计算步骤或自己的答案，不要先看参考步骤。" '+(opened?'disabled':'')+'>'+esc(saved)+'</textarea></label>'+
 (opened?'<div class="practice-feedback"><strong>参考解题步骤（不代表机器已判你的作答）</strong><p>'+esc(q.walkthrough)+'</p><p><b>常见边界：</b>'+esc(q.boundary)+'</p></div><label class="self-mark-label">对照参考步骤自评分（该题满分 '+q.points+' 分）：<select name="self-mark-'+id+'"><option value="">暂不评分</option>'+Array.from({length:q.points+1},(_,i)=>'<option value="'+i+'" '+(Number(st.score)===i&&st.score!==null&&st.score!==undefined?'selected':'')+'>'+i+'</option>').join('')+'</select></label><p class="practice-assist">这里记录的分数仅是自评；逻辑证明、图形与部分分必须由人工／ChatGPT批改。</p>':'<button type="submit" class="primary">提交思路并查看参考步骤</button>')+
 (opened?'<button type="button" data-exam-retry="'+id+'">修改原题作答</button>':'')+
 '</form><div class="practice-exam-sibling">'+render(id,true)+'</div></div>';
}
function bind(root){
 if(root.dataset.practiceAttached==='yes')return;root.dataset.practiceAttached='yes';
 root.addEventListener('submit',e=>{
  const f=e.target;if(f.matches('[data-practice-form]')){
   e.preventDefault();const id=f.dataset.practiceForm,sel=f.querySelector('input[type=radio]:checked');
   if(!sel){let p=f.querySelector('.practice-assist');if(p)p.textContent='请选择一个选项后再提交；空白不能计为正确。';return}
   set(id,{choice:Number(sel.value),submitted:true});
   const box=f.closest('[data-practice]');if(box)box.outerHTML=render(id,!!box.closest('.practice-exam-sibling'));
  }else if(f.matches('[data-exam-form]')){
   e.preventDefault();const id=f.dataset.examForm,txt=f.querySelector('textarea');
   set('original-'+id,{answer:txt.value,submitted:true,score:null});
   const block=f.closest('[data-exam-original]'),q=D.exams.find(z=>z.question===Number(id.slice(1)));
   if(block&&q)block.outerHTML=exam(q);
  }
 });
 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-practice-retry],[data-exam-retry]');if(!b)return;
  if(b.hasAttribute('data-practice-retry')){
   const id=b.dataset.practiceRetry;set(id,{});const box=b.closest('[data-practice]');if(box)box.outerHTML=render(id,!!box.closest('.practice-exam-sibling'))
  }else{
   const id=b.dataset.examRetry,st=get('original-'+id);set('original-'+id,{answer:st.answer||'',submitted:false,score:null});
   const block=b.closest('[data-exam-original]'),q=D.exams.find(z=>z.question===Number(id.slice(1)));if(block&&q)block.outerHTML=exam(q)
  }
 });
 root.addEventListener('change',e=>{
  const el=e.target;if(!el.matches('select[name^="self-mark-"]'))return;
  const id=el.name.replace('self-mark-',''),st=get('original-'+id);
  st.score=el.value===''?null:Number(el.value);set('original-'+id,st);
 });
}
window.EDAQuiz={render,exam,bind,questions};
})();
