"""Verify published bytes before browser acceptance; does not publish anything."""
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import URLError
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,os,re,time
base=os.environ.get('BASE_URL','https://shengluhua.github.io/microcourses/eda/')
if base!='https://shengluhua.github.io/microcourses/eda/':raise SystemExit('Only the existing authorized course site is supported')
folder=Path('microcourses/eda');html=(folder/'index.html').read_text();names=['index.html']+re.findall(r'(?:src|href)="\./([^"?]+\.(?:js|css))(?:\?[^\"]*)?"',html)
expected={name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in names}
pending=set(names);results={};end=time.monotonic()+1200;attempt=0
while pending and time.monotonic()<end:
 attempt+=1
 def check(name):
  url=base+name+'?acceptance='+os.environ.get('GITHUB_SHA','manual')+'&attempt='+str(attempt)
  try:
   with urlopen(Request(url,headers={'Cache-Control':'no-cache','User-Agent':'EDA-public-acceptance'}),timeout=25) as r:data=r.read()
   got=hashlib.sha256(data).hexdigest();return name,got,got==expected[name]
  except (URLError,TimeoutError) as e:return name,str(e),False
 with ThreadPoolExecutor(max_workers=6) as pool:
  for name,got,ok in pool.map(check,sorted(pending)):
   results[name]={'expected':expected[name],'actual':got,'match':ok}
   if ok:pending.remove(name)
 print('Public bytes verified:',len(expected)-len(pending),'/',len(expected),flush=True)
 if pending:time.sleep(15)
out=Path('test-results/public');out.mkdir(parents=True,exist_ok=True)
(out/'asset-hashes.json').write_text(json.dumps({'commit':os.environ.get('GITHUB_SHA'),'base_url':base,'status':'PASS' if not pending else 'FAIL','files':results},indent=2))
if pending:raise SystemExit('Pages rollout did not expose the expected bytes: '+','.join(sorted(pending)))
