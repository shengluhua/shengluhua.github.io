'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const W=require('./load-course')(),{EDACourse:D,EDALessons:F,EDALabs:L,EDAExamples:E,EDAAnimations:A}=W;
const dir=path.join(__dirname,'../microcourses/eda');
test('all 85 authored lectures are actually linked and evaluated',()=>{
 assert.equal(D.units.length,85);assert.equal(new Set(D.units.map(u=>u.id)).size,85);assert.equal(Object.keys(F).length,85);
 for(const u of D.units){const l=F[u.id];assert(l,u.id);assert.equal(u.status,'full_ready');assert(l.html.length>=3000,u.id);assert((l.html.match(/<h2[ >]/g)||[]).length>=8,u.id);assert(l.html.includes(u.id));assert.equal(l.quiz.questions.length,4);assert.equal(l.quiz.questions.map(q=>q.points).join(','),'15,20,25,40');assert(l.quiz.questions.every(q=>q.prompt&&q.hint));assert(l.quiz.questions[3].rubric.length>=3);assert(l.quiz.questions[3].model_answer);for(const p of u.prerequisites)assert(F[p],u.id+' prerequisite '+p);}
});
test('all material page keys and real task/exam identities remain intact',()=>{
 assert.equal(D.pageMap.length,807);assert.equal(new Set(D.pageMap.map(p=>p.path+'#'+p.page)).size,807);
 for(const [p,n]of Object.values(D.decks)){const pages=D.pageMap.filter(x=>x.path===p);assert.equal(pages.length,n);for(let i=1;i<=n;i++){const pg=pages.find(x=>x.page===i);assert(pg&&pg.units.length,p+' '+i);pg.units.forEach(id=>assert(F[id]));}}
 assert.equal(L.tasks.length,43);assert.equal(new Set(L.tasks.map(t=>t.id)).size,43);assert.equal(L.labs.length,16);assert.equal(D.exams.length,28);assert.equal(D.exams.reduce((s,q)=>s+q.points,0),100);
 for(const u of D.units)for(const s of u.sources)if(s.pages){const deck=Object.values(D.decks).find(d=>d[0]===s.path);assert(deck);assert(s.pages[0]>=1&&s.pages.at(-1)<=deck[1]);}
 assert(L.labs.find(l=>l.id==='L04').trace.includes('24n'));assert(L.labs.find(l=>l.id==='L13').trace.includes('不发token'));assert(!L.labs.find(l=>l.id==='L16').commands.includes('python -m microllm.benchmarks.grader'));
});
test('source-preserving examples and genuine additions are separately traceable',()=>{
 assert.equal(new Set(E.map(e=>e.id)).size,E.length);const src=E.filter(e=>e.origin==='source'),ext=E.filter(e=>e.origin!=='source');assert(src.length>=87+30+28);assert(ext.length>85,'need transfer variants beyond only four-level checks');
 for(const e of E){assert(F[e.unit],e.id);assert(e.deck&&e.pages&&e.source_note&&e.stem,e.id);assert.equal(e.questions.reduce((s,q)=>s+q.points,0),100,e.id);assert.equal(new Set(e.questions.map(q=>q.id)).size,e.questions.length,e.id);for(const q of e.questions){assert(q.prompt&&q.hint,e.id);if(q.type!=='open')assert(q.explanation||e.solution,e.id);else assert(q.rubric.length&&q.model_answer,e.id);}}
 for(const key of Object.keys(D.decks))assert(src.some(e=>e.deck===key||e.deck===D.decks[key][0]),'no source examples for '+key);
 for(let i=1;i<=28;i++)assert(E.find(e=>e.id==='EX'+String(i).padStart(2,'0')),'missing exam '+i);
 assert.equal(E.filter(e=>e.category==='lesson-check').length,85);
});
test('each non-exam unit has a distinct targeted model or an original tested built-in',()=>{
 assert.equal(new Set(A.registry.map(m=>m.id)).size,A.registry.length);const builtin=new Set(['T03','L06']);
 for(const u of D.units.filter(u=>u.track!=='exam'))assert(builtin.has(u.id)||A.registry.some(m=>m.unit===u.id),'No model for '+u.id);
 for(const m of A.test()){assert.equal(m.status,'PASS',JSON.stringify(m));assert(m.checks.length>=1,m.id);}
 const logic=new Set(A.registry.map(m=>m.model.toString()));assert.equal(logic.size,A.registry.length,'A repeated compute function is not a new instructional mechanism');
});
test('public assets are self-contained and do not include private source bodies',()=>{
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');assert(!/https?:\/\/[^"']+\.js/.test(html),'external JS dependency');for(const file of W._scripts)assert(fs.existsSync(path.join(dir,file)),file);
 assert(W._scripts.includes('assessment-engine.js'));assert(W._scripts.includes('animations-core.js'));assert(W._scripts.indexOf('assessment-engine.js')<W._scripts.indexOf('examples-ui.js'));assert(W._scripts.indexOf('routing-data.js')<W._scripts.indexOf('animations-core.js'));
 for(const f of fs.readdirSync(dir)){assert(!/\.(pdf|pptx|sqlite|nsys-rep|ncu-rep)$/.test(f),f+' private original');if(f.endsWith('.js')||f.endsWith('.html')){const s=fs.readFileSync(path.join(dir,f),'utf8');assert(!/10\.129\.167\.74|gh[pousr]_[A-Za-z0-9]{20,}/.test(s),f+' sensitive material');}}
});
// JSON output is a checkable snapshot, not a claim of semantic or GPU verification.
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/content.json',JSON.stringify({sourceCommit:D.sourceCommit,units:D.units,lessons:F,examples:E,animations:A.test()},null,2));
