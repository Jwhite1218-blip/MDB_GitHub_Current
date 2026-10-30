import json
from pathlib import Path
from dataclasses import asdict
from pyjobshop import Model,SolveStatus
R=Path(__file__).resolve().parent
checks=json.loads((R/'gubbins-results.json').read_text())['results']
count=next(x for x in checks if x['test']=='auger material ceiling and bottleneck')['actual']['count']
m=Model();machines=[m.add_machine(name=n) for n in ['prep','weld','inspect']]
for i in range(count):
 job=m.add_job(name=f'synthetic-auger-{i+1}')
 tasks=[m.add_task(job=job,name=f'{i+1}-{n}') for n in ['prep','weld','inspect']]
 for t,resource,duration in zip(tasks,machines,[2,4,1]):m.add_mode(t,resource,duration)
 m.add_end_before_start(tasks[0],tasks[1]);m.add_end_before_start(tasks[1],tasks[2])
r=m.solve(time_limit=10,display=False,num_workers=1)
assert r.status==SolveStatus.OPTIMAL,r.status
assert max(t.end for t in r.best.tasks)==39
for i in range(count):
 a,b,c=r.best.tasks[3*i:3*i+3]
 assert a.end<=b.start and b.end<=c.start
for i,t in enumerate(r.best.tasks):
 for u in r.best.tasks[i+1:]:
  if set(t.resources)&set(u.resources):assert t.end<=u.start or u.end<=t.start
out={'kind':'synthetic integration experiment, not an app integration','buildable_units':count,'assumed_durations':{'prep':2,'weld':4,'inspect':1},'time_unit':'arbitrary units, not measured shop times','schedule_finish':39,'lower_bound_explanation':'2 units before first weld + 9*4 on weld bottleneck + 1 for final inspection = 39','solver_status':r.status.value,'tasks':[asdict(t) for t in r.best.tasks]}
(R/'material-to-schedule.json').write_text(json.dumps(out,indent=2))
print('PASS: actual Gubbins count feeds PyJobShop: 9 units, 27 operations, optimal finish 39; precedence and capacity verified.')
