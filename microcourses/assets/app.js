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
const state={track:'all',filter:'all',q:'',lessons:[],raw:new Map(),body:new Map(),active:null,fetching:new Map(),searchToken:0,initialized:false};
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
 return {id,track,number,date,week:Number(meta.week)||weekFromNum(number),title,abstract:meta.abstract||meta.summary||'课程正文、推导、示例与练习',minutes:Number(meta.minutes)||16,diagram:meta.diagram||'',file:path||`lessons/${id}.md`,tags:(Array.isArray(meta.tags)?meta.tags:String(meta.tags||'').replace(/^\[/,'').replace(/\]$/,'').split(/\s*,\s*/)).filter(Boolean)};
}
function combine(lesson){if(!lesson)return;const k=state.lessons.findIndex(x=>x.id===lesson.id);if(k<0)state.lessons.push(lesson);else state.lessons[k]={...state.lessons[k],...lesson}}
function sort(){state.lessons.sort((a,b)=>a.date.localeCompare(b.date)||a.track.localeCompare(b.track)||a.number-b.number)}
function queryLesson(){return new URL(location.href).searchParams.get('lesson')}
function urlFor(id){let u=new URL(location.href);if(id)u.searchParams.set('lesson',id);else u.searchParams.delete('lesson');return u.pathname+u.search}
function goHome(track='all',replace=false){state.track=track;state.active=null;state.q='';search.value='';if(window.ConceptDiagrams)window.ConceptDiagrams.stopAll();history[replace?'replaceState':'pushState']({},'',urlFor(null));renderIndex()}
function updateNav(){
 nav.innerHTML='<button class="nav-link" data-track="all"><span class="nav-symbol">⌂</span><span class="nav-main"><b>全部课程</b><small>每日学习总览</small></span><span class="nav-count">'+state.lessons.length+'</span></button>'+TRACKS.map(t=>{let n=state.lessons.filter(l=>l.track===t.id).length;return `<button class="nav-link" data-track="${t.id}"><span class="nav-symbol" style="color:${t.tone}">${esc(t.icon)}</span><span class="nav-main"><b>${esc(t.name)}</b><small>${esc(t.description)}</small></span><span class="nav-count">${n}</span></button>`}).join('');
 nav.querySelectorAll('[data-track]').forEach(n=>n.classList.toggle('active',n.dataset.track===state.track));
}
function courseCards(){return `<div class="section-title"><h2>四条知识路径</h2><span>从基础理论到研究级应用</span></div><div class="course-grid">${TRACKS.map(t=>{let total=state.lessons.filter(l=>l.track===t.id).length;return `<button class="course-box" data-track="${t.id}" style="--tone:${t.tone}"><span class="course-icon">${esc(t.icon)}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><div class="course-foot"><span>${total} 节已归档</span><span>进入学习 ↗</span></div></button>`}).join('')}</div>`}
function lessonRow(l){let t=trackInfo(l.track);return `<button class="lesson-row" data-lesson="${esc(l.id)}"><span class="lesson-no">${String(l.number).padStart(2,'0')}</span><span class="lesson-center"><span class="lesson-meta">${esc(t.name)} · ${esc(l.date)} · 第 ${l.week} 周 · 约 ${l.minutes} 分钟</span><span class="lesson-name">${esc(l.title)}</span><span class="lesson-desc">${esc(l.abstract)}</span></span><span class="tag">已归档</span></button>`}
function matching(){let result=state.lessons.filter(l=>state.track==='all'||l.track===state.track);if(state.filter==='week1')result=result.filter(l=>l.week===1);if(state.filter==='recent')result=result.filter(l=>l.date>='2026-10-21');if(state.q){const q=state.q;result=result.filter(l=>{let hay=[l.title,l.abstract,l.date,'第'+l.number+'课',l.track,trackName(l.track),l.tags.join(' '),(state.body.get(l.id)||'')].join(' ').toLowerCase();return hay.includes(q)})}return result.sort((a,b)=>b.date.localeCompare(a.date)||a.track.localeCompare(b.track)||b.number-a.number)}
function renderIndex(){
 if(!state.initialized)return;state.active=null;updateNav();let current=state.track==='all'?null:trackInfo(state.track),items=matching();crumb.innerHTML='学习地图 <span>/</span> '+(state.q?'搜索结果':current?esc(current.name):'课程总览');
 app.innerHTML=`<section class="hero"><div class="eyebrow">THE DAILY LEARNING ATLAS · EST. 2026</div><h1>${current?esc(current.name):'每天一小步，构建完整知识体系。'}</h1><p>${current?'从基础分析到高级专题，按知识依赖循序推进。每节保留公式推导、数值示例、常见反例与课后练习。':'四门研究生进阶微课，跨设备随时翻阅。不是碎片化知识卡片，而是一套可持续沉淀的课程笔记与交互式学习地图。'}</p><div class="stats"><span class="stat"><strong>4</strong>门课程</span><span class="stat"><strong>${state.lessons.length}</strong>节已归档</span><span class="stat"><strong>12</strong>周学习路径</span><span class="stat">2026.10.20 开课</span></div></section>`+(state.track==='all'&&!state.q?courseCards():'')+`<div class="section-title"><h2>${state.q?'搜索结果':current?'课程目录':'最近更新'}</h2><span>${items.length} 节课程</span></div><div class="filters"><button class="filter ${state.filter==='all'?'active':''}" data-filter="all">全部章节</button><button class="filter ${state.filter==='week1'?'active':''}" data-filter="week1">第一周</button><button class="filter ${state.filter==='recent'?'active':''}" data-filter="recent">最近更新</button></div><div class="lesson-list" style="margin-top:15px">${items.length?items.map(lessonRow).join(''):'<div class="empty">当前没有匹配课程。可以尝试简短关键词，或换一门课。</div>'}</div><div class="notice"><strong>内容说明：</strong>首批 7 节为经整理的复习讲义。以后新增课程可以直接写入 GitHub；网页会自动发现并编入目录。网络异常时会回退到已有索引。课程站点公开可见，个人笔记请勿包含敏感信息。</div>`;
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
function makeToc(){let nodes=[...document.querySelectorAll('.article h2, .article h3')];nodes.forEach((h,i)=>h.id='section-'+(i+1));let toc=document.getElementById('toc');if(!toc)return;toc.innerHTML='<div class="toc-title">本课导航</div>'+nodes.map(n=>`<a href="#${n.id}" class="${n.tagName==='H3'?'sub':''}">${esc(n.textContent)}</a>`).join('');}
async function renderLesson(id,push=true){let lesson=state.lessons.find(l=>l.id===id);if(!lesson)return;if(push)history.pushState({},'',urlFor(lesson.id));state.active=lesson.id;state.track=lesson.track;state.q='';search.value='';updateNav();if(window.ConceptDiagrams)window.ConceptDiagrams.stopAll();let t=trackInfo(lesson.track);crumb.innerHTML='学习地图 <span>/</span> '+esc(t.name)+' <span>/</span> 第 '+lesson.number+' 课';
 const nextprev=sibling(lesson);app.innerHTML='<div class="loading-pane">正在打开课程内容…</div>';
 let raw;try{raw=await lessonText(lesson)}catch(e){if(state.active!==id)return;app.innerHTML='<div class="empty">课程暂时无法加载。<br>'+esc(String(e))+'<br><a href="https://github.com/'+REPO+'/tree/'+BRANCH+'/'+ROOT+'/lessons">可在 GitHub 阅读原文</a></div>';return}
 if(state.active!==id)return;
 const {meta,body}=metaParse(raw),hasDiagram=/\[\[diagram:/.test(body);let text=body;
 if(!hasDiagram&&lesson.diagram&&window.ConceptDiagrams?.types.includes(lesson.diagram)){text=text.replace(/^## /m,'[[diagram:'+lesson.diagram+']]\n\n## ')}
 let article=renderer(text);const contentText=`<section class="reader"><div class="reader-head"><button class="back-link" data-back="${esc(lesson.track)}">← 返回 ${esc(t.name)} 目录</button><div class="eyebrow" style="margin-top:14px;color:${t.tone}">第 ${lesson.week} 周 · ${esc(t.name)}</div><h1>${esc(lesson.title)}</h1><div class="reader-meta"><span>第 ${lesson.number} 课</span><span>${esc(lesson.date)}</span><span>预计 ${lesson.minutes} 分钟</span><span>${meta.kind==='full'?'完整课稿':'重点复习讲义'}</span></div><div class="reader-actions"><button id="copy-link">复制本课链接</button><button id="source-link">查看 Markdown 原文 ↗</button></div></div><div class="reader-layout"><article class="article" id="article">${article}</article><aside class="toc" id="toc"></aside></div><section class="quiz-container" id="quiz-root" data-lesson="${esc(lesson.id)}" aria-label="本课分级测评"></section><div class="reader-pagination"><button data-lesson="${nextprev.prev?.id||''}" ${!nextprev.prev?'disabled':''}>← ${nextprev.prev?'第 '+nextprev.prev.number+' 课':'当前为第一课'}</button><button data-lesson="${nextprev.next?.id||''}" ${!nextprev.next?'disabled':''}>${nextprev.next?'第 '+nextprev.next.number+' 课':'期待下一讲'} →</button></div></section>`;
 app.innerHTML=contentText;makeToc();window.ConceptDiagrams?.mountAll(app);window.ProgressiveQuiz?.mount(document.getElementById("quiz-root"),lesson.id);
 renderMermaid(app);
 if(window.renderMathInElement){try{renderMathInElement(document.getElementById('article'),{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],throwOnError:false,ignoredTags:['script','noscript','style','textarea','pre','code']})}catch(e){}}
 const markdownUrl=`https://github.com/${REPO}/blob/${BRANCH}/${ROOT}/${lesson.file}`;
 document.getElementById('source-link').onclick=()=>window.open(markdownUrl,'_blank','noopener,noreferrer');
 document.getElementById('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);document.getElementById('copy-link').textContent='链接已复制 ✓'}catch(e){window.prompt('复制本课链接',location.href)}};
 window.scrollTo({top:0,behavior:'instant'});
}
async function refreshFromGithub(){
 // GitHub API listing is public; the fallback manifest is always available if API is blocked or rate limited.
 try{const res=await fetch(API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});if(!res.ok)throw Error('GitHub API '+res.status);const files=await res.json();if(!Array.isArray(files))throw Error('Unexpected GitHub listing');let newOnes=[];
 for(const f of files){let m=f.name.match(/^(arch|algo|opt|ai)-(\d{3,})\.md$/);if(!m)continue;let id=f.name.slice(0,-3);if(state.lessons.find(l=>l.id===id))continue;let info=toLesson({},id,'lessons/'+f.name);if(info)newOnes.push(info)}
 // Initial filename metadata is enough for browsing; parse actual front matter for precise title and date.
 await Promise.all(newOnes.map(async l=>{try{const raw=await lessonText(l),parsed=metaParse(raw),heading=parsed.body.match(/^#\s+(.*)$/m);let meta={...parsed.meta};if(!meta.title&&heading)meta.title=heading[1].replace(/^第\s*\d+\s*课[｜|·：:\s]*/,'').trim();combine(toLesson(meta,l.id,l.file))}catch(e){combine(l)}}));
 if(newOnes.length){sort();updateNav();if(!state.active)renderIndex()}
 }catch(e){console.info('课程自动发现暂不可用，已使用静态目录。',String(e))}
}
async function prepareSearchBodies(){let token=++state.searchToken;const missing=state.lessons.filter(l=>!state.body.has(l.id));let pos=0;async function worker(){while(pos<missing.length){let l=missing[pos++];try{await lessonText(l)}catch(e){}if(token!==state.searchToken)return}}
 await Promise.all(Array.from({length:Math.min(6,missing.length)},worker));if(token===state.searchToken&&!state.active)renderIndex()}
function startNav(){
 document.addEventListener('click',e=>{let node=e.target.closest('[data-action],[data-track],[data-filter],[data-lesson],[data-back]');if(!node)return;
 if(node.dataset.action==='home')return goHome();if(node.dataset.track){state.filter='all';return goHome(node.dataset.track)}if(node.dataset.filter){state.filter=node.dataset.filter;return renderIndex()}if(node.dataset.back)return goHome(node.dataset.back);if(node.dataset.lesson)return renderLesson(node.dataset.lesson,true)});
 document.querySelector('.brand').addEventListener('keydown',e=>{if(e.key==='Enter')goHome()});
 let debounce;search.addEventListener('input',()=>{state.q=search.value.trim().toLowerCase();clearTimeout(debounce);if(state.active){state.active=null;history.replaceState({},'',urlFor(null))}renderIndex();if(state.q)debounce=setTimeout(prepareSearchBodies,280)});
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus();search.select()}if(e.key==='Escape'&&document.activeElement===search){search.value='';state.q='';renderIndex();search.blur()}});
 window.addEventListener('popstate',()=>{let lesson=queryLesson();if(lesson)renderLesson(lesson,false);else{state.active=null;window.ConceptDiagrams?.stopAll();renderIndex()}});
 const theme=document.getElementById('theme-toggle');try{let t=localStorage.getItem('atlas-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}
 theme.onclick=()=>{let dark=document.documentElement.getAttribute('data-theme')==='dark';if(dark)document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme','dark');try{localStorage.setItem('atlas-theme',dark?'light':'dark')}catch(e){}};
}
async function init(){startNav();try{let r=await fetch('./manifest.json',{cache:'no-store'});if(!r.ok)throw Error('目录获取失败：'+r.status);let manifest=await r.json();let lessons=manifest.lessons||[];state.lessons=lessons.map(l=>toLesson(l,l.id,l.file)).filter(Boolean);sort();state.initialized=true;updateNav();const id=queryLesson();if(id)await renderLesson(id,false);else renderIndex();refreshFromGithub();}catch(e){app.innerHTML=`<div class="empty">载入失败：${esc(e.message)}<p>请检查网络连接，或直接通过 GitHub 查看课程 Markdown 原文。</p></div>`}}
init();
})();
