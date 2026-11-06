"""独立账号通过真实 API、SQLite、常驻 WASM 验证多人模式的完整行为。"""
import concurrent.futures
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
_tmp=tempfile.TemporaryDirectory(prefix='cards-arena-')
os.environ.update(AUTH_MODE='dev',CARDS_SECRET='arena-regression-local',ARENA_RUNTIME_PORT='8893',DATABASE_PATH=str(Path(_tmp.name)/'arena.sqlite3'))
sys.path.insert(0,str(ROOT/'server'))
import arena
from app import app,db

actual_runtime=arena.call_runtime
# 外部天梯输入固定，房间、随机角色、试炼、商品与战斗都走实际代码和 WASM。
def runtime(q,secret):
    if q['op']=='ladder':return {'ok':True,'protocol':3,'score':17072,'lane':'1A','source':'live','fetched_at':'2026-11-05T00:00:00Z'}
    if q['op']=='spawn_npcs':q={**q,'ladder_entries':[{'name':'ladder-fixture-'+str(i)+'@ladder','score':17072-i,'rank':i+1} for i in range(20)]}
    return actual_runtime(q,secret)
arena.call_runtime=runtime
app.config['TESTING']=True

class User:
    def __init__(self,name):
        self.name=name
        self.c=app.test_client()
        self.headers={'X-Debug-Team':name,'X-Forwarded-For':name}
        self.headers['X-CSRFToken']=self.c.get('/api/cards/arena/session',headers=self.headers).get_json()['csrf_token']
    def get(self,code):return self.c.get('/api/cards/arena/rooms/'+code,headers=self.headers)
    def action(self,code,kind,status=200,action_id=None,**extra):
        r=self.c.post('/api/cards/arena/rooms/'+code+'/actions',headers=self.headers,json=dict(kind=kind,action_id=action_id or uuid.uuid4().hex,**({'key':'local-room-key'} if kind=='join' else {}),**extra))
        assert r.status_code==status,(kind,r.status_code,r.get_json())
        return r.get_json().get('room')
    def create(self):
        r=self.c.post('/api/cards/arena/rooms',headers=self.headers,json={'key':'local-room-key','score':999999999,'card':{'stats':{'hp':99999}}})
        assert r.status_code==201,r.get_json()
        assert r.get_json()['room']['me']['score']==1500
        return r.get_json()['room']['id']

def fixture(code,fn):
    with app.app_context():
        r=json.loads(db().execute('SELECT state_json FROM cards_arena_room WHERE id=?',(code,)).fetchone()[0]);fn(r)
        db().execute('UPDATE cards_arena_room SET state_json=? WHERE id=?',(json.dumps(r),code));db().commit()

def saved(code):
    with app.app_context():return json.loads(db().execute('SELECT state_json FROM cards_arena_room WHERE id=?',(code,)).fetchone()[0])

a,b,watcher=User('arena-alpha'),User('arena-beta'),User('arena-watcher')
assert app.test_client().post('/api/cards/arena/rooms',json={}).status_code==401
assert a.c.post('/api/cards/arena/rooms',headers={'X-Debug-Team':a.name},json={}).status_code==400
code=a.create();a.action(code,'start',status=409);b.action(code,'join');b.action(code,'start',status=409)
a.action(code,'start');a.action(code,'move',zone=999,status=400)
# 调整位置与较大生命仅用于延长回归战斗，不是客户端可上传的能力。
def prepare(r):
    r['npcs']=[]
    for p in r['players'].values():p['zone']=189;p['hp']=20000;p['card']['stats']['hp']=20000
fixture(code,prepare)
r=a.action(code,'attack',target=b.name);assert r['battle']['pvp']
other=watcher.get(code).get_json()['room'];assert other['locked'] is True and 'players' not in other and 'key_hash' not in other
x=a.get(code).get_json()['room'];y=b.get(code).get_json()['room'];actor=a if x['battle']['your_turn'] else b;opponent=b if actor is a else a
current=x if actor is a else y;assert current['battle']['hand'];assert not opponent.get(code).get_json()['room']['battle']['hand']
opponent.action(code,'card',card='normal',turn=0,status=409)
first_deadline=current['battle']['deadline']
with patch('arena.time.time',return_value=first_deadline-1):
    assert actor.get(code).get_json()['room']['battle']['deadline']==first_deadline
# 过期手动操作不能撤销已经发生的托管；托管只选当前可使用牌，重复刷新不重置期限。
choices=[]
def chosen(seq):
    assert seq and all(c['usable'] for c in seq);choices.append([c['id'] for c in seq]);return seq[0]
with patch('arena.time.time',return_value=first_deadline+.01),patch('arena.secrets.choice',side_effect=chosen):
    actor.action(code,'card',card='normal',turn=0,status=409)
    r=actor.get(code).get_json()['room'];assert r['battle']['turn']==1;assert r['battle']['deadline']==first_deadline+10
with patch('arena.time.time',return_value=first_deadline+25),patch('arena.secrets.choice',side_effect=chosen):
    r=actor.get(code).get_json()['room'];assert r['battle']['turn']==3;assert r['battle']['deadline']==first_deadline+30
assert len(choices)==3
# 正常请求继续原会话；服务重启后只恢复一次，状态与手牌完全一致。
old=actor.get(code).get_json()['room']['battle'];assert old
import arena_runtime
arena_runtime.stop_owned_runtime()
new=actor.get(code).get_json()['room']['battle'];assert new['turn']==old['turn'];assert new['states']==old['states'];assert new['hand']==old['hand']
a.action(code,'leave');b.action(code,'leave')

# 商品由服务端生成，伪造价格无效；重复及并发购买不会重复扣分或加属性。
a,b=User('shop-alpha'),User('shop-beta');code=a.create();b.action(code,'join');a.action(code,'start')
fixture(code,lambda r:r['players'][a.name].update(zone=189))
r=a.get(code).get_json()['room'];item=next(i for i in r['stock'] if i['kind']=='skill');score=r['me']['score'];uid=uuid.uuid4().hex
r=a.action(code,'buy',item=item['id'],price=1,action_id=uid);assert r['me']['score']==score-item['price']
r2=a.action(code,'buy',item=item['id'],price=1,action_id=uid);assert r2['me']['score']==r['me']['score']
a.action(code,'buy',item=item['id'],status=429)
fixture(code,lambda r:r['players'][a.name].update(ready_at=0))
a.action(code,'buy',item=item['id'],status=400)
# 两个独立连接同时重试同一购买，SQLite 事务和回执只允许扣款一次。
fixture(code,lambda r:r['players'][a.name].update(ready_at=0))
offer=next(i for i in a.get(code).get_json()['room']['stock'] if i['kind']=='potion')
price=offer['price'];before=a.get(code).get_json()['room']['me'];purchase=uuid.uuid4().hex
clients=[User(a.name),User(a.name)]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda u:u.action(code,'buy',item=offer['id'],action_id=purchase),clients))
assert all(r['me']['score']==before['score']-price for r in results)
assert a.get(code).get_json()['room']['me']['potions']==before['potions']+offer['potion']['n']
# 真结局是严格超过榜首，等于榜首只结算最终存活。
fixture(code,lambda r:(r.update(npcs=[]),r['players'][a.name].update(score=17072)))
r=b.action(code,'leave');assert r['winner']==a.name and r['ending'] is False
code=a.create();b.action(code,'join');a.action(code,'start');fixture(code,lambda r:(r.update(npcs=[]),r['players'][a.name].update(score=17073)));r=b.action(code,'leave');assert r['winner']==a.name and r['ending'] is True
# 最终存活不限定为玩家：最后一名天梯/试炼 AI 也必须正常结算为胜者。
code=a.create();b.action(code,'join');a.action(code,'start')
def only_ai_survives(r):
    npc={**r['npcs'][0],'alive':True,'battle':None}
    r['npcs']=[npc]
    for p in r['players'].values():p.update(alive=False,hp=0,battle=None)
fixture(code,only_ai_survives)
r=a.get(code).get_json()['room'];assert r['status']=='finished' and r['winner'] is None and r['winner_name'].endswith('AI）')

# AI 完全复用现有 @! 试炼，搜索和战斗可实际推进；环境伤害会解除被占用的战斗。
a,b=User('npc-alpha'),User('npc-beta');code=a.create();b.action(code,'join');a.action(code,'start')
fixture(code,lambda r:(r['players'][a.name].update(zone=3),r['players'][b.name].update(zone=399),r.update(npcs=[{**r['npcs'][20],'zone':3}])))
with patch('arena.secrets.randbelow',return_value=0):r=a.action(code,'search')
assert r['battle'] and not r['battle']['pvp']
assert any('@!' in e['text'] for e in r['log'])
initial=saved(code);battle=next(v for v in initial['battles'].values() if not v['done']);assert battle['cards'][1]['clan']=='!'
# 环境淘汰独立于随机战斗结果，另开房间验证离线时间线与最终存活。
a.action(code,'leave')
a,b=User('hazard-alpha'),User('hazard-beta');code=a.create();b.action(code,'join');a.action(code,'start')
start=saved(code)['started']
fixture(code,lambda r:(r['players'][a.name].update(zone=r['close_stages'][0][0],hp=1),r['players'][b.name].update(zone=r['close_stages'][-1][0]),r.update(npcs=[])))
with patch('arena.time.time',return_value=start+100):
    r=b.get(code).get_json()['room'];assert r['status']=='finished';assert r['winner']==b.name
# 81 格任意点击移动，区域内跨格相遇，野外严格同格；移动不会自动搜索。
assert len(arena.CELLS)==400 and arena.same_area(21,63) and not arena.same_area(2,3) and arena.same_area(3,3)
a,b=User('map-alpha'),User('map-beta');code=a.create();b.action(code,'join');a.action(code,'start')
fixture(code,lambda r:r['players'][a.name].update(zone=0,ready_at=0))
r=a.action(code,'move',zone=80);assert r['me']['zone']==80 and r['battle'] is None
# 私房未加入者只得到密钥提示，不能读取地图、角色或手牌。
c=User('key-check');response=c.c.post('/api/cards/arena/rooms/'+code+'/actions',headers=c.headers,json={'kind':'join','key':'wrong','action_id':uuid.uuid4().hex})
assert response.status_code==409  # 已开局的私房先阻止中途加入。
a.action(code,'leave')

# 区域掉落实际进入物品栏，装备/卸下调用真实 WASM 重构；搜索与移动各自独立。
a,b=User('loot-alpha'),User('loot-beta');code=a.create();b.action(code,'join');a.action(code,'start')
fixture(code,lambda r:(r['players'][a.name].update(zone=105,ready_at=0),r['players'][b.name].update(zone=80)))
with patch('arena.secrets.randbelow',return_value=99),patch('arena.secrets.choice',side_effect=lambda items:items[0]):r=a.action(code,'search')
assert len(r['me']['weapons'])==1 and not r['me']['card'].get('weapon')
w=r['me']['weapons'][0];fixture(code,lambda r:r['players'][a.name].update(ready_at=0))
r=a.action(code,'equip',item=w['id']);assert r['me']['card']['weapon']==w['name']
fixture(code,lambda r:r['players'][a.name].update(ready_at=0));r=a.action(code,'equip',item=None);assert not r['me']['card']['weapon']
fixture(code,lambda r:r['players'][a.name].update(zone=155,ready_at=0))
with patch('arena.secrets.randbelow',return_value=99),patch('arena.secrets.choice',side_effect=lambda items:'large' if 'large' in items else items[0]):r=a.action(code,'search')
assert r['me']['large_potions']==1
fixture(code,lambda r:r['players'][a.name].update(ready_at=0,hp=1));r=a.action(code,'heal',large=True);assert r['me']['large_potions']==0 and r['me']['hp']>1
# 野外不同格不能交战，同一区域的不同格可以。
fixture(code,lambda r:(r['players'][a.name].update(zone=2,ready_at=0),r['players'][b.name].update(zone=3)))
a.action(code,'attack',target=b.name,status=409)
fixture(code,lambda r:(r['players'][a.name].update(zone=21,hp=20000),r['players'][a.name]['card']['stats'].update(hp=20000),r['players'][b.name].update(zone=63,hp=20000),r['players'][b.name]['card']['stats'].update(hp=20000)))
r=a.action(code,'attack',target=b.name);assert r['battle']['pvp'];a.action(code,'leave')

# 公房无人也自动缩圈，第九轮结算，60 秒后按原时间线开启下一局。
with app.app_context():app.extensions['cards_arena_tick']()
public=saved(arena.PUBLIC_ID);start=public['started'];number=public['round']
assert len(public['npcs'])==40 and sum(n['kind']=='ladder' for n in public['npcs'])==20
fixture(arena.PUBLIC_ID,lambda r:[n.update(alive=i<2,zone=r['close_stages'][-1][0],battle='hold') for i,n in enumerate(r['npcs'])])
for offset,expected in [(809,'active'),(810,'cooldown'),(869,'cooldown'),(870,'active')]:
    with patch('arena.time.time',return_value=start+offset):
        with app.app_context():app.extensions['cards_arena_tick']()
        r=saved(arena.PUBLIC_ID);assert r['status']==expected,(offset,r['status'])
assert r['round']==number+1
u,v=User('public-alpha'),User('public-beta')
with patch('arena.time.time',return_value=start+900):
    r=u.action(arena.PUBLIC_ID,'join');assert r['status']=='active' and len(r['zones'])==400
    v.action(arena.PUBLIC_ID,'join');fixture(arena.PUBLIC_ID,lambda r:r.update(npcs=[]));r=v.action(arena.PUBLIC_ID,'leave');assert r['status']=='cooldown' and r['winner']==u.name
    next_start=r['next_start']
with patch('arena.time.time',return_value=next_start):
    with app.app_context():app.extensions['cards_arena_tick']()
    r=u.get(arena.PUBLIC_ID).get_json()['room'];assert r['status']=='active' and r['me'] is None
# 空场先结算再校验加入，不把新加入者当作上一局胜者。
fixture(arena.PUBLIC_ID,lambda r:r.update(npcs=[]))
with app.app_context():app.extensions['cards_arena_tick']()
r=u.action(arena.PUBLIC_ID,'join',status=409)
print(json.dumps({'map_cells':400,'regions':'passed','public_cycles':'passed','private_keys':'passed','loot_and_equipment':'passed','pvp':'two real clients','deadline_seconds':10,'automatic_plays':len(choices),'private_hands':'passed','reconnect':'passed','duplicate_purchase':'passed','strict_ladder_endings':'passed','npc':'@! shared trial','hazard':'passed'},ensure_ascii=True))
arena_runtime.stop_owned_runtime()
_tmp.cleanup()
