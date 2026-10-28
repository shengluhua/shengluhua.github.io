/* Pure model + every-frame renderer audit. Browser interaction remains a separate check. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),base=path.join(root,'microcourses','eda'),out=process.env.EDA_ANIMATION_QA_DIR||path.join(root,'test-results','animations');
const ctx={window:{},console};vm.createContext(ctx);const load=f=>vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx,{filename:f});
for(const f of ['course-data.js','routing-data.js','animations-core.js'])load(f);
// Capture model-specific pure compute/render configuration without creating a DOM.
ctx.window.EDAAnimations.helpers.player=(_host,cfg)=>cfg;
for(const f of fs.readdirSync(base).filter(f=>/^animations-(?!core\.js$).*\.js$/.test(f)).sort())load(f);
const A=ctx.window.EDAAnimations,checks=A.test();
assert(checks.every(c=>c.status==='PASS'),JSON.stringify(checks.filter(c=>c.status!=='PASS')));
const reports=[];
for(const d of A.registry){const cfg=d.mount(null),defaults=Object.fromEntries(cfg.inputs.map(x=>[x.key,x.value])),cases=[{name:'default',v:defaults}];
 for(const input of cfg.inputs){const values=input.type==='select'?input.options.map(o=>Array.isArray(o)?o[0]:o):input.type==='checkbox'?[false,true]:[input.min,input.max].filter(v=>v!==undefined);for(const value of values)cases.push({name:input.key+'='+value,v:{...defaults,[input.key]:value}})}
 let frames=0,defaultFrames=0;const defaultVisuals=new Set();for(const c of cases){const data=cfg.compute(c.v),ss=data.frames||data;assert(ss.length>0,d.id+' missing states');for(let i=0;i<ss.length;i++){const html=cfg.render(ss[i],data,i);assert(typeof html==='string'&&html.length>30,d.id+' empty render');assert(!/(?:[>=:：]|\s)(?:NaN|undefined)(?=[<\s,，；;]|$)/.test(html),d.id+' invalid display '+c.name);if(c.name==='default'){defaultFrames++;defaultVisuals.add(html)}frames++}}
 reports.push({id:d.id,unit:d.unit,title:d.title,concept:d.concept,source:d.source||ctx.window.EDACourse.units.find(u=>u.id===d.unit).sources,model:d.model.name,cases:cases.length,rendered_frames:frames,default_frames:defaultFrames,default_unique_visual_frames:defaultVisuals.size,tests:checks.find(c=>c.id===d.id).checks,status:defaultVisuals.size>1?'PASS':'FAIL'});
}
const units=Array.from(new Set(reports.map(r=>r.unit))).sort();for(let i=1;i<=40;i++){const id='T'+String(i).padStart(2,'0');if(id!=='T03')assert(units.includes(id),'No new animation for '+id)}
fs.mkdirSync(out,{recursive:true});const report={stage:'pure-model-and-renderer-not-browser',status:reports.every(r=>r.status==='PASS')?'PASS':'FAIL',animations:reports.length,covered_units:units,frames:reports.reduce((s,r)=>s+r.rendered_frames,0),cases:reports.reduce((s,r)=>s+r.cases,0),matrix:reports};fs.writeFileSync(path.join(out,'models-matrix.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,animations:report.animations,cases:report.cases,frames:report.frames,output:path.join(out,'models-matrix.json')},null,2));

// The transport's counter alone is not an animation: the default model must
// visibly explain at least two different states. Boundary variants may validly
// contain one state (for example N=0), so this requirement is default-only.
assert(reports.every(r=>r.default_unique_visual_frames>1),'Default animation frames never visibly change: '+JSON.stringify(reports.filter(r=>r.default_unique_visual_frames<=1).map(r=>({id:r.id,frames:r.default_frames,unique:r.default_unique_visual_frames}))));
