"""Production-route assessment QA. Run in GitHub Actions or a browser-capable executor.

BASE_URL=http://127.0.0.1:8765/microcourses/eda/ python tests/assessment-browser.py

Every authored group is exercised with correct, wrong and blank objective inputs at
1024x768. All groups are rendered for overflow at 390x844, 768x1024 and 1024x768;
each question type also receives real Playwright input/click actions at each size.
Reference data is obtained from the loaded production app; answers are entered
through DOM controls, never by calling the grading function to submit an answer.
The separate Node tests independently check the grader's validation boundaries.
"""
from __future__ import annotations
import json, os, traceback
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright

BASE=os.environ.get('BASE_URL','http://127.0.0.1:8765/microcourses/eda/')
OUT=Path(os.environ.get('ASSESSMENT_QA_OUT','test-results/assessment'));OUT.mkdir(parents=True,exist_ok=True)
VIEWPORTS=[(1024,768),(768,1024),(390,844)]
REPORT={'base_url':BASE,'status':'RUNNING','exhaustive_groups':[],'viewports':[],'flow_tests':[],'errors':[]}

def write_report():
    (OUT/'results.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))

def num(x):
    return str(int(x)) if float(x).is_integer() else str(x)

# This helper reads actual loaded data and constructs known references and
# intentionally wrong inputs. It does not mutate app answers or submit forms.
REFERENCE_JS=r"""() => {
const E=window.EDAExampleEngine;
function expression(q,invert=false){
 const tree=E.parseExpression(q.answer,q.variables).ast;
 const allow=new Set(q.allowedOperators||['and','or','xor','not']);
 const not=a=>allow.has('not')?'!('+a+')':allow.has('xor')?'(1^('+a+'))':(()=>{throw Error('No complement basis')})();
 const and=(a,b)=>allow.has('and')?'(('+a+')&('+b+'))':allow.has('or')?not('('+not(a)+')|('+not(b)+')'):(()=>{throw Error('No AND basis')})();
 const or=(a,b)=>allow.has('or')?'(('+a+')|('+b+'))':allow.has('not')&&allow.has('and')?not(and(not(a),not(b))):allow.has('xor')&&allow.has('and')?'(('+a+')^('+b+')^'+and(a,b)+')':(()=>{throw Error('No OR basis')})();
 const xor=(a,b)=>allow.has('xor')?'(('+a+')^('+b+'))':or(and(a,not(b)),and(not(a),b));
 function emit(n){if(n.op==='var'||n.op==='const')return String(n.value);if(n.op==='not')return not(emit(n.arg));return({and,or,xor})[n.op](emit(n.left),emit(n.right))}
 const result=emit(tree);return invert?not(result):result;
}
function segment(vertices){const out=[vertices[0]];for(let i=1;i<vertices.length;i++){let [r,c]=out[out.length-1];const t=vertices[i];if(r!==t[0]&&c!==t[1])throw Error('Non-Manhattan fixture');while(r!==t[0]||c!==t[1]){r+=Math.sign(t[0]-r);c+=Math.sign(t[1]-c);out.push([r,c])}}return out;}
function selections(q){let combinations=[[]];q.candidates.forEach(cs=>combinations=combinations.flatMap(a=>cs.map((_,i)=>a.concat(i))));return combinations;}
function independentPath(q){const g=window.EDAGrids[q.grid],starts=g.sources||[g.start],queue=starts.map(x=>x.slice()),seen=new Map(starts.map(x=>[x.join(','),null]));for(let at=0;at<queue.length;at++){const p=queue[at],key=p.join(',');if(key===g.target.join(',')){const path=[];for(let k=key;k!==null;k=seen.get(k))path.push(k.split(',').map(Number));return path.reverse()}for(const [dr,dc]of [[0,1],[1,0],[0,-1],[-1,0]]){const r=p[0]+dr,c=p[1]+dc,k=r+','+c;if(r>=0&&r<g.rows.length&&c>=0&&c<g.rows[0].length&&g.rows[r][c]!=='#'&&!seen.has(k)){seen.set(k,key);queue.push([r,c])}}}throw Error('No independent BFS path '+q.grid)}
function candidateFacts(q,a){const loads=Array(q.edges.length).fill(0);let cost=0;for(let k=0;k<a.length;k++){const c=q.candidates[k][a[k]];cost+=c.cost;for(const edge of c.edges)loads[q.edges.indexOf(edge)]++}return{cost,feasible:loads.every((x,i)=>x<=q.capacities[i])}}
function reference(q){switch(q.type){case'open':return '';case'expression':return expression(q);case'path':return independentPath(q);case'multiroute':if(q.grid!=='R059')throw Error('New multiroute requires an independent feasible fixture: '+q.grid);return {a:segment([[0,7],[0,8],[6,8],[6,0],[2,0],[2,3]]),b:segment([[2,7],[2,4],[5,4],[5,7]])};case'ip-routing':{const valid=selections(q).filter(a=>candidateFacts(q,a).feasible),best=Math.min(...valid.map(a=>candidateFacts(q,a).cost));if(best!==q.optimal_cost)throw Error('Declared route optimum is wrong');return valid.find(a=>candidateFacts(q,a).cost===best);}default:return q.answer;}}
function incorrect(q,correct){switch(q.type){case'open':return '';case'numeric':{const delta=Math.max(Math.abs(q.answer)*0.2,1,4*(q.tolerance||0));return Number.isFinite(q.answer+delta)?q.answer+delta:0;}case'vector':return q.answer.map((x,i)=>i?x:x+Math.max(Math.abs(x)*0.2,1,4*(q.tolerance||0)));case'expression':return expression(q,true);case'single':return (q.answer+1)%q.options.length;case'multi':{if(q.answer.length>1)return q.answer.slice(0,-1);const off=q.options.map((_,i)=>i).find(i=>!q.answer.includes(i));return off===undefined?[]:[off];}case'path':return [correct[0]];case'multiroute':return Object.fromEntries(Object.entries(correct).map(([k,path])=>[k,[path[0]]]));case'ip-routing':return selections(q).find(a=>{const f=candidateFacts(q,a);return !f.feasible||f.cost!==q.optimal_cost});}}
return window.EDAExamples.map(e=>({id:e.id,unit:e.unit,category:e.category||'',questions:e.questions.map(q=>{const right=reference(q),wrong=incorrect(q,right);if(q.type!=='open'){if(wrong===undefined||wrong===null)throw Error('No wrong fixture '+e.id+'/'+q.id);if(!E.grade(q,right).correct)throw Error('Invalid reference '+e.id+'/'+q.id);if(E.grade(q,wrong).correct)throw Error('Wrong fixture accidentally correct '+e.id+'/'+q.id);}return{id:q.id,type:q.type,points:q.points,labels:q.labels,options:q.options,right,wrong};}),objectiveMax:e.questions.filter(q=>q.type!=='open').reduce((s,q)=>s+q.points,0)}));
}"""

def go(page,eid):
    page.goto(BASE+'#example='+quote(eid),wait_until='domcontentloaded')
    form=page.locator(f'[data-example-form="{eid}"]')
    form.wait_for(state='visible')
    return form

def reset(form):
    form.locator('[data-example-reset]').click()

def fill_question(form,q,answer):
    qid=q['id'];kind=q['type']
    if kind=='open':return
    if kind in ('numeric','expression'):
        form.locator(f'[data-answer="{qid}"]').fill(num(answer) if isinstance(answer,(int,float)) else answer)
    elif kind=='vector':
        for i,value in enumerate(answer):form.locator(f'[data-answer="{qid}"][data-vector-index="{i}"]').fill(num(value))
    elif kind=='single':
        form.locator(f'[data-answer="{qid}"][value="{answer}"]').check()
    elif kind=='multi':
        for value in answer:form.locator(f'[data-answer="{qid}"][value="{value}"]').check()
    elif kind=='path':
        for r,c in answer:form.locator(f'[data-path="{qid}"] [data-cell="{r},{c}"]').click()
    elif kind=='multiroute':
        for net,route in answer.items():
            for r,c in route:form.locator(f'[data-path="{qid}"][data-net="{net}"] [data-cell="{r},{c}"]').click()
    elif kind=='ip-routing':
        for i,value in enumerate(answer):form.locator(f'[data-answer="{qid}"][data-route-index="{i}"][value="{value}"]').check()
    else:raise AssertionError('Unhandled question type '+kind)

def submit(form):
    form.locator('button[type="submit"]').click()

def assert_score(form,score,maximum):
    expected=f'自动判分：{num(score)} / {num(maximum)}'
    assert expected in form.locator('[data-example-score]').inner_text(),(expected,form.locator('[data-example-score]').inner_text())

def assert_no_overflow(page,eid,viewport):
    dimensions=page.evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})')
    assert dimensions['scroll']<=dimensions['width']+1,(eid,viewport,dimensions)

def exercise_group(page,group,all_phases=True):
    form=go(page,group['id']);reset(form)
    assert form.locator('.example-explanation').count()==0
    if all_phases:
        submit(form);assert_score(form,0,group['objectiveMax'])
        assert form.locator('.example-explanation').count()==0,'Blank submission leaked explanation: '+group['id']
    for q in group['questions']:fill_question(form,q,q['right'])
    submit(form);assert_score(form,group['objectiveMax'],group['objectiveMax'])
    objective_count=sum(q['type']!='open' for q in group['questions'])
    assert form.locator('.example-feedback.correct').count()==objective_count,group['id']
    if not any(q['type']=='open' for q in group['questions']):assert form.locator('.example-solution').count()==1
    if all_phases:
        go(page,'B011' if group['id']=='R032' else 'R032');form=go(page,group['id'])
        assert_score(form,group['objectiveMax'],group['objectiveMax'])
        assert form.locator('.example-feedback.correct').count()==objective_count,group['id']+' navigation recovery'
        submit(form);assert_score(form,group['objectiveMax'],group['objectiveMax'])
        reset(form)
        for q in group['questions']:fill_question(form,q,q['wrong'])
        submit(form);assert_score(form,0,group['objectiveMax'])
        assert form.locator('.example-feedback.correct').count()==0,'Wrong fixture passed: '+group['id']
        reset(form)
        assert '尚未提交' in form.locator('[data-example-score]').inner_text()
        assert form.locator('.example-explanation,.example-solution').count()==0
        assert page.evaluate('(id)=>{const e=EDAExamples.find(e=>e.id===id),s=EDAExampleUI.state(e);return !s.submitted&&Object.keys(s.answers).length===0}',group['id'])
    return {'id':group['id'],'objective_questions':objective_count,'open_questions':len(group['questions'])-objective_count,'objective_max':group['objectiveMax'],'correct':'PASS','wrong':'PASS' if all_phases else 'covered in exhaustive viewport','blank':'PASS' if all_phases else 'covered in exhaustive viewport','repeat_submit':'PASS' if all_phases else 'covered in exhaustive viewport','navigation_and_reset':'PASS' if all_phases else 'covered in exhaustive viewport'}

def manual_and_recovery(page,groups):
    group=next(g for g in groups if any(q['type']=='open' for q in g['questions']))
    q=next(q for q in group['questions'] if q['type']=='open');form=go(page,group['id']);reset(form)
    text=form.locator(f'[data-answer="{q["id"]}"]');text.fill('测试用独立推导：列明假设、逐步计算、结论和边界。')
    submit(form);manual=form.locator(f'[data-question="{q["id"]}"] .example-manual');manual.wait_for()
    assert '机器未判断' in form.inner_text()
    marks=manual.locator('[data-manual]');maximum=float(marks.first.get_attribute('max'))
    marks.first.fill(num(maximum+1));assert marks.first.get_attribute('aria-invalid')=='true'
    assert '自报人工分：0 /' in form.locator('[data-example-score]').inner_text()
    for i in range(marks.count()):marks.nth(i).fill(marks.nth(i).get_attribute('max'))
    page.reload(wait_until='domcontentloaded');form=page.locator(f'[data-example-form="{group["id"]}"]');form.wait_for(state='visible')
    assert form.locator('[data-manual]').first.input_value()==num(maximum)
    form.locator(f'[data-answer="{q["id"]}"]').fill('修改后的新推导，必须重新评阅。')
    assert form.locator('.example-manual').count()==0
    assert '原分数已失效' in form.inner_text()
    go(page,'R032');form=go(page,group['id'])
    assert form.locator(f'[data-answer="{q["id"]}"]').input_value()=='修改后的新推导，必须重新评阅。'
    reset(form);assert form.locator(f'[data-answer="{q["id"]}"]').input_value()==''
    REPORT['flow_tests'].append({'name':'open rubric, upper bound, reload, edit invalidation, navigation and reset','status':'PASS'})
    form=go(page,'R032');reset(form);path=form.locator('[data-path="q1"]')
    path.locator('[data-cell="2,2"]').click();assert '指定源格' in path.inner_text()
    path.locator('[data-cell="0,0"]').click();path.locator('[data-cell="0,2"]').click();assert '上下左右相邻' in path.inner_text()
    path.locator('[data-cell="0,1"]').click()
    assert page.evaluate('document.activeElement.dataset.cell')=='0,1','Path redraw lost keyboard focus'
    path.locator('[data-path-undo]').click();assert path.locator('.chosen').count()==1
    page.reload(wait_until='domcontentloaded');form=page.locator('[data-example-form="R032"]');assert form.locator('.chosen').count()==1
    form.locator('[data-path-clear]').click();assert form.locator('.chosen').count()==0
    REPORT['flow_tests'].append({'name':'path invalid start/jump, keyboard focus, undo, reload and clear','status':'PASS'})

def legacy_quick_checks(page):
    for uid in ['T03','G14','L04','Q1']:
        if uid.startswith('Q'):
            page.goto(BASE+'#exam='+uid[1:]);page.locator('[data-practice-form="'+uid+'"]').wait_for(state='visible')
        else:
            page.goto(BASE+'#lesson='+uid);page.locator('[data-example="CHECK-'+uid+'"]').wait_for()
            page.get_by_text('原版快速知识检查 · 保留此前作答',exact=True).click()
        form=page.locator('[data-practice-form="'+uid+'"]')
        if form.locator('[data-practice-retry]').count():form.locator('[data-practice-retry]').click()
        for _ in range(2):form.locator('button[type=submit]').click()
        assert '空白不能计为正确' in form.inner_text()
        assert form.locator('.practice-feedback').count()==0
        q=page.evaluate('(id)=>EDAPractice.bank[id]',uid)
        form.locator('input[value="'+str((q['answer']+1)%len(q['options']))+'"]').check();form.locator('button[type=submit]').click()
        assert '0 / 10' in form.locator('.practice-feedback').inner_text()
        form.locator('[data-practice-retry]').click();assert form.locator('input:checked').count()==0
        form.locator('input[value="'+str(q['answer'])+'"]').check();form.locator('button[type=submit]').click()
        assert '10 / 10' in form.locator('.practice-feedback').inner_text()
        page.reload(wait_until='domcontentloaded')
        if not uid.startswith('Q'):page.get_by_text('原版快速知识检查 · 保留此前作答',exact=True).click()
        form=page.locator('[data-practice-form="'+uid+'"]');form.wait_for(state='visible')
        assert '10 / 10' in form.locator('.practice-feedback').inner_text()
        form.locator('[data-practice-retry]').click();assert '尚未提交' in form.inner_text()
        assert page.evaluate('(id)=>JSON.parse(localStorage.getItem("eda-practice-v2-"+id))',uid)=={}
    REPORT['flow_tests'].append({'name':'original quick checks theory/GPU/lab/exam: repeated blank, wrong/correct, reload and reset','status':'PASS'})

def storage_flows(browser,groups):
    # Old reader-v2 stores positional answers, including one-element arrays for
    # single choice. Import all nine types through actual production routes.
    representatives={}
    for g in groups:
        for q in g['questions']:representatives.setdefault(q['type'],(g,q))
    selected={g['id']:g for g,q in representatives.values()}
    seeds={}
    for g in selected.values():
        answers={str(i):([q['right']] if q['type']=='single' else '旧版开放推导草稿' if q['type']=='open' else q['right']) for i,q in enumerate(g['questions'])}
        manual={str(i):17 for i,q in enumerate(g['questions']) if q['type']=='open'}
        seeds['eda-v2-attempt:example:'+g['id']]=json.dumps({'answers':answers,'manual':manual,'automatic_score':100,'automatic_max':100},ensure_ascii=False)
    context=browser.new_context()
    context.add_init_script('const seeds='+json.dumps(seeds,ensure_ascii=False)+';for(const [k,v]of Object.entries(seeds))localStorage.setItem(k,v);localStorage.setItem("unrelated-private-test","must not be exported");')
    page=context.new_page();page.set_default_timeout(15000)
    for kind,(g,q) in representatives.items():
        form=go(page,g['id'])
        assert '旧版作答已作为草稿迁移' in page.locator('[data-progress-history]').inner_text()
        assert '尚未提交' in form.locator('[data-example-score]').inner_text()
        assert form.locator('.example-feedback.correct,.example-manual').count()==0
        if kind=='single':assert form.locator(f'[data-answer="{q["id"]}"][value="{q["right"]}"]').is_checked()
        elif kind=='multi':assert sorted(form.locator(f'[data-answer="{q["id"]}"]:checked').evaluate_all('xs=>xs.map(x=>Number(x.value))'))==sorted(q['right'])
        elif kind=='vector':assert [form.locator(f'[data-answer="{q["id"]}"][data-vector-index="{i}"]').input_value() for i in range(len(q['right']))]==[num(x) for x in q['right']]
        elif kind=='path':assert form.locator(f'[data-path="{q["id"]}"] .chosen').count()==len(q['right'])
        elif kind=='multiroute':
            for net,route in q['right'].items():assert form.locator(f'[data-path="{q["id"]}"][data-net="{net}"] .chosen').count()==len(route)
        elif kind=='ip-routing':
            for i,value in enumerate(q['right']):assert form.locator(f'[data-answer="{q["id"]}"][data-route-index="{i}"][value="{value}"]').is_checked()
        else:assert form.locator(f'[data-answer="{q["id"]}"]').input_value()==('旧版开放推导草稿' if kind=='open' else num(q['right']) if kind=='numeric' else q['right'])
        if kind=='open':assert '旧版人工总分（仅历史参考）' in page.locator('[data-progress-history]').inner_text()
    exported=page.evaluate('EDAExampleUI.exportProgress()')
    assert 'unrelated-private-test' not in exported['storage']
    for key,raw in seeds.items():assert exported['storage'][key]==raw
    reset(form);page.reload(wait_until='domcontentloaded');form=page.locator(f'[data-example-form="{g["id"]}"]');form.wait_for(state='visible')
    assert page.evaluate('(id)=>Object.keys(EDAExampleUI.state(EDAExamples.find(e=>e.id===id)).answers).length',g['id'])==0
    assert '尚未提交' in form.locator('[data-example-score]').inner_text()
    context.close();REPORT['flow_tests'].append({'name':'reader-v2 nine-type positional migration, old manual-score isolation, reset/reload and privacy-scoped export','status':'PASS'})
    for uid in ['T03','Q1']:
        key='eda-v2-attempt:practice:'+uid
        raw=json.dumps({'answers':{'0':[0]},'automatic_score':10,'automatic_max':10})
        context=browser.new_context();context.add_init_script('localStorage.setItem('+json.dumps(key)+','+json.dumps(raw)+');')
        page=context.new_page();page.goto(BASE+('#exam='+uid[1:] if uid.startswith('Q') else '#lesson='+uid),wait_until='networkidle')
        if not uid.startswith('Q'):page.get_by_text('原版快速知识检查 · 保留此前作答',exact=True).click()
        form=page.locator('[data-practice-form="'+uid+'"]')
        assert form.locator('input[value="0"]').is_checked()
        assert '已恢复旧版作答草稿，旧分数不沿用' in form.inner_text()
        assert '尚未提交' in form.inner_text() and form.locator('.practice-feedback').count()==0
        form.locator('button[type=submit]').click();form.locator('[data-practice-retry]').click()
        page.reload(wait_until='domcontentloaded')
        if not uid.startswith('Q'):page.get_by_text('原版快速知识检查 · 保留此前作答',exact=True).click()
        form=page.locator('[data-practice-form="'+uid+'"]');form.wait_for(state='visible')
        assert form.locator('input:checked').count()==0 and '尚未提交' in form.inner_text()
        assert page.evaluate('(k)=>localStorage.getItem(k)',key)==raw
        context.close()
    REPORT['flow_tests'].append({'name':'reader-v2 quick-check lesson/exam draft migration discards old score and honors reset after reload','status':'PASS'})
    context=browser.new_context()
    context.add_init_script("if(!localStorage.getItem('eda-practice-v2-T03'))localStorage.setItem('eda-practice-v2-T03',JSON.stringify({choice:0,submitted:true}));")
    page=context.new_page();page.goto(BASE+'#lesson=T03',wait_until='networkidle')
    page.get_by_text('原版快速知识检查 · 保留此前作答',exact=True).click()
    assert '10 / 10' in page.locator('[data-practice-form="T03"] .practice-feedback').inner_text()
    page.locator('[data-practice-retry="T03"]').click();page.reload(wait_until='domcontentloaded')
    page.get_by_text('原版快速知识检查 · 保留此前作答',exact=True).click()
    assert '尚未提交' in page.locator('[data-practice-form="T03"]').inner_text()
    context.close();REPORT['flow_tests'].append({'name':'pre-existing original quick-check record and reset survive upgrade/reload','status':'PASS'})
    # Disposable test contexts: no user data or public production answer is changed.
    context=browser.new_context();context.add_init_script("localStorage.setItem('eda-answers-T03',JSON.stringify({q1:['1'],q2:'4',q3:['0','2'],q4:'旧草稿保留'}));")
    page=context.new_page();form=go(page,'CHECK-T03')
    assert form.locator('[data-answer="q1"][value="1"]').is_checked()
    assert form.locator('[data-answer="q2"]').input_value()=='4'
    assert form.locator('[data-answer="q4"]').input_value()=='旧草稿保留'
    assert '尚未提交' in form.inner_text()
    reset(form);assert form.locator('[data-answer="q2"]').input_value()==''
    assert page.evaluate("JSON.parse(localStorage.getItem('eda-answers-T03')).q2")=='4'
    context.close();REPORT['flow_tests'].append({'name':'legacy draft migration without score and without deleting old store','status':'PASS'})
    context=browser.new_context();context.add_init_script("localStorage.setItem('eda-examples-v1-B011','{broken');")
    page=context.new_page();form=go(page,'B011');assert form.locator('[data-answer="b"]').input_value()==''
    form.locator('[data-answer="b"]').fill('<img src=x onerror=alert(1)>');go(page,'R032');form=go(page,'B011');assert form.locator('img').count()==0
    assert form.locator('[data-answer="b"]').input_value()=='<img src=x onerror=alert(1)>'
    context.close();REPORT['flow_tests'].append({'name':'corrupt storage recovery and escaped draft rendering','status':'PASS'})
    context=browser.new_context();context.add_init_script("Storage.prototype.setItem=function(){throw new Error('QA blocked storage')};")
    page=context.new_page();form=go(page,'B016');form.locator('[data-answer="a"]').fill('32');form.locator('[data-answer="b"]').fill('4294967296');submit(form)
    assert_score(form,60,60);assert '浏览器阻止了本地保存' in form.inner_text()
    context.close();REPORT['flow_tests'].append({'name':'storage denied still grades in memory and reports persistence limit','status':'PASS'})

def main():
    with sync_playwright() as p:
        launch={}
        if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
        browser=p.chromium.launch(**launch)
        page=browser.new_page(viewport={'width':1024,'height':768},has_touch=True)
        page.set_default_timeout(15000)
        errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
        page.on('response',lambda r:errors.append('HTTP '+str(r.status)+' '+r.url) if r.status>=400 else None)
        page.goto(BASE,wait_until='networkidle')
        page.wait_for_function('window.EDAExamples && window.EDAExampleEngine && window.EDAExampleUI')
        groups=page.evaluate(REFERENCE_JS)
        assert len(groups)>=87,'Question bank unexpectedly shrank'
        REPORT['question_groups']=len(groups);REPORT['questions']=sum(len(g['questions']) for g in groups)
        for i,g in enumerate(groups):
            REPORT['exhaustive_groups'].append(exercise_group(page,g))
            if i%10==0:print(f'Validated {i+1}/{len(groups)} groups',flush=True);write_report()
        manual_and_recovery(page,groups)
        # Each type gets genuine control interaction on every viewport. Every group
        # is additionally rendered and checked for page overflow at that viewport.
        representatives={}
        for g in groups:
            for q in g['questions']:
                representatives.setdefault(q['type'],g)
        for width,height in VIEWPORTS:
            page.set_viewport_size({'width':width,'height':height})
            checked=set()
            for kind,g in representatives.items():
                if g['id'] not in checked:exercise_group(page,g,all_phases=False);checked.add(g['id'])
                else:go(page,g['id'])
                if kind=='open':
                    form=page.locator(f'[data-example-form="{g["id"]}"]')
                    oq=next(q for q in g['questions'] if q['type']=='open')
                    form.locator(f'[data-answer="{oq["id"]}"]').fill('视口交互检查：给出推导、条件和结论，待人工评阅。')
                    submit(form)
                    mark=form.locator('[data-manual]').first
                    mark.fill(mark.get_attribute('max'))
                    assert '自报人工分' in form.locator('[data-example-score]').inner_text()
                page.reload(wait_until='domcontentloaded');page.locator(f'[data-example-form="{g["id"]}"]').wait_for(state='visible')
                assert_score(page.locator(f'[data-example-form="{g["id"]}"]'),g['objectiveMax'],g['objectiveMax'])
                assert_no_overflow(page,g['id'],[width,height])
                page.screenshot(path=str(OUT/f'{kind}-{width}.png'),full_page=True)
            for g in groups:
                go(page,g['id']);assert_no_overflow(page,g['id'],[width,height])
            REPORT['viewports'].append({'viewport':[width,height],'all_groups_rendered':len(groups),'types_with_real_input':list(representatives),'overflow':'PASS'})
            write_report()
        legacy_quick_checks(page)
        assert not errors,errors
        storage_flows(browser,groups)
        page.close();browser.close()
        REPORT['page_errors']=errors;REPORT['status']='PASS';write_report()

try:
    main()
except Exception as exc:
    REPORT['status']='FAIL';REPORT['errors'].append({'message':str(exc),'traceback':traceback.format_exc()});write_report();raise
