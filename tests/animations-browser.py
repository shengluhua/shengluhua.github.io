"""Real Chromium checks of the production index, routes and concept controls.

No handwritten test page or injected model script substitutes for the deployed
loader. Pure-model exhaustive numeric checks live in animations-models.cjs.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import hashlib, json, os, traceback

BASE=os.environ.get('BASE_URL','http://127.0.0.1:8765/microcourses/eda/')
OUT=Path(os.environ.get('EDA_ANIMATION_QA_DIR','test-results/animations'));OUT.mkdir(parents=True,exist_ok=True)
REPORT={'base_url':BASE,'status':'RUNNING','checks':[],'errors':[]}

def write():
 (OUT/'browser-matrix.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))

def go(page,unit):
 page.goto(BASE+'#lesson='+unit,wait_until='domcontentloaded')
 page.wait_for_function('(id)=>document.querySelector(".full-lesson h1")?.textContent.startsWith(id)',arg=unit)
 page.locator('[data-animations="'+unit+'"]').wait_for(state='visible')

def trace(card,require_multiple=True):
 # Exercise every DOM next-button handler, not the model function directly.
 states=card.evaluate('''e=>{const out=[e.querySelector('.anim-stage').innerHTML];const next=e.querySelector('[data-anim-next]');let n=0;while(!next.disabled){if(n++>=2000)throw Error('Animation did not terminate');next.click();if(e.querySelector('[role=alert]'))throw Error(e.querySelector('[role=alert]').textContent);out.push(e.querySelector('.anim-stage').innerHTML)}return out}''')
 assert len(states)>=1,card.get_attribute('data-animation')
 if require_multiple:
  assert len(states)>1,card.get_attribute('data-animation')
  assert len(set(states))>1,'Frames never explain a changed state: '+card.get_attribute('data-animation')
 return len(states),hashlib.sha256('\n'.join(states).encode()).hexdigest()

def alternative(control):
 return control.evaluate('''x=>{if(x.tagName==='SELECT')return x.options.length>1?x.options[(x.selectedIndex+1)%x.options.length].value:null;if(x.type==='checkbox')return !x.checked;const v=Number(x.value),step=Number(x.step)||1,min=x.min===''?v-step:Number(x.min),max=x.max===''?v+step:Number(x.max);return max!==v?String(max):min!==v?String(min):null}''')

def main():
 with sync_playwright() as p:
  launch={'headless':True}
  if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  browser=p.chromium.launch(**launch)
  for width,height in [(390,844),(768,1024),(1024,768)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True,reduced_motion='reduce')
   page.set_default_timeout(15000)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('response',lambda r:errors.append('HTTP '+str(r.status)+' '+r.url) if r.status>=400 else None)
   page.goto(BASE,wait_until='networkidle')
   models=page.evaluate('EDAAnimations.registry.map(x=>({id:x.id,unit:x.unit}))')
   assert len(models)>=103,'Previously completed concept models disappeared'
   assert len({m['id'] for m in models})==len(models)
   for unit in dict.fromkeys(m['unit'] for m in models):
    go(page,unit)
    expected=[m['id'] for m in models if m['unit']==unit]
    assert page.locator('[data-animation]').count()==len(expected),(unit,'missing or duplicate cards')
    for aid in expected:
     card=page.locator('[data-animation="'+aid+'"]')
     assert not card.locator('[role=alert]').count(),(aid,card.inner_text())
     default_states,fingerprint=trace(card)
     card.locator('[data-anim-prev]').click()
     assert card.locator('[data-anim-step]').inner_text().startswith(str(default_states-1)+' /'),aid
     card.locator('[data-anim-reset]').click()
     assert card.locator('[data-anim-step]').inner_text().startswith('1 /'),aid
     # Actual Playwright clicks and timer tick, scoped to exactly one model.
     card.locator('[data-anim-play]').click()
     page.wait_for_function('(id)=>!document.querySelector(`[data-animation="${id}"] [data-anim-step]`).textContent.startsWith("1 /")',arg=aid,timeout=5000)
     if card.locator('[data-anim-play]').inner_text()=='暂停':card.locator('[data-anim-play]').click()
     paused=card.locator('[data-anim-step]').inner_text();page.wait_for_timeout(100)
     assert card.locator('[data-anim-step]').inner_text()==paused,aid
     card.locator('[data-anim-reset]').click()
     controls=card.locator('.anim-inputs input,.anim-inputs select');variants=[]
     for n in range(controls.count()):
      card.locator('[data-anim-reset]').click()
      control=controls.nth(n);value=alternative(control)
      assert value is not None,(aid,'parameter has no alternate value',n)
      name=control.get_attribute('name')
      if control.evaluate('x=>x.tagName')=='SELECT':control.select_option(value)
      elif control.get_attribute('type')=='checkbox':control.set_checked(value)
      else:control.fill(value);control.dispatch_event('change')
      assert not card.locator('[role=alert]').count(),(aid,name,card.inner_text())
      count,changed=trace(card,require_multiple=False)
      changed=changed!=fingerprint
      if aid=='rvv-stripmine-mask-tail' and name=='tail':assert changed,'Tail policy is computed but never shown'
      variants.append({'parameter':name,'value':value,'states':count,'changed':changed})
     assert any(v['changed'] for v in variants),(aid,'no parameter affects any rendered state')
     card.locator('[data-anim-reset]').click()
     assert trace(card)==(default_states,fingerprint),(aid,'reset failed to restore the complete original model trace')
     card.locator('[data-anim-reset]').click()
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,aid,page.evaluate('document.documentElement.scrollWidth'))
     REPORT['checks'].append({'viewport':[width,height],'id':aid,'default_states':default_states,'parameter_variants':variants,'play_pause_reset':'PASS','overflow':False})
     write()
    if unit in ['T05','T18','T25','T34','T40','G06','G16','G19','L12']:
     page.screenshot(path=str(OUT/f'{unit}-{width}.png'),full_page=True)
   # Retain a detached old card: route cleanup must actually stop its interval.
   go(page,'T25');old=page.locator('[data-animation]').first.element_handle()
   old.query_selector('[data-anim-play]').click()
   go(page,'T40');old_text=old.inner_text();new_text=page.locator('[data-animations]').inner_text()
   page.wait_for_timeout(1250)
   assert old.inner_text()==old_text,'Detached route kept its animation timer alive'
   assert page.locator('[data-animations]').inner_text()==new_text,'Old timer mutated the new route'
   # T18 has multiple models; reset only the card whose input is invalid.
   go(page,'T18');box=page.locator('.anim-inputs input[type=number]').first
   card=box.locator('xpath=ancestor::*[@data-animation][1]')
   box.fill('');box.dispatch_event('change')
   assert card.locator('[role=alert]').count()==1
   card.locator('[data-anim-reset]').click();assert card.locator('[role=alert]').count()==0
   assert not errors,errors
   page.close()
  browser.close()
 REPORT['status']='PASS';write()
 print(json.dumps({'status':'PASS','animation_viewport_cases':len(REPORT['checks']),'output':str(OUT)},ensure_ascii=False))

try:main()
except Exception as exc:
 REPORT['status']='FAIL';REPORT['errors'].append({'message':str(exc),'traceback':traceback.format_exc()});write();raise
