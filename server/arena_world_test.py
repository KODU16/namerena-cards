"""真实 40 AI 世界：移动避圈、自动交战、尸体、视野、重名接管和空场结算。"""
import json,os,sys,tempfile,time,uuid,random
from pathlib import Path
from unittest.mock import patch
_tmp=tempfile.TemporaryDirectory(prefix='cards-world-')
os.environ.update(AUTH_MODE='dev',CARDS_SECRET='world-test-only',ARENA_RUNTIME_PORT='8898',DATABASE_PATH=str(Path(_tmp.name)/'world.sqlite3'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import arena
from app import app,db
import arena_runtime
actual=arena.call_runtime
entries=[{'name':'world-rank-'+str(i)+'@rank','rank':i+1,'score':18000-i} for i in range(20)]
def rpc(q,key):
    if q['op']=='spawn_npcs':q={**q,'ladder_entries':entries}
    return actual(q,key)
arena.call_runtime=rpc
app.config['TESTING']=True

def user(name):
    c=app.test_client();h={'X-Debug-Team':name,'X-Forwarded-For':name};h['X-CSRFToken']=c.get('/api/cards/arena/session',headers=h).get_json()['csrf_token'];return c,h

def action(u,kind,status=200,**values):
    c,h=u;r=c.post('/api/cards/arena/rooms/PUBLIC/actions',headers=h,json={'kind':kind,'action_id':uuid.uuid4().hex,**values});assert r.status_code==status,(kind,r.status_code,r.get_json());return r.get_json().get('room')

def saved():
    with app.app_context():return json.loads(db().execute("SELECT state_json FROM cards_arena_room WHERE id='PUBLIC'").fetchone()[0])

def fixture(fn):
    with app.app_context():
        room=saved();fn(room);db().execute("UPDATE cards_arena_room SET state_json=? WHERE id='PUBLIC'",(json.dumps(room),));db().commit()

def tick(at):
    with patch('arena.time.time',return_value=at):
        with app.app_context():app.extensions['cards_arena_tick'](background=True)

u=user('world-a');v=user('world-b');w=user('world-c')
u[0].get('/api/cards/arena/rooms',headers=u[1]);r=saved();assert len(r['npcs'])==40 and sum(n['kind']=='ladder' for n in r['npcs'])==20
first,second=r['npcs'][0]['card']['name'],r['npcs'][1]['card']['name']
action(u,'join',name=first+'@rank');r=saved();assert not r['npcs'][0]['alive'] and not r['corpses']
action(v,'join')
def prepare(r):
    for i,n in enumerate(r['npcs']):n['zone']=0 if i!=1 else 189
    r['npcs'][1]['card']['stats']['hp']=20000;r['npcs'][1]['hp']=20000
    r['players']['world-a']['zone']=399
    p=r['players']['world-b'];p['zone']=189;p['hp']=20000;p['card']['stats']['hp']=20000
fixture(prepare)
with patch('arena.secrets.randbelow',return_value=0),patch('arena.secrets.choice',side_effect=lambda seq:next((x for x in seq if isinstance(x,tuple) and x[0]=='npc'),seq[0])):r=action(v,'search')
assert r['battle'] and saved()['npcs'][1]['battle']
action(w,'join',name=second);assert saved()['npcs'][1]['alive'] and saved()['npcs'][1]['retire']
action(v,'leave');tick(time.time()+7);r=saved();assert not r['npcs'][1]['alive'];assert not any(c['owner']=='npc-1' for c in r['corpses']);assert any(c['kind']=='player' for c in r['corpses'])
# 把两个可移动 AI 放在最后安全格，验证随机自动交战与胜者满血，而不是伪造战斗结果。
now=time.time()
for seed in range(100):
    rr=random.Random(seed^(121*2654435761));rr.choice([0]);rr.choice([0])
    if rr.random()<.25:break

def prepare_fight(r):
    r.update(seed=seed,started=now-720,phase=8,hazard_tick=72,ai_tick=120)
    cell=r['close_stages'][-1][0]
    for i,n in enumerate(r['npcs']):
        n.update(alive=i in (2,3),battle=None,zone=cell,hp=1,retire=False)
        if i in (2,3):n['card']['skillList']=[];n['card']['stats'].update(hp=300,atk=500)
    for p in r['players'].values():p['zone']=cell;p['ready_at']=0
fixture(prepare_fight);before=len(saved()['corpses']);tick(now+6);r=saved();assert len(r['corpses'])>before;assert sum(n['alive'] for n in r['npcs'])==1
winner=next(n for n in r['npcs'] if n['alive']);assert winner['hp']==winner['card']['stats']['hp']
# 只发现可遇见的尸体；接口和日志均不泄露其他角色的格子。
with patch('arena.time.time',return_value=now+7),patch('arena.secrets.randbelow',return_value=0),patch('arena.secrets.choice',side_effect=lambda seq:next((x for x in seq if isinstance(x,tuple) and x[0]=='corpse'),seq[0])):r=action(w,'move',zone=winner['zone'])
assert all('zone' not in p and 'hp' not in p for p in r['players']);assert r['corpses'] and all('zone' not in c for c in r['corpses'])
body=r['corpses'][0]['id'];fixture(lambda r:r['players']['world-c'].update(ready_at=0))
with patch('arena.time.time',return_value=now+7):r=action(w,'loot',corpse=body)
assert next(c for c in saved()['corpses'] if c['id']==body)['looted']
assert [x['seq'] for x in r['log']]==sorted(x['seq'] for x in r['log'])
assert any('被 ' in x['text'] and '击杀' in x['text'] for x in r['log'])
# 空场在加入前结算；冷却后生成下一局，并把上一局日志归档。
fixture(lambda r:([p.update(alive=False) for p in r['players'].values()],[n.update(alive=False) for n in r['npcs']]))
tick(now+8);assert saved()['status']=='cooldown'
with patch('arena.time.time',return_value=now+9):action(user('world-new'),'join',status=409)
next_start=saved()['next_start'];old_round=saved()['round'];tick(next_start);assert saved()['round']==old_round+1 and len(saved()['npcs'])==40
with app.app_context():assert db().execute('SELECT id FROM cards_arena_room WHERE id=?',('PUBLIC-R'+str(old_round),)).fetchone()
print(json.dumps({'initialAI':'20 ladder + 20 trial','AICombat':'real tswn; winner full HP','corpses':'players and AI; loot passed','sameName':'immediate/deferred/corpse preserved','visibility':'own position only','emptyRound':'settled before join','logs':'ordered and archived'}))
arena_runtime.stop_owned_runtime();_tmp.cleanup()
