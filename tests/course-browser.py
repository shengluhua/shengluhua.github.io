"""Production course-route acceptance. Run through the static preview in CI."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import hashlib,json,os,traceback

BASE=os.environ.get('BASE_URL','http://127.0.0.1:8765/microcourses/eda/')
OUT=Path('test-results/course');OUT.mkdir(parents=True,exist_ok=True)
REPORT={'base_url':BASE,'status':'RUNNING','cases':[],'flows':[],'errors':[]}

def write():
 (OUT/'routes.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))

def route(page,uid,key='lesson'):
 page.goto(BASE+'#'+key+'='+uid,wait_until='domcontentloaded')
 page.wait_for_function('(id)=>document.querySelector(".full-lesson h1")?.textContent.startsWith(id)',arg=uid)
 page.locator('[data-example="CHECK-'+uid+'"]').wait_for()

def no_overflow(page,label):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(label,page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})'))

def main():
 with sync_playwright() as p:
  launch={}
  if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  browser=p.chromium.launch(**launch)
  for w,h in [(390,844),(768,1024),(1024,768)]:
   page=browser.new_page(viewport={'width':w,'height':h},has_touch=True,reduced_motion='reduce')
   page.set_default_timeout(15000)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('response',lambda r:errors.append('HTTP '+str(r.status)+' '+r.url) if r.status>=400 else None)
   page.goto(BASE,wait_until='networkidle')
   assert page.evaluate('Object.keys(EDALessons).length')==85
   ids=page.evaluate('EDACourse.units.map(u=>u.id)');assert len(ids)==len(set(ids))==85
   bodies=set()
   for uid in ids:
    route(page,uid)
    assert page.locator('.full-lesson h2').count()>=8
    assert page.locator('[data-example="CHECK-'+uid+'"]').count()==1
    assert page.locator('[data-example="CHECK-'+uid+'"] [data-example-form]').count()==1
    if page.evaluate('(id)=>!!EDAPractice.bank[id]',uid):assert page.locator('[data-practice-form="'+uid+'"]').count()==1,uid+' lost original quick check'
    text=page.locator('.full-lesson').inner_text()
    digest=hashlib.sha256(text.encode()).hexdigest();assert digest not in bodies,(uid,'duplicate entire lesson');bodies.add(digest)
    assert len(text)>1200,(uid,'substantive displayed body missing')
    assert page.evaluate('(id)=>document.title.includes(EDACourse.units.find(u=>u.id===id).title)',uid)
    no_overflow(page,(w,uid))
    REPORT['cases'].append({'viewport':[w,h],'unit':uid,'rendered_text_characters':len(text),'body_sha256':digest,'assessment':'PASS','overflow':False})
    write()
   for tab in ['home','theory','labs','exam','full','examples','coverage','audit']:
    page.goto(BASE+'#tab='+tab,wait_until='domcontentloaded')
    page.wait_for_function('(t)=>document.querySelector(`.main-nav a[href="#tab=${t}"]`)?.getAttribute("aria-current")==="page"',arg=tab)
    assert page.locator('main').inner_text().strip();no_overflow(page,(w,tab))
    if tab=='exam':
     assert page.locator('[data-practice-form]').count()==28
     assert page.locator('[data-exam-form]').count()==28
   route(page,'T03');demo=page.locator('[data-demo=shannon]')
   assert 'F=0' in demo.locator('[data-picture]').inner_text()
   demo.locator('[data-bit=a]').check();assert 'F=1' in demo.locator('[data-picture]').inner_text()
   page.locator('[data-font="1"]').click();assert '20px' in page.locator('#font-label').inner_text()
   page.locator('[data-focus]').click();assert page.locator('body').evaluate('e=>e.classList.contains("focus-mode")')
   page.locator('[data-focus]').click();page.locator('[data-complete]').click()
   assert '已在本浏览器标记' in page.locator('[data-complete-status]').inner_text()
   page.reload(wait_until='domcontentloaded');page.locator('#font-label').wait_for();assert '20px' in page.locator('#font-label').inner_text()
   assert 'T03' in page.evaluate("JSON.parse(localStorage.getItem('eda-done'))")
   route(page,'L06');demo=page.locator('[data-demo=gemm]')
   for _ in range(4):demo.locator('[data-next]').click()
   assert '= 7' in demo.locator('[data-formula]').inner_text()
   page.screenshot(path=str(OUT/f'gemm-{w}.png'),full_page=True)
   route(page,'T12',key='unit');route(page,'L04',key='lab')
   route(page,'T25');page.locator('[data-anim-next]').first.click()
   route(page,'T40');page.go_back()
   page.wait_for_function('document.querySelector(".full-lesson h1")?.textContent.startsWith("T25")')
   page.locator('#course-search').fill('Peterson')
   page.wait_for_function('location.hash.includes("tab=search")&&document.querySelectorAll(".unit-card").length>0')
   assert 'Peterson' in page.locator('main').inner_text();no_overflow(page,(w,'search'))
   page.goto(BASE+'#tab=home');page.locator('[data-export-progress]').wait_for()
   with page.expect_download() as download:
    page.locator('[data-export-progress]').click()
   download.value.save_as(str(OUT/f'learning-record-{w}.json'))
   exported=json.loads((OUT/f'learning-record-{w}.json').read_text())
   assert exported['course']=='eda' and 'T03' in json.loads(exported['storage']['eda-done'])
   assert 'eda-last-lesson' in exported['storage']
   page.screenshot(path=str(OUT/f'home-{w}.png'),full_page=True)
   page.locator('.back').click();page.locator('[data-eda-course]').wait_for()
   assert page.locator('.course-grid .course-box').count()==5
   assert page.locator('[data-eda-navigation]').count()==1
   page.locator('#global-search').fill('Shannon');page.locator('#eda-search-results a').first.click()
   page.wait_for_function('document.querySelector(".full-lesson h1")?.textContent.startsWith("T03")')
   assert not errors,errors
   REPORT['flows'].append({'viewport':[w,h],'original_demos':'PASS','aliases_history_search':'PASS','reading_record_export':'PASS','common_entrance':'PASS'})
   write();page.close()
  # An existing v2 last-read pointer remains an actual continuation link.
  context=browser.new_context()
  context.add_init_script("localStorage.setItem('eda-v2-last',JSON.stringify('G14'));localStorage.setItem('eda-done',JSON.stringify(['T03']));")
  page=context.new_page();page.goto(BASE,wait_until='networkidle')
  page.get_by_role('link',name='继续上次阅读 G14',exact=True).click()
  page.wait_for_function('document.querySelector(".full-lesson h1")?.textContent.startsWith("G14")')
  assert page.evaluate("localStorage.getItem('eda-last-lesson')")=='G14'
  context.close();browser.close()
 REPORT['status']='PASS';write()
 print('PASS: 85 units × 3 viewports; shared entrance, original demos, aliases/history/search, reader controls and progress export')

try:main()
except Exception as exc:
 REPORT['status']='FAIL';REPORT['errors'].append({'message':str(exc),'traceback':traceback.format_exc()});write();raise
