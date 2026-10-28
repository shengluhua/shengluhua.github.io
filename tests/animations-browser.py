from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
base=Path(__file__).resolve().parents[1]/'microcourses'/'eda'
out=Path(os.environ.get('EDA_ANIMATION_QA_DIR','test-results/animations'));out.mkdir(parents=True,exist_ok=True)
files=['course-data.js','routing-data.js','animations-core.js']+sorted(p.name for p in base.glob('animations-*.js') if p.name!='animations-core.js')
results=[]
with sync_playwright() as p:
 launch={'headless':True}
 if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
 b=p.chromium.launch(**launch)
 for width,height in [(390,844),(768,1024)]:
  page=b.new_page(viewport={'width':width,'height':height},has_touch=True,reduced_motion='reduce')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="course-content" style="max-width:900px;margin:auto;padding:8px"><article class="reading full-lesson"></article></main></body></html>')
  for name in ['course.css','animations.css']:page.add_style_tag(content=(base/name).read_text())
  for name in files:page.add_script_tag(content=(base/name).read_text())
  unitids=page.evaluate('Array.from(new Set(EDAAnimations.registry.map(x=>x.unit)))')
  for unit in unitids:
   page.evaluate('(id)=>{EDAAnimations.mount(document.querySelector("main"),id)}',unit)
   cards=page.locator('[data-animation]')
   for i in range(cards.count()):
    card=cards.nth(i);aid=card.get_attribute('data-animation')
    states=card.evaluate('e=>{let n=0,b=e.querySelector("[data-anim-next]");while(!b.disabled&&n<400){b.click();n++}return n+1}')
    assert not card.locator('[role=alert]').count(), (aid,card.inner_text())
    assert states>1,(aid,states)
    card.locator('[data-anim-prev]').click();card.locator('[data-anim-reset]').click()
    assert card.locator('[data-anim-step]').inner_text().startswith('1 /'),aid
    variants=card.evaluate('e=>{let changed=0;for(const x of e.querySelectorAll(".anim-inputs input,.anim-inputs select")){if(x.tagName==="SELECT"){x.selectedIndex=(x.selectedIndex+1)%x.options.length}else if(x.type==="checkbox")x.checked=!x.checked;else{x.value=x.min||x.value}x.dispatchEvent(new Event("change",{bubbles:true}));if(e.querySelector("[role=alert]"))throw Error(e.querySelector("[role=alert]").textContent);changed++}let b=e.querySelector("[data-anim-next]"),n=0;while(!b.disabled&&n<400){b.click();n++}return changed}')
    assert not card.locator('[role=alert]').count(),aid
    card.locator('[data-anim-reset]').click()
    overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
    assert not overflow,(width,aid,page.evaluate('document.documentElement.scrollWidth'))
    results.append({'viewport':[width,height],'id':aid,'default_states':states,'parameter_variants':variants,'controls':'PASS','overflow':False})
   if unit in ['T05','T18','T25','T34','T40']:
    page.screenshot(path=str(out/f'{unit}-{width}.png'),full_page=True)
  # switching pages stops old timers and does not mutate the new concept.
  page.evaluate('EDAAnimations.mount(document.querySelector("main"),"T25")')
  page.locator('[data-anim-play]').click()
  page.evaluate('EDAAnimations.mount(document.querySelector("main"),"T40")')
  before=page.locator('[data-animation]').inner_text();page.wait_for_timeout(1200)
  assert page.locator('[data-animation]').inner_text()==before
  # Numeric empty-state recovery is explicit and does not destroy controls.
  page.evaluate('EDAAnimations.mount(document.querySelector("main"),"T18")')
  box=page.locator('.anim-inputs input[type=number]').first;box.fill('');box.dispatch_event('change')
  assert page.locator('[role=alert]').count()==1
  page.locator('[data-anim-reset]').click();assert page.locator('[role=alert]').count()==0
  assert not errors,errors
  page.close()
 b.close()
(out/'browser-matrix.json').write_text(json.dumps({'checks':results,'status':'PASS'},ensure_ascii=False,indent=2))
print(json.dumps({'status':'PASS','animation_viewport_cases':len(results),'output':str(out)},ensure_ascii=False))
