const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const base=__dirname,repo=path.resolve(base,'../..'),out=path.resolve(repo,'publication-audit');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),ctx={window:{},console};vm.createContext(ctx);
const files=[...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
const loaded=[],failures=[],tests=[];
for(const file of files){try{cp.execFileSync('node',['--check',path.join(base,file)],{encoding:'utf8'});if(!['reader-v2.js','reader-demos.js','practice-ui.js','course-ui.js'].includes(file)){vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),ctx,{filename:file});loaded.push(file)}}catch(e){failures.push({file,error:String(e)})}}
const D=ctx.window.EDACourse,L=ctx.window.EDALabs,F=ctx.window.EDALessons||{},E=ctx.window.EDAExamples||[],G=ctx.window.EDAGrader;
function test(name,fn){try{fn();tests.push({name,status:'PASS'})}catch(e){tests.push({name,status:'FAIL',error:String(e)});failures.push({test:name,error:String(e)})}}
function native(v){return JSON.parse(JSON.stringify(v))}
test('85 curriculum units and complete source mapping',()=>{assert.equal(D.units.length,85);assert.equal(new Set(D.units.map(u=>u.id)).size,85);assert.equal(D.pageMap.length,807);assert(D.pageMap.every(p=>p.units.length));assert.equal(L.tasks.length,43);assert.equal(L.labs.length,16);assert.equal(D.exams.length,28);assert.equal(D.exams.reduce((s,q)=>s+q.points,0),100);const ids=new Set(D.units.map(u=>u.id));D.units.forEach(u=>u.prerequisites.forEach(p=>assert(ids.has(p))))});
for(const[id,l]of Object.entries(F))test('lecture '+id,()=>{assert(l.html.length>=3000);assert((l.html.match(/<h2[ >]/g)||[]).length>=8);assert.equal(l.quiz.questions.length,4);assert.equal(l.quiz.questions.map(q=>q.level).join(','),'1,2,3,4');assert.equal(l.quiz.questions.map(q=>q.points).join(','),'15,20,25,40');assert.equal(l.quiz.questions[3].type,'open')});
test('unique examples and valid page ranges',()=>{assert.equal(new Set(E.map(e=>e.id)).size,E.length);for(const e of E){assert(D.units.some(u=>u.id===e.unit));assert.equal(e.questions.reduce((s,q)=>s+q.points,0),100);assert.equal(new Set(e.questions.map(q=>q.id)).size,e.questions.length);if(D.decks[e.deck])e.pages.forEach(n=>assert(Number.isInteger(n)&&n>0&&n<=D.decks[e.deck][1],e.id+' invalid page '+n));}});
const all=[...Object.entries(F).flatMap(([id,l])=>l.quiz.questions.map(q=>({id:'lesson:'+id+':'+q.id,q}))),...E.flatMap(e=>e.questions.map(q=>({id:'example:'+e.id+':'+q.id,q})))];
for(const{id,q}of all)test('grading '+id,()=>{
 G.validateQuestion(q);
 if(q.type==='open'){const r=G.grade(q,'A detailed proof is not automatically verified.');assert(r.pending);assert.equal(r.points,0);return}
 let correct,wrong;
 if(q.type==='numeric'){correct=String(q.answer);wrong='';assert(!G.grade(q,'NaN').correct)}
 else if(q.type==='vector'){correct=q.answer.map(String);wrong=q.answer.map((a,i)=>i?'':String(a+1))}
 else if(q.type==='expression'){correct=q.answer;wrong='__unsafe_call()';assert(!G.grade(q,'window.alert(1)').correct)}
 else if(q.type==='single'||q.type==='multi'){correct=q.answer;wrong=[]}
 else if(q.type==='path'){correct=ctx.window.EDARouting.search(q.grid,'bfs').path;wrong=[]}
 else if(q.type==='multiroute'){correct=q.reference_routes;wrong={}}
 else if(q.type==='ip-routing'){correct=G.optimalIP(q).choices[0];wrong=[]}
 else throw Error('Unsupported type '+q.type);
 if(correct!==undefined){const r=G.grade(q,correct);assert(r.correct,id+': '+r.message);assert.equal(r.points,q.points)}else throw Error('Missing reference witness '+id);
 assert(!G.grade(q,wrong).correct,'Wrong/blank answer accepted '+id);
});
test('equivalence accepts different syntax and gives counterexample',()=>{assert(G.equivalence('a & (b | c)','(a&b)|(a&c)',['a','b','c']).correct);const r=G.equivalence('a|b','a^b',['a','b']);assert(!r.correct);assert.equal(r.counterexample.a,1);assert.equal(r.counterexample.b,1);assert.equal(G.number('1/8'),.125);assert.equal(G.number(''),null);assert.equal(G.number('1/0'),null)});
test('independent routing trace regression',()=>{const b=ctx.window.EDARouting.search('R037','bfs'),h=ctx.window.EDARouting.search('R037','hadlock'),a=ctx.window.EDARouting.search('R037','astar');assert.deepEqual(native([b.length,b.expanded,b.discovered]),[13,156,168]);assert.deepEqual(native([h.cost,h.length,h.expanded,h.discovered]),[1,13,28,42]);assert.deepEqual(native([a.length,a.expanded,a.discovered]),[13,19,35]);const e=E.find(e=>e.id==='R064');if(e){const q=e.questions.find(q=>q.type==='ip-routing');assert.equal(G.optimalIP(q).cost,6);assert(G.grade(q,[0,0,0]).correct);assert(G.grade(q,[0,0,1]).correct)}});
const missing=D.units.filter(u=>!F[u.id]).map(u=>u.id);let checkpoint={};try{checkpoint=JSON.parse(fs.readFileSync(path.join(base,'publication-checkpoint.json'),'utf8'))}catch(e){}if(checkpoint.require_complete)test('all 85 complete',()=>assert.equal(missing.length,0,missing.join(',')));
const report={version:1,commit:process.env.GITHUB_SHA||'local',checked_at:new Date().toISOString(),source_commit:D.sourceCommit,status:failures.length?'FAIL':missing.length?'VALID_PARTIAL':'PASS',full_lessons:Object.keys(F).sort(),full_count:Object.keys(F).length,missing,source_pages:D.pageMap.length,example_groups:E.length,example_questions:E.reduce((s,e)=>s+e.questions.length,0),lesson_questions:Object.values(F).reduce((s,l)=>s+l.quiz.questions.length,0),objective:all.filter(x=>x.q.type!=='open').length,manual:all.filter(x=>x.q.type==='open').length,tasks:L.tasks.length,loaded,failures,tests};
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'content.json'),JSON.stringify({curriculum:D,labs:L,lessons:F,examples:E,grids:ctx.window.EDAGrids,practice:ctx.window.EDAPractice},null,2));console.log(JSON.stringify({...report,tests:tests.length,loaded:loaded.length},null,2));if(failures.length)process.exitCode=1;
