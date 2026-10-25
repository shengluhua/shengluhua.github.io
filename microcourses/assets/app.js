/* Learning Atlas: GitHub-backed live lesson index, searchable Markdown reader and diagrams. */
(function(){
'use strict';
const REPO='shengluhua/shengluhua.github.io', ROOT='microcourses',BRANCH='main', API=`https://api.github.com/repos/${REPO}/contents/${ROOT}/lessons?ref=${BRANCH}`;
const BASE_RAW=`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${ROOT}/`;
const TRACKS=[
 {id:'arch',name:'计算机体系结构',icon:'▦',tone:'#4f7cdc',description:'CPU · GPU · 存储 · 加速器'},
 {id:'algo',name:'算法与数据结构',icon:'◇',tone:'#13a28e',description:'复杂度 · 证明 · 图论 · 并行算法'},
 {id:'opt',name:'数学优化理论',icon:'∑',tone:'#926ad8',description:'凸分析 · 对偶 · 收敛 · 优化算法'},
 {id:'ai',name:'人工智能',icon:'✳',tone:'#d99455',description:'统计学习 · 大模型 · 生成 · 强化学习'}
];
const app=document.getElementById('app-content'),nav=document.getElementById('course-nav'),search=document.getElementById('global-search'),crumb=document.getElementById('breadcrumb');
const state={track:'all',filter:'all',planWeek:1,knownGaps:[],discoverIssue:null,q:'',lessons:[],raw:new Map(),body:new Map(),active:null,fetching:new Map(),searchToken:0,initialized:false};
const esc=(v)=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trackName=id=>(TRACKS.find(t=>t.id===id)||{}).name||id;
const trackInfo=id=>TRACKS.find(t=>t.id===id)||TRACKS[0];
const clockDate=num=>{let d=new Date(Date.UTC(2026,9,20));d.setUTCDate(d.getUTCDate()+Number(num)-1);return d.toISOString().slice(0,10)};
const weekFromNum=num=>Math.ceil(num/7);
function metaParse(text){
 const m=String(text).match(/^---\s*\n([\s\S]*?)\n---\s*\n/);if(!m)return {meta:{},body:String(text)};
 let fields={};m[1].split(/\r?\n/).forEach(row=>{let x=row.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*$/);if(!x)return;let v=x[2];if((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'"))v=v.slice(1,-1);fields[x[1]]=v});
 return {meta:fields,body:String(text).slice(m[0].length)};
}
function toLesson(meta,id,path){
 const guessed=id.match(/^(arch|algo|opt|ai)-(\d+)$/);if(!guessed)return null;
 const track=meta.track||guessed[1],number=Number(meta.number)||Number(guessed[2]);if(!TRACKS.some(t=>t.id===track)||!Number.isFinite(number)||number<=0)return null;
 const title=meta.title||'第 '+number+' 课',date=meta.date||clockDate(number);
 return {id,track,number,date,week:Number(meta.week)||weekFromNum(number),title,abstract:meta.abstract||meta.summary||'课程正文、推导、示例与练习',minutes:Number(meta.minutes)||16,diagram:meta.diagram||'',kind:meta.kind||'full',quiz:meta.quiz!==false,file:path||`lessons/${id}.md`,tags:(Array.isArray(meta.tags)?meta.tags:String(meta.tags||'').replace(/^\[/,'').replace(/\]$/,'').split(/\s*,\s*/)).filter(Boolean)};
}
function combine(lesson){if(!lesson)return;const k=state.lessons.findIndex(x=>x.id===lesson.id);if(k<0)state.lessons.push(lesson);else state.lessons[k]={...state.lessons[k],...lesson}}
function sort(){state.lessons.sort((a,b)=>a.date.localeCompare(b.date)||a.track.localeCompare(b.track)||a.number-b.number)}
function queryLesson(){return new URL(location.href).searchParams.get('lesson')}
function urlFor(id){let u=new URL(location.href);if(id)u.searchParams.set('lesson',id);else u.searchParams.delete('lesson');return u.pathname+u.search}
function goHome(track='all',replace=false){document.body.classList.remove('reading-focus');state.track=track;state.active=null;state.q='';search.value='';if(window.ConceptDiagrams)window.ConceptDiagrams.stopAll();history[replace?'replaceState':'pushState']({},'',urlFor(null));renderIndex()}
function updateNav(){
 nav.innerHTML='<button class="nav-link" data-track="all"><span class="nav-symbol">⌂</span><span class="nav-main"><b>全部课程</b><small>每日学习总览</small></span><span class="nav-count">'+state.lessons.length+'</span></button>'+TRACKS.map(t=>{let n=state.lessons.filter(l=>l.track===t.id).length;return `<button class="nav-link" data-track="${t.id}"><span class="nav-symbol" style="color:${t.tone}">${esc(t.icon)}</span><span class="nav-main"><b>${esc(t.name)}</b><small>${esc(t.description)}</small></span><span class="nav-count">${n}</span></button>`}).join('');
 nav.querySelectorAll('[data-track]').forEach(n=>n.classList.toggle('active',n.dataset.track===state.track));
}
function courseCards(){return `<div class="section-title"><h2>四条知识路径</h2><span>从基础理论到研究级应用</span></div><div class="course-grid">${TRACKS.map(t=>{let total=state.lessons.filter(l=>l.track===t.id).length;return `<button class="course-box" data-track="${t.id}" style="--tone:${t.tone}"><span class="course-icon">${esc(t.icon)}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><div class="course-foot"><span>${total} 节已归档</span><span>进入学习 ↗</span></div></button>`}).join('')}</div>`}
function dateShanghai(){
 try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
 catch(e){return new Date().toISOString().slice(0,10)}
}
function courseDay(){return Math.max(1,Math.floor((Date.parse(dateShanghai()+'T00:00:00Z')-Date.UTC(2026,9,20))/86400000)+1)}
function localCompleted(){try{return new Set(JSON.parse(localStorage.getItem('atlas-completed-lessons')||'[]'))}catch(e){return new Set()}}
function saveCompleted(set){try{localStorage.setItem('atlas-completed-lessons',JSON.stringify([...set]))}catch(e){}}
function resumeCard(){
 let last=null;try{last=localStorage.getItem('atlas-last-lesson')}catch(e){}
 const l=state.lessons.find(x=>x.id===last);if(!l)return '';
 return '<div class="continue-card"><div><div class="resume-title">继续上次阅读：'+esc(l.title)+'</div><div class="resume-meta">'+esc(trackName(l.track))+' · 第 '+l.number+' 课 · 阅读进度仅保存在此浏览器</div></div><button data-lesson="'+esc(l.id)+'">继续阅读 →</button></div>';
}
function archiveBoard(){
 const maxWeek=Math.max(1,Math.ceil(courseDay()/7));
 const week=Math.min(Math.max(1,state.planWeek),Math.max(12,maxWeek));
 const activeDay=courseDay();
 const head='<thead><tr><th>课次</th>'+TRACKS.map(t=>'<th>'+esc(t.name)+'</th>').join('')+'</tr></thead>';
 let rows='';
 for(let i=1;i<=7;i++){
  const n=(week-1)*7+i, day=clockDate(n);
  rows+='<tr><td><span class="archive-date">'+day.slice(5)+'</span><span class="archive-day">第 '+n+' 课'+(i===7?' · 复盘':'')+'</span></td>';
  TRACKS.forEach(t=>{
   const l=state.lessons.find(x=>x.track===t.id&&x.number===n);
   if(l){
    const status=l.kind==='review'?'复习版':l.quiz?'完整讲义 · 测验':'讲义已归档 · 缺测验';
    const klass=l.kind==='review'?'review':l.quiz?'full':'noquiz';
    rows+='<td><button class="archive-entry '+klass+(n===activeDay?' today':'')+'" data-lesson="'+esc(l.id)+'" title="'+esc(l.title)+'"><span class="archive-entry-title">'+esc(l.title)+'</span><span class="archive-entry-state">'+status+'</span></button></td>';
   }else{
    const future=n>=activeDay;
    rows+='<td><div class="archive-entry '+(future?'future':'missing')+'"><span class="archive-entry-title">第 '+n+' 课</span><span class="archive-entry-state">'+(future?'待发布':'尚未归档')+'</span></div></td>';
   }
  });
  rows+='</tr>';
 }
 let total=state.lessons.length,full=state.lessons.filter(l=>l.kind==='full').length,reviews=total-full;
 const prev=week>1?'<button data-week="'+(week-1)+'">← 上一周</button>':'';
 const next=week<maxWeek?'<button data-week="'+(week+1)+'">下一周 →</button>':'';
 return '<section class="archive-overview"><div class="section-title"><h2>按日期查看课程</h2><span>第 '+week+' 周 · 已检索 '+total+' 节</span></div><p class="archive-hint">按日期横向对照四门课。<b>完整讲义 '+full+' 节、复习版 '+reviews+' 节</b>；缺稿的日期明确标记，不把缺失内容算作已归档。</p><div class="week-switch">'+prev+'<span>第 '+week+' 周 / '+Math.max(12,maxWeek)+' 周</span>'+next+'</div><div class="archive-scroll" role="region" aria-label="四门课程每周归档表" tabindex="0"><table class="archive-table">'+head+'<tbody>'+rows+'</tbody></table></div><div class="archive-key"><span>● 完整：含推导与测验（部分课可能缺测验）</span><span>● 复习：较短的旧稿</span><span>● 尚未归档：源文件不存在</span></div></section>';
}
function lessonRow(l){
 const t=trackInfo(l.track),done=localCompleted().has(l.id);
 const badge=done?'已学完':l.kind==='review'?'复习版':l.quiz?'完整讲义':'缺少测验';
 const cls=done?'finished':l.kind==='review'?'summary':l.quiz?'':'warning';
 return '<button class="lesson-row" data-lesson="'+esc(l.id)+'"><span class="lesson-no">'+String(l.number).padStart(2,'0')+'</span><span class="lesson-center"><span class="lesson-meta">'+esc(t.name)+' · '+esc(l.date)+' · 第 '+l.week+' 周 · 约 '+l.minutes+' 分钟</span><span class="lesson-name">'+esc(l.title)+'</span><span class="lesson-desc">'+esc(l.abstract)+'</span></span><span class="tag '+cls+'">'+badge+'</span></button>';
}
function matching(){
 let result=state.lessons.filter(l=>state.track==='all'||l.track===state.track);
 if(state.filter==='week1')result=result.filter(l=>l.week===1);
 if(state.filter==='recent'){let x=clockDate(Math.max(1,courseDay()-6));result=result.filter(l=>l.date>=x)}
 if(state.filter==='review')result=result.filter(l=>l.kind==='review'||!l.quiz);
 if(state.q){const q=state.q;result=result.filter(l=>[l.title,l.abstract,l.date,'第'+l.number+'课',l.track,trackName(l.track),l.tags.join(' '),(state.body.get(l.id)||'')].join(' ').toLowerCase().includes(q))}
 return result.sort((a,b)=>b.date.localeCompare(a.date)||a.track.localeCompare(b.track)||b.number-a.number);
}
function renderIndex(){
 if(!state.initialized)return;
 state.active=null;updateNav();
 const current=state.track==='all'?null:trackInfo(state.track),items=matching();
 const count=state.lessons.length,full=state.lessons.filter(l=>l.kind==='full').length,review=count-full;
 crumb.innerHTML='学习地图 <span>/</span> '+(state.q?'搜索结果':current?esc(current.name):'课程总览');
 let html='<section class="hero"><div class="eyebrow">LEARNING ATLAS · 系统化微课笔记</div><h1>'+(current?esc(current.name):'每天学习一点，把知识连成体系。')+'</h1><p>'+(current?'依照每周专题逐步学习，课稿、例题和自测分开归档；缺漏会如实标记。':'四门课程一张学习地图。按日期定位课程，在平板上舒适阅读推导、代码、示意图，随时返回上次位置。')+'</p><div class="stats"><span class="stat"><strong>4</strong>门课程</span><span class="stat"><strong>'+count+'</strong>篇讲义</span><span class="stat"><strong>'+full+'</strong>篇完整课稿</span><span class="stat"><strong>'+review+'</strong>篇复习版</span></div></section>';
 if(!state.q)html+=resumeCard();
 if(state.track==='all'&&!state.q)html+=archiveBoard()+courseCards();
 html+='<div class="section-title"><h2>'+(state.q?'搜索结果':current?'课程目录':'全部已归档课程')+'</h2><span>'+items.length+' 节</span></div>';
 html+='<div class="filters"><button class="filter '+(state.filter==='all'?'active':'')+'" data-filter="all">全部</button><button class="filter '+(state.filter==='week1'?'active':'')+'" data-filter="week1">第 1 周</button><button class="filter '+(state.filter==='recent'?'active':'')+'" data-filter="recent">最近 7 天</button><button class="filter '+(state.filter==='review'?'active':'')+'" data-filter="review">需补全</button></div>';
 html+='<div class="lesson-list" style="margin-top:15px">'+(items.length?items.map(lessonRow).join(''):'<div class="empty">没有匹配课程。可以试试缩短关键词或选择另一门课。</div>')+'</div>';
 html+='<div class="notice"><strong>归档说明：</strong>早期讲义存在较短复习版，个别课号及测验源文件尚未归档。页面会显示实际已确认的内容；若自动发现受 GitHub API 限制，仍使用站点随附的完整静态清单。答题结果仅存于当前浏览器。</div>';
 if(state.discoverIssue)html+='<p class="archive-alert">'+esc(state.discoverIssue)+'</p>';
 app.innerHTML=html;
}
async function lessonText(l){if(state.raw.has(l.id))return state.raw.get(l.id);if(state.fetching.has(l.id))return state.fetching.get(l.id);
 const promise=(async()=>{let urls=location.hostname==='localhost'||location.hostname==='127.0.0.1'?[`./${l.file}`,BASE_RAW+l.file]:[BASE_RAW+l.file,`./${l.file}`];for(const url of urls){try{const r=await fetch(url,{cache:'no-store'});if(r.ok){const txt=await r.text();state.raw.set(l.id,txt);state.body.set(l.id,metaParse(txt).body);return txt}}catch(e){}}throw Error('课程 Markdown 暂不可用')})();state.fetching.set(l.id,promise);try{return await promise}finally{state.fetching.delete(l.id)}}
function renderer(md){
 const safe=String(md).replace(/^\[\[diagram:(amdahl|pipeline|array|recursion|convex|gradient|softmax)\]\]$/gm,(_,t)=>`<div data-diagram="${t}"></div>`);
 let html=window.marked?.parse?window.marked.parse(safe,{gfm:true,breaks:false}):'<pre>'+esc(safe)+'</pre>';
 return window.DOMPurify?.sanitize?DOMPurify.sanitize(html):'<pre>'+esc(safe)+'</pre>';
}
function sibling(l){const same=state.lessons.filter(x=>x.track===l.track).sort((a,b)=>a.number-b.number);let k=same.findIndex(x=>x.id===l.id);return {prev:same[k-1],next:same[k+1]}}
async function renderMermaid(root){
 const codes=[...(root||document).querySelectorAll('pre code.language-mermaid')];
 if(!codes.length)return;
 if(!window.mermaid)return; // Keep readable source code if the Mermaid CDN is unavailable.
 const nodes=[];
 codes.forEach(code=>{const div=document.createElement('div');div.className='mermaid';div.textContent=code.textContent;code.closest('pre').replaceWith(div);nodes.push(div)});
 try{
   window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',flowchart:{useMaxWidth:true}});
   await window.mermaid.run({nodes});
 }catch(e){
   console.warn('Mermaid diagram failed:',e);
   nodes.forEach(n=>{if(n.querySelector('svg'))return;const pre=document.createElement('pre');const code=document.createElement('code');code.textContent=n.textContent;pre.append(code);n.replaceWith(pre)})
 }
}
function makeToc(){
 const nodes=[...document.querySelectorAll('.article h2, .article h3')];
 nodes.forEach((h,i)=>{h.id='section-'+(i+1)});
 const links=nodes.map(n=>'<a href="#'+n.id+'" class="'+(n.tagName==='H3'?'sub':'')+'">'+esc(n.textContent)+'</a>').join('');
 const toc=document.getElementById('toc');
 const mobile=document.getElementById('mobile-toc');
 if(toc)toc.innerHTML='<div class="toc-title">本课导航</div>'+links;
 if(mobile)mobile.innerHTML='<strong>跳转到本课章节</strong>'+(links||'<p>本课暂无可索引的小节。</p>');
 if(mobile)mobile.addEventListener('click',e=>{if(e.target.closest('a')){mobile.hidden=true;let b=document.getElementById('toc-toggle');if(b)b.setAttribute('aria-expanded','false')}});
}
function updateReadingProgress(){
 const bar=document.querySelector('#reading-progress>span'),article=document.getElementById('article');
 if(!bar)return;
 if(!article||!state.active){bar.style.width='0%';return}
 const top=article.getBoundingClientRect().top+window.scrollY;
 const stop=top+article.offsetHeight;
 const pos=window.scrollY+window.innerHeight*.55;
 const v=Math.max(0,Math.min(1,(pos-top)/Math.max(1,stop-top)));
 bar.style.width=(v*100).toFixed(1)+'%';
}
function bindReaderTools(id){
 let fsz=18;try{fsz=Number(localStorage.getItem('atlas-font-size'))||18}catch(e){}
 fsz=Math.max(15,Math.min(22,fsz));
 const setSize=()=>{document.documentElement.style.setProperty('--reader-font-size',fsz+'px');let x=document.getElementById('font-size-indicator');if(x)x.textContent=String(fsz)+'px'};
 setSize();
 document.querySelectorAll('[data-font]').forEach(btn=>btn.addEventListener('click',()=>{fsz=Math.max(15,Math.min(22,fsz+Number(btn.dataset.font)));try{localStorage.setItem('atlas-font-size',fsz)}catch(e){}setSize();updateReadingProgress()}));
 const toc=document.getElementById('mobile-toc'),bt=document.getElementById('toc-toggle');
 if(bt&&toc)bt.onclick=()=>{toc.hidden=!toc.hidden;bt.setAttribute('aria-expanded',String(!toc.hidden))};
 const focus=document.getElementById('focus-toggle');
 if(focus)focus.onclick=()=>{let on=document.body.classList.toggle('reading-focus');focus.setAttribute('aria-pressed',String(on));focus.textContent=on?'退出专注':'专注阅读';updateReadingProgress()};
 const finished=document.getElementById('mark-complete');
 const reflect=()=>{const on=localCompleted().has(id);finished.setAttribute('aria-pressed',String(on));finished.textContent=on?'✓ 已学完':'○ 标记学完'};
 if(finished){reflect();finished.onclick=()=>{let done=localCompleted();if(done.has(id))done.delete(id);else done.add(id);saveCompleted(done);reflect()}};
 try{localStorage.setItem('atlas-last-lesson',id)}catch(e){}
 window.requestAnimationFrame(updateReadingProgress);
}
async function renderLesson(id,push=true){
 let lesson=state.lessons.find(l=>l.id===id);
 if(!lesson&&/^(arch|algo|opt|ai)-\d{3,}$/.test(id)){
  const guessed=toLesson({},id,'lessons/'+id+'.md');
  try{
   const raw=await lessonText(guessed),parsed=metaParse(raw);
   if(!/^---\s*\n/.test(raw)||raw.trim().length<150)throw Error('缺少有效讲义');
   lesson=toLesson(parsed.meta,id,guessed.file);
   combine(lesson);sort();updateNav();
  }catch(e){app.innerHTML='<div class="empty">这节课目前没有可读取的完整源文件。<p>课程编号：'+esc(id)+'。可在每周课程表中查看其他已归档内容。</p><button class="filter" data-action="home">返回课程首页</button></div>';return}
 }
 if(!lesson)return;if(push)history.pushState({},'',urlFor(lesson.id));state.active=lesson.id;state.track=lesson.track;state.q='';search.value='';updateNav();if(window.ConceptDiagrams)window.ConceptDiagrams.stopAll();let t=trackInfo(lesson.track);crumb.innerHTML='学习地图 <span>/</span> '+esc(t.name)+' <span>/</span> 第 '+lesson.number+' 课';
 const nextprev=sibling(lesson);app.innerHTML='<div class="loading-pane">正在打开课程内容…</div>';
 let raw;try{raw=await lessonText(lesson)}catch(e){if(state.active!==id)return;app.innerHTML='<div class="empty">课程暂时无法加载。<br>'+esc(String(e))+'<br><a href="https://github.com/'+REPO+'/tree/'+BRANCH+'/'+ROOT+'/lessons">可在 GitHub 阅读原文</a></div>';return}
 if(state.active!==id)return;
 const {meta,body}=metaParse(raw),hasDiagram=/\[\[diagram:/.test(body);let text=body;
 if(!hasDiagram&&lesson.diagram&&window.ConceptDiagrams?.types.includes(lesson.diagram)){text=text.replace(/^## /m,'[[diagram:'+lesson.diagram+']]\n\n## ')}
 let article=renderer(text);const contentText=`<section class="reader"><div class="reader-head"><button class="back-link" data-back="${esc(lesson.track)}">← 返回 ${esc(t.name)} 目录</button><div class="eyebrow" style="margin-top:14px;color:${t.tone}">第 ${lesson.week} 周 · ${esc(t.name)}</div><h1>${esc(lesson.title)}</h1><div class="reader-meta"><span>第 ${lesson.number} 课</span><span>${esc(lesson.date)}</span><span>预计 ${lesson.minutes} 分钟</span><span>${meta.kind==='full'?'完整课稿':'重点复习讲义'}</span></div><div class="reader-actions"><button id="copy-link">复制本课链接</button><button id="source-link">查看 Markdown 原文 ↗</button></div></div><div class="reader-tools" role="toolbar" aria-label="阅读工具"><button type="button" id="toc-toggle" aria-expanded="false">☰ 目录</button><button type="button" id="focus-toggle" aria-pressed="false">专注阅读</button><button type="button" id="mark-complete" class="mark-done" aria-pressed="false">○ 标记学完</button><div class="font-tools" aria-label="正文字号"><button type="button" data-font="-1" aria-label="缩小字号">A−</button><span id="font-size-indicator">18px</span><button type="button" data-font="1" aria-label="放大字号">A+</button></div></div><div id="mobile-toc" class="reader-outline" hidden></div><div class="reader-layout"><article class="article" id="article">${article}</article><aside class="toc" id="toc"></aside></div><section class="quiz-container" id="quiz-root" data-lesson="${esc(lesson.id)}" aria-label="本课分级测评"></section><div class="reader-pagination"><button data-lesson="${nextprev.prev?.id||''}" ${!nextprev.prev?'disabled':''}>← ${nextprev.prev?'第 '+nextprev.prev.number+' 课':'当前为第一课'}</button><button data-lesson="${nextprev.next?.id||''}" ${!nextprev.next?'disabled':''}>${nextprev.next?'第 '+nextprev.next.number+' 课':'期待下一讲'} →</button></div></section>`;
 app.innerHTML=contentText;makeToc();bindReaderTools(lesson.id);window.ConceptDiagrams?.mountAll(app);window.ProgressiveQuiz?.mount(document.getElementById("quiz-root"),lesson.id);
 renderMermaid(app);
 if(window.renderMathInElement){try{renderMathInElement(document.getElementById('article'),{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],throwOnError:false,ignoredTags:['script','noscript','style','textarea','pre','code']})}catch(e){}}
 const markdownUrl=`https://github.com/${REPO}/blob/${BRANCH}/${ROOT}/${lesson.file}`;
 document.getElementById('source-link').onclick=()=>window.open(markdownUrl,'_blank','noopener,noreferrer');
 document.getElementById('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);document.getElementById('copy-link').textContent='链接已复制 ✓'}catch(e){window.prompt('复制本课链接',location.href)}};
 window.scrollTo({top:0,behavior:'instant'});
}
async function refreshFromGithub(){
 // A committed manifest makes page loads independent of GitHub API rate limits.
 // Discovery first uses the public directory API, then falls back to direct Pages paths.
 let candidateIds=new Set(),apiAvailable=false;
 try{
  const resp=await fetch(API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
  if(!resp.ok)throw Error('GitHub API '+resp.status);
  const files=await resp.json();
  if(!Array.isArray(files))throw Error('Unexpected listing format');
  apiAvailable=true;
  files.forEach(f=>{if(/^(arch|algo|opt|ai)-\d{3,}\.md$/.test(f.name))candidateIds.add(f.name.slice(0,-3))});
 }catch(e){
  // Files remain discoverable via GitHub Pages even when the public API hits a rate limit.
  const today=courseDay();
  const maxKnown=state.lessons.reduce((m,l)=>Math.max(m,l.number),0);
  state.knownGaps.forEach(id=>candidateIds.add(id));
  const floor=Math.max(maxKnown+1,today-18);
  TRACKS.forEach(t=>{
   for(let n=floor;n<=today;n++)candidateIds.add(t.id+'-'+String(n).padStart(3,'0'));
  });
  if(today-maxKnown>19)state.discoverIssue='GitHub API 暂时不可访问。网页已扫描最近新课，但部分较久的新增文件可能尚未列入索引。可到 GitHub 仓库核对。';
  console.info('GitHub 自动索引不可用，改用直接文件探测。',String(e));
 }
 const ids=[...candidateIds].filter(id=>!state.lessons.some(l=>l.id===id));
 const found=[];let cursor=0;
 async function worker(){
  while(cursor<ids.length){
   const id=ids[cursor++],l=toLesson({},id,'lessons/'+id+'.md');
   if(!l)continue;
   try{
    const raw=await lessonText(l);
    if(!/^---\s*\n/.test(raw)||raw.trim().length<150)continue;
    const parsed=metaParse(raw),heading=parsed.body.match(/^#\s+(.*)$/m);
    const meta={...parsed.meta};
    if(!meta.title&&heading)meta.title=heading[1].replace(/^第\s*\d+\s*课[｜|·：:\s]*/,'').trim();
    found.push(toLesson(meta,id,l.file));
   }catch(e){/* Not archived is not a valid catalog entry. */}
  }
 }
 await Promise.all(Array.from({length:Math.min(ids.length,6)},()=>worker()));
 for(const l of found){if(l)combine(l)}
 if(found.length){sort();updateNav()}
 if(!state.active&&(found.length||state.discoverIssue))renderIndex();
}
async function prepareSearchBodies(){let token=++state.searchToken;const missing=state.lessons.filter(l=>!state.body.has(l.id));let pos=0;async function worker(){while(pos<missing.length){let l=missing[pos++];try{await lessonText(l)}catch(e){}if(token!==state.searchToken)return}}
 await Promise.all(Array.from({length:Math.min(6,missing.length)},worker));if(token===state.searchToken&&!state.active)renderIndex()}
function startNav(){
 window.addEventListener('scroll',updateReadingProgress,{passive:true});window.addEventListener('resize',updateReadingProgress);
 document.addEventListener('click',e=>{let node=e.target.closest('[data-action],[data-track],[data-filter],[data-lesson],[data-back],[data-week]');if(!node)return;
 if(node.dataset.week){state.planWeek=Number(node.dataset.week);return renderIndex()}if(node.dataset.action==='home')return goHome();if(node.dataset.track){state.filter='all';return goHome(node.dataset.track)}if(node.dataset.filter){state.filter=node.dataset.filter;return renderIndex()}if(node.dataset.back)return goHome(node.dataset.back);if(node.dataset.lesson)return renderLesson(node.dataset.lesson,true)});
 document.querySelector('.brand').addEventListener('keydown',e=>{if(e.key==='Enter')goHome()});
 let debounce;search.addEventListener('input',()=>{state.q=search.value.trim().toLowerCase();clearTimeout(debounce);if(state.active){state.active=null;history.replaceState({},'',urlFor(null))}renderIndex();if(state.q)debounce=setTimeout(prepareSearchBodies,280)});
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus();search.select()}if(e.key==='Escape'&&document.activeElement===search){search.value='';state.q='';renderIndex();search.blur()}});
 window.addEventListener('popstate',()=>{let lesson=queryLesson();if(lesson)renderLesson(lesson,false);else{state.active=null;window.ConceptDiagrams?.stopAll();renderIndex()}});
 const theme=document.getElementById('theme-toggle');try{let t=localStorage.getItem('atlas-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}
 theme.onclick=()=>{let dark=document.documentElement.getAttribute('data-theme')==='dark';if(dark)document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme','dark');try{localStorage.setItem('atlas-theme',dark?'light':'dark')}catch(e){}};
}
async function init(){startNav();try{let r=await fetch('./manifest.json',{cache:'no-store'});if(!r.ok)throw Error('目录获取失败：'+r.status);let manifest=await r.json();let lessons=manifest.lessons||[];state.lessons=lessons.map(l=>toLesson(l,l.id,l.file)).filter(Boolean);state.knownGaps=Array.isArray(manifest.missingLessons)?manifest.missingLessons:[];sort();state.initialized=true;updateNav();const id=queryLesson();if(id)await renderLesson(id,false);else renderIndex();refreshFromGithub();}catch(e){app.innerHTML=`<div class="empty">载入失败：${esc(e.message)}<p>请检查网络连接，或直接通过 GitHub 查看课程 Markdown 原文。</p></div>`}}
init();
})();
