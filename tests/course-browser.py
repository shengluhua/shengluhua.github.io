from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8765/microcourses/eda/')
out=Path('test-results/course');out.mkdir(parents=True,exist_ok=True)
rows=[]
with sync_playwright() as p:
 b=p.chromium.launch()
 for w,h in [(390,844),(768,1024),(1024,768)]:
  page=b.new_page(viewport={'width':w,'height':h},has_touch=True,reduced_motion='reduce')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE,wait_until='networkidle')
  assert page.evaluate('Object.keys(EDALessons).length')==85
  ids=page.evaluate('EDACourse.units.map(u=>u.id)')
  for uid in ids:
   page.goto(BASE+'#lesson='+uid)
   page.locator('[data-example="CHECK-'+uid+'"]').wait_for()
   assert uid in page.locator('.full-lesson h1').inner_text()
   assert page.locator('.full-lesson h2').count()>=8
   assert page.locator('[data-example="CHECK-'+uid+'"]').count()==1
   assert page.locator('[data-example="CHECK-'+uid+'"] [data-example-form]').count()==1
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(w,uid,page.evaluate('document.documentElement.scrollWidth'))
   rows.append({'viewport':[w,h],'unit':uid,'content':True,'assessment':True,'overflow':False})
  for tab in ['home','theory','labs','exam','full','examples','coverage','audit']:
   page.goto(BASE+'#tab='+tab);page.wait_for_timeout(30)
   assert page.locator('main').inner_text().strip()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(w,tab)
  page.goto(BASE+'#lesson=T03');demo=page.locator('[data-demo=shannon]');assert 'F=0' in demo.locator('[data-picture]').inner_text()
  demo.locator('[data-bit=a]').check();assert 'F=1' in demo.locator('[data-picture]').inner_text()
  page.locator('[data-font="1"]').click();assert '20px' in page.locator('#font-label').inner_text()
  page.locator('[data-focus]').click();assert page.locator('body').evaluate('e=>e.classList.contains("focus-mode")')
  page.locator('[data-focus]').click();page.locator('[data-complete]').click()
  assert '已在本浏览器标记' in page.locator('[data-complete-status]').inner_text()
  page.goto(BASE+'#lesson=L06');demo=page.locator('[data-demo=gemm]')
  for _ in range(4):demo.locator('[data-next]').click()
  assert '= 7' in demo.locator('[data-formula]').inner_text()
  page.screenshot(path=str(out/f'gemm-{w}.png'),full_page=True)
  page.goto(BASE+'#unit=T12');assert page.locator('.full-lesson h1').inner_text().startswith('T12')
  page.goto(BASE+'#lesson=T25');page.locator('[data-anim-next]').first.click()
  page.goto(BASE+'#lesson=T40');page.go_back();assert page.locator('.full-lesson h1').inner_text().startswith('T25')
  page.locator('#course-search').fill('Peterson');page.wait_for_timeout(80)
  assert page.locator('.unit-card').count()>=1
  assert 'Peterson' in page.locator('main').inner_text()
  page.goto(BASE+'#tab=home');page.screenshot(path=str(out/f'home-{w}.png'),full_page=True)
  page.locator('.back').click();page.locator('[data-eda-course]').wait_for()
  assert page.locator('.course-grid .course-box').count()==5
  assert page.locator('[data-eda-navigation]').count()==1
  page.locator('#global-search').fill('Shannon');page.locator('#eda-search-results a').first.click()
  assert page.locator('.full-lesson h1').inner_text().startswith('T03')
  assert not errors,errors
  page.close()
 b.close()
(out/'routes.json').write_text(json.dumps({'status':'PASS','cases':rows},ensure_ascii=False,indent=2))
print('PASS: 85 units × 3 viewports; shared entrance, original demos, navigation/search/reader controls')
