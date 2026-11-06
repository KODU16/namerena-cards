"""独立多人存活模式：房间事务、移动探索、禁区、服务端商店与双人手牌战斗。"""
from __future__ import annotations
import json
import math
import re
import secrets
import time
from flask import request
from werkzeug.security import generate_password_hash,check_password_hash
try:
    from .arena_runtime import call_runtime
except ImportError:
    from arena_runtime import call_runtime

# 原创区域占据部分格子，区域内跨格可相遇；野外必须同格。
MAP_SIZE=20
CELL_COUNT=400
REGIONS=[('霜叶林地',1,1,'supplies',False),('旧观测台',0,12,'skill',False),('废铸工坊',5,5,'weapon',False),('药草溪岸',7,15,'healing',False),('星环集市',9,9,'mixed',True),('青石驿站',14,1,'supplies',True),('静默书库',14,14,'skill',False),('落日矿场',17,8,'weapon',False)]
REGION_PREFIXES=('霜叶','青石','静默','赤霞','星环','银月','旧日','远望','暮色','流云','苍苔','微光')
REGION_SUFFIXES=('林地','观测台','工坊','溪岸','集市','驿站','书库','矿场','庭院','灯塔','哨所','渡口')
CELLS=[]
for cell in range(CELL_COUNT):
    row,col=divmod(cell,MAP_SIZE)
    region=next((i for i,(_,r,c,_,_) in enumerate(REGIONS) if r<=row<r+3 and c<=col<c+3),None)
    CELLS.append({'id':cell,'row':row,'col':col,'region':region,'name':REGIONS[region][0] if region is not None else '野外','loot':REGIONS[region][3] if region is not None else 'wild','shop':REGIONS[region][4] if region is not None else False})
ZONES=[c['name'] for c in CELLS]
SHOPS={c['id'] for c in CELLS if c['shop']}
PUBLIC_ID='PUBLIC'
ROUND_SECONDS=810
COOLDOWN_SECONDS=60


def same_area(a,b):
    return a==b or (CELLS[a]['region'] is not None and CELLS[a]['region']==CELLS[b]['region'])


def closed_cells(room):
    return [cell for stage in room['close_stages'][:room['phase']] for cell in stage]


TURN_SECONDS = 10
SCHEMA = '''
CREATE TABLE IF NOT EXISTS cards_arena_room (
 id TEXT PRIMARY KEY, status TEXT NOT NULL, state_json TEXT NOT NULL, updated REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS cards_arena_member (
 user_key TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES cards_arena_room(id)
);
CREATE INDEX IF NOT EXISTS cards_arena_status ON cards_arena_room(status,updated);
'''


def install_arena(app, api, router=None):
    db, Error = api['db'], api['ApiError']
    clock = lambda: time.time()
    router = router or app
    # 主站注入 PostgreSQL 存储与原生登录/CSRF，独立开发后端仍使用 SQLite。
    with app.app_context():
        if api.get('ensure_arena_schema'):
            api['ensure_arena_schema']()
        else:
            db().executescript(SCHEMA)
            db().commit()

    def runtime(**payload):
        try:
            result=call_runtime(payload,api['CARDS_SECRET'])
            if result.get('protocol')!=3:raise RuntimeError('arena runtime protocol mismatch')
            return result
        except Exception as exc:
            raise Error(503, 'arena_engine', '多人战斗服务暂不可用，请稍后重试。') from exc

    def log(room, text):
        room['log'].append({'at':clock(),'seq':len(room['log'])+1,'text':text})

    def save(room):
        room['version'] += 1
        db().execute('UPDATE cards_arena_room SET status=?,state_json=?,updated=? WHERE id=?', (room['status'], json.dumps(room, ensure_ascii=False), clock(), room['id']))

    def new_room(code,host=None,private_key=None,now=None,round_no=1):
        import random
        now=clock() if now is None else now
        seed=secrets.randbits(32);rng=random.Random(seed)
        top,left,bottom,right=0,0,19,19;stages=[]
        # 九轮缩圈仍为 13 分 30 秒，最后一轮封锁剩余一格。
        for size in [18,16,14,12,10,8,5,1,0]:
            before={r*20+c for r in range(top,bottom+1) for c in range(left,right+1)}
            while bottom-top+1>size:
                if rng.randrange(2):top+=1
                else:bottom-=1
            while right-left+1>size:
                if rng.randrange(2):left+=1
                else:right-=1
            after={r*20+c for r in range(top,bottom+1) for c in range(left,right+1)}
            stages.append(sorted(before-after))
        public=code==PUBLIC_ID;spawned=runtime(op='spawn_npcs',seed=seed)
        npcs=[{'id':'npc-'+str(i),'zone':rng.randrange(CELL_COUNT),'seed':rng.getrandbits(32),'alive':True,'battle':None,'card':item['card'],'kind':item['kind'],'score':item.get('score',0),'hp':item['card']['stats']['hp'],'retire':False} for i,item in enumerate(spawned['npcs'])]
        # 名称仅影响本局地图显示，区域种类和掉落表仍由固定的安全规则决定。
        labels=[]
        while len(labels)<len(REGIONS):
            label=rng.choice(REGION_PREFIXES)+rng.choice(REGION_SUFFIXES)
            if label not in labels:labels.append(label)
        return {'protocol':3,'id':code,'host':host,'mode':'public' if public else 'private','key_hash':generate_password_hash(private_key) if private_key else None,'status':'active' if public else 'waiting','seed':seed,'version':0,'round':round_no,'created':now,'started':now if public else None,'phase':0,'hazard_tick':0,'ai_tick':0,'close_stages':stages,'players':{},'battles':{},'shops':{},'log':[],'npcs':npcs,'corpses':[],'region_names':labels,'ladder_source':spawned['source']}

    def insert(room):
        db().execute('INSERT INTO cards_arena_room VALUES (?,?,?,?)',(room['id'],room['status'],json.dumps(room,ensure_ascii=False),clock()))

    def load(room_id):
        row = db().execute('SELECT state_json FROM cards_arena_room WHERE id=?', (room_id,)).fetchone()
        if row is None:
            raise Error(404, 'arena_room_missing', '房间不存在。')
        return json.loads(row['state_json'])

    def player(room, key):
        p = room['players'].get(key)
        if p is None or p.get('left'):
            raise Error(403, 'arena_not_joined', '请先加入这个房间。')
        return p

    def alive(room):
        return [p for p in room['players'].values() if p['alive'] and not p.get('left')]

    def end_round(room,now,reason=''):
        if room['status']!='active':return
        remaining=alive(room);bots=[n for n in room['npcs'] if n['alive']]
        # 最终存活者可以是玩家、天梯 AI 或试炼 AI；仅玩家才参与天梯分数真结局判定。
        winner=remaining[0] if len(remaining)==1 and not bots else None
        ai_winner=bots[0] if len(bots)==1 and not remaining else None
        winner_name=winner['team'] if winner else (actor_name(ai_winner)+'（'+('天梯 AI' if ai_winner['kind']=='ladder' else '试炼 AI')+'）' if ai_winner else None)
        room['ladder']=runtime(op='ladder',seed=0) if winner else None
        room['ending']=bool(winner and room['ladder'].get('score') is not None and winner['score']>room['ladder']['score'])
        room['winner']=winner['key'] if winner else None
        room['winner_name']=winner_name
        # 结算快照不依赖仍在场的角色，供大厅的公房历史稳定显示。
        winner_card=winner['card'] if winner else (ai_winner['card'] if ai_winner else None)
        room['winner_card_name']=winner_card['name'] if winner_card else None
        room['winner_clan']=winner_card['clan'] if winner_card else None
        room['winner_score']=(winner['score'] if winner else ai_winner.get('score',0) if ai_winner else 0)
        if not reason and ai_winner:reason='最终存活：'+winner_name
        room['finished_at']=now;room['finish_reason']=reason;room['status']='cooldown' if room['mode']=='public' else 'finished'
        if room['mode']=='public':room['next_start']=now+COOLDOWN_SECONDS
        log(room,'最终存活：'+winner_name if winner_name else (reason or '本局无人最终存活。'))
        db().execute('DELETE FROM cards_arena_member WHERE room_id=?',(room['id'],))
        for battle in room['battles'].values():
            if not battle.get('done'):
                battle['done']=True
                try:call_runtime({'op':'release','id':battle['id']},api['CARDS_SECRET'])
                except Exception:pass
        for p in room['players'].values():p['battle']=None

    def end_if_needed(room,now=None):
        if room['status']!='active':return
        # 计入所有活 AI；空场先结算，不能让新加入者领取上一局胜利。
        cleanup_battles(room)
        if len(alive(room))+sum(n['alive'] for n in room['npcs'])<=1:
            end_round(room,clock() if now is None else now)

    def eliminate(room, p, reason):
        if not p['alive']:
            return
        p['alive'], p['hp'] = False, 0
        p['death'] = reason
        p['battle'] = None
        make_corpse(room,p,'player')
        log(room,actor_name(p)+'死亡：'+reason)

    def actor_name(actor):
        c=actor['card'];return c['name']+'@'+c['clan']

    def make_corpse(room,actor,kind):
        ident=('player-'+actor['key']) if kind=='player' else actor['id']
        if any(c['owner']==ident for c in room['corpses']):return
        room['corpses'].append({'id':secrets.token_hex(8),'owner':ident,'name':actor_name(actor),'zone':actor['zone'],'kind':kind,'looted':False,'weapons':actor.get('weapons',[])})

    def kill_npc(room,npc,reason):
        if not npc['alive']:return
        npc['alive']=False;npc['hp']=0;make_corpse(room,npc,'npc');log(room,actor_name(npc)+reason)

    def retire_matching(room,p):
        # 移除同名活 AI；交战者延后处理，已死 AI 和尸体不受影响。
        for npc in room['npcs']:
            if npc['alive'] and npc['card']['name']==p['card']['name']:
                if npc.get('battle'):npc['retire']=True
                else:npc['alive']=False;npc['retired']=True;log(room,actor_name(npc)+'已由同名玩家接管。')

    def retire_finished(room,npc):
        if npc['alive'] and npc.get('retire'):
            npc['alive']=False;npc['retired']=True;log(room,actor_name(npc)+'交战结束，已由同名玩家接管。')

    def cleanup_battles(room):
        # 退出/禁区死亡立即结束相关交战，不等下一个手牌截止时间。
        for b in room['battles'].values():
            if b.get('done'):continue
            npc=next((n for n in room['npcs'] if n['id']==b.get('npc_id')),None)
            if not any(key is not None and not room['players'][key]['alive'] for key in b['keys']) and not (npc and not npc['alive']):continue
            b['done']=True
            for key in b['keys']:
                if key is not None:
                    p=room['players'][key];p['battle']=None;p['last_battle']={'id':b['id'],'won':p['alive'],'log':['交战结束，存活状态以系统广播为准。']}
            if npc:npc['battle']=None;retire_finished(room,npc)
            try:call_runtime({'op':'release','id':b['id']},api['CARDS_SECRET'])
            except Exception:pass

    def encounter(room,p,chance):
        if secrets.randbelow(100)>=chance:return False
        people=[o for o in alive(room) if o['key']!=p['key'] and not o.get('battle') and same_area(o['zone'],p['zone'])]
        npcs=[n for n in room['npcs'] if n['alive'] and not n.get('battle') and same_area(n['zone'],p['zone'])]
        bodies=[c for c in room['corpses'] if not c['looted'] and same_area(c['zone'],p['zone'])]
        choices=[('player',o) for o in people]+[('npc',n) for n in npcs]+[('corpse',c) for c in bodies]
        if not choices:return False
        kind,target=secrets.choice(choices)
        if kind=='corpse':p['found_corpse']=target['id'];log(room,actor_name(p)+'发现了 '+target['name']+' 的尸体。')
        else:begin_battle(room,p,target=target if kind=='player' else None,npc=target if kind=='npc' else None)
        return True

    def move_ais(room,at):
        import random
        rng=random.Random(room['seed']^(room['ai_tick']*2654435761));closed=set(closed_cells(room));future=set(room['close_stages'][room['phase']]) if room['phase']<9 else set()
        safe=[i for i in range(CELL_COUNT) if i not in closed];preferred=[i for i in safe if i not in future] or safe
        if not preferred:return
        r0,r1=min(i//20 for i in preferred),max(i//20 for i in preferred);c0,c1=min(i%20 for i in preferred),max(i%20 for i in preferred)
        for npc in room['npcs']:
            if not npc['alive'] or npc.get('battle'):continue
            row,col=divmod(npc['zone'],20)
            choices=[r*20+c for r,c in [(row,col),(row-1,col),(row+1,col),(row,col-1),(row,col+1)] if 0<=r<20 and 0<=c<20]
            def cost(cell):
                r,c=divmod(cell,20);distance=max(r0-r,0,r-r1)+max(c0-c,0,c-c1)
                return (cell in closed,cell in future,distance if npc['zone'] in closed or npc['zone'] in future else 0)
            best=min(map(cost,choices));npc['zone']=rng.choice([c for c in choices if cost(c)==best])
        groups={}
        for npc in room['npcs']:
            if npc['alive'] and not npc.get('battle'):groups.setdefault(npc['zone'],[]).append(npc)
        for group in groups.values():
            if len(group)<2 or rng.random()>=.25:continue
            a,b=rng.sample(group,2);result=runtime(op='ai_battle',seed=rng.getrandbits(32),cards=[a['card'],b['card']],hp=[a['hp'],b['hp']])
            winner=result['winner']
            if winner is None:
                kill_npc(room,a,'与 '+actor_name(b)+' 交战后死亡。');kill_npc(room,b,'与 '+actor_name(a)+' 交战后死亡。')
            else:
                win,lose=(a,b) if winner==0 else (b,a);win['hp']=win['card']['stats']['hp'];kill_npc(room,lose,'被 '+actor_name(win)+'击杀。');retire_finished(room,win)

    def engine_battle(b):
        return runtime(op='battle', id=b['id'], seed=b['seed'], cards=b['cards'], hp=b['hp'], pvp=b['pvp'], actions=b['actions'])

    def finish_battle(room, b, result,finished_at=None):
        # 只结算一次；角色与分数均从服务器战报推导，浏览器没有上传结算结果的接口。
        if b.get('done'):
            return
        b['done'] = True
        living = [i for i, hp in enumerate(result['root_hp']) if hp > 0]
        # 本体只剩一方时以真实 HP 为准，避免引擎内部队伍编号映射造成胜负反转。
        winner = living[0] if len(living)==1 else next((i for i in range(2) if any(s['input_team_index'] == i and s['owner_id'] is None and s['team_index'] in result['winner'] for s in result['initial'])), None)
        if winner is None and living:
            winner = max(living, key=lambda i: result['root_hp'][i] / b['cards'][i]['stats']['hp'])
        npc=next((n for n in room['npcs'] if n['id']==b.get('npc_id')),None)
        if npc:
            npc['battle']=None;npc['hp']=max(0,result['root_hp'][1]-b['hazard'][1])
            if winner!=1 or npc['hp']<=0:kill_npc(room,npc,'被 '+actor_name(room['players'][b['keys'][0]])+'击杀。' if winner==0 else '在交战中死亡。')
            retire_finished(room,npc)
        for side, key in enumerate(b['keys']):
            if key is None:
                continue
            p = room['players'][key]
            p['battle'] = None
            if side != winner:
                eliminate(room,p,'被 '+actor_name(room['players'][b['keys'][1-side]] if b['pvp'] else npc)+'击杀。')
            else:
                # 运行时已按存活本体返回真实 HP；不能以 1 HP 兜底覆盖胜者的实际战斗结果。
                surviving_hp=result['root_hp'][side]
                p['hp'] = max(0,min(p['card']['stats']['hp'], surviving_hp)-b['hazard'][side])
                if p['hp']<=0:
                    eliminate(room,p,'危险区域伤害')
                    continue
                p['kills'] += int(b['pvp'])
                points = (1000 if b['pvp'] else 850) + (min(1000, room['players'][b['keys'][1-side]]['score'] // 2) if b['pvp'] else 0)
                p['score'] += points
                log(room, p['team'] + ' 赢得' + ('玩家交战' if b['pvp'] else '试炼') + '，获得 ' + str(points) + ' 天梯分数。')
            # 结果在生命与禁区伤害都结算后写入，弹窗不会把获胜者显示为死亡。
            p['last_battle']={'id':b['id'],'won':bool(p['alive'] and side==winner),'log':result['log'][-20:]}
        end_if_needed(room,finished_at)
        try:
            call_runtime({'op':'release','id':b['id']},api['CARDS_SECRET'])
        except Exception:
            pass

    def advance_battle(room, b, now):
        result = engine_battle(b)
        if result['done']:
            finish_battle(room,b,result,now)
            return result
        # 截止时间只随实际新一回合推进更新，轮询、刷新和重复提交均不延长十秒期限。
        if b['deadline'] <= now:
            choices = [c for c in result['hand'] if c['usable']]
            chosen = secrets.choice(choices)
            b['actions'].append([result['actor'], chosen['code'], chosen['cost']])
            b['turn'] += 1
            b['deadline'] = now + TURN_SECONDS
            key = b['keys'][result['side']]
            log(room, (room['players'][key]['team'] if key else '试炼') + ' 出牌超时，系统随机打出可用手牌。')
            result = engine_battle(b)
            update_battle_hp(room,b,result)
            if result['done']:
                finish_battle(room,b,result,now)
        return result

    def tick(room,now):
        if room['status']=='waiting' and now-room['created']>3600:
            room['status']='finished';db().execute('DELETE FROM cards_arena_member WHERE room_id=?',(room['id'],))
        if room['mode']=='public' and room['status']=='cooldown' and now>=room['next_start']:
            archive_id=PUBLIC_ID+'-R'+str(room['round'])
            if not db().execute('SELECT id FROM cards_arena_room WHERE id=?',(archive_id,)).fetchone():
                archived=dict(room,id=archive_id,status='archived');insert(archived)
            fresh=new_room(PUBLIC_ID,now=room['next_start'],round_no=room['round']+1);fresh['version']=room['version'];room.clear();room.update(fresh)
            log(room,'公房第 '+str(room['round'])+' 局自动开始，可自由加入。')
        if room['status']!='active':return
        end_if_needed(room,now)
        for _ in range(1200):
            pending=[b for b in room['battles'].values() if not b.get('done')]
            hazard_at=room['started']+(room['hazard_tick']+1)*10
            ai_at=room['started']+(room['ai_tick']+1)*6
            due=min([hazard_at,ai_at]+[b['deadline'] for b in pending])
            if due>now or room['status']!='active':break
            if ai_at<=due:
                room['ai_tick']+=1;move_ais(room,due)
            if hazard_at<=due:
                room['hazard_tick']+=1;room['phase']=min(9,room['hazard_tick']//9)
                if room['phase']==9:
                    if len(alive(room))+sum(n['alive'] for n in room['npcs'])!=1:
                        for p in alive(room):eliminate(room,p,'安全区域完全封锁')
                    for npc in room['npcs']:
                        if npc['alive']:kill_npc(room,npc,'在安全区域完全封锁后死亡。')
                    end_round(room,due,'安全区域完全封锁，本局结束。');break
                closed=set(closed_cells(room))
                for p in alive(room):
                    if p['zone'] in closed:
                        damage=math.ceil(p['card']['stats']['hp']*(.06+.01*room['phase']));p['hp']-=damage
                        active=room['battles'].get(p.get('battle'))
                        if active and not active.get('done'):active['hazard'][active['keys'].index(p['key'])]+=damage
                        if p['hp']<=0:eliminate(room,p,'危险区域伤害')
                for npc in room['npcs']:
                    if npc['alive'] and npc['zone'] in closed:
                        damage=math.ceil(npc['card']['stats']['hp']*(.06+.01*room['phase']));npc['hp']-=damage
                        active=room['battles'].get(npc.get('battle'))
                        if active and not active.get('done'):active['hazard'][1]+=damage
                        if npc['hp']<=0:kill_npc(room,npc,'因禁区伤害死亡。')
            for battle in pending:
                if any(key is not None and not room['players'][key]['alive'] for key in battle['keys']) or (battle.get('npc_id') and not next(n for n in room['npcs'] if n['id']==battle['npc_id'])['alive']):
                    battle['done']=True
                    for key in battle['keys']:
                        if key is not None:room['players'][key]['battle']=None
                    if battle.get('npc_id'):
                        npc=next(n for n in room['npcs'] if n['id']==battle['npc_id']);npc['battle']=None;retire_finished(room,npc)
                    try:call_runtime({'op':'release','id':battle['id']},api['CARDS_SECRET'])
                    except Exception:pass
                elif battle['deadline']<=due and room['status']=='active':advance_battle(room,battle,battle['deadline'])
            end_if_needed(room,due)
        if room['status']=='cooldown' and now>=room['next_start']:tick(room,now)

    def maintenance(background=False):
        # HTTP 和独立计时进程共用事务锁，无人浏览也能缩圈、托管与自动开局。
        conn=db();conn.execute('BEGIN IMMEDIATE')
        try:
            if not conn.execute('SELECT id FROM cards_arena_room WHERE id=?',(PUBLIC_ID,)).fetchone():
                room=new_room(PUBLIC_ID);log(room,'公房已开放，可自由加入。');insert(room)
            rows=conn.execute("SELECT state_json FROM cards_arena_room WHERE status IN ('active','waiting','cooldown')").fetchall()
            for row in rows:
                room=json.loads(row['state_json'])
                if room.get('protocol')!=3:
                    # 旧公房不能停在过期协议上；清退旧参赛者并原地建立新的公共世界。
                    db().execute('DELETE FROM cards_arena_member WHERE room_id=?',(room['id'],))
                    if room['id']==PUBLIC_ID:
                        room=new_room(PUBLIC_ID,round_no=int(room.get('round',0))+1)
                        log(room,'公房已升级至当前规则并重新开放。')
                    else:
                        room['status']='finished';room['finish_reason']='房间规则已升级，请重新创建私房。'
                else:tick(room,clock())
                if background and room['id']==PUBLIC_ID:room['timer_heartbeat']=clock()
                save(room)
            conn.commit()
        except Exception:conn.rollback();raise
    app.extensions['cards_arena_tick']=maintenance

    def view(room, key):
        now = clock()
        p = room['players'].get(key)
        if room['mode']=='private' and (not p or p.get('left')):
            return {'id':room['id'],'mode':'private','locked':True,'status':room['status'],'round':room['round'],'count':len(alive(room)),'server_now':now,'version':room['version']}
        own_battle = room['battles'].get(p.get('battle')) if p else None
        battle = None
        if own_battle and not own_battle.get('done'):
            result = engine_battle(own_battle)
            turn_key = own_battle['keys'][result['side']] if result['side'] is not None else None
            # 结构化逐帧战报由 cards 前端按原对局的颜色与节奏播放。
            battle = {k: result[k] for k in ('states', 'actor', 'side', 'done', 'log', 'frames', 'rounds')}
            # 前端以此定位尖塔界面左右两侧；战斗本身仍完全由服务端 tswn 会话裁决。
            battle.update({'id': own_battle['id'], 'turn': own_battle['turn'], 'deadline': own_battle['deadline'], 'your_turn': turn_key == key, 'your_side': own_battle['keys'].index(key), 'hand': result['hand'] if turn_key == key else [], 'pvp': own_battle['pvp']})
        visible = []
        for other in room['players'].values():
            if other.get('left'):
                continue
            visible.append({**{k: other[k] for k in ('key', 'team', 'alive','score','kills','death')},'name':other['card']['name'],'clan':other['card']['clan'],'busy':bool(other.get('battle'))})
        # 只公开 AI 身份、存活和分数；位置仍完全处于地图迷雾中。
        ai_visible=[{'id':n['id'],'name':n['card']['name'],'clan':n['card']['clan'],'kind':n.get('kind','trial'),'alive':n['alive'],'score':n.get('score',0),'kills':n.get('kills',0),'busy':bool(n.get('battle'))} for n in room['npcs'] if not n.get('retired')]
        stock = []
        if p and p['alive'] and p['zone'] in SHOPS and room['status'] == 'active':
            stock_key = str(room['phase']) + ':' + str(CELLS[p['zone']]['region'])
            if stock_key not in room['shops']:
                seed = room['seed'] ^ ((CELLS[p['zone']]['region'] or 0)*0x51ed) ^ (room['phase']*0x1571)
                room['shops'][stock_key] = runtime(op='shop', seed=seed, clan='补给站', layer=min(10,room['phase']+1))['stock']
            stock = [{**i, 'sold': i['id'] in p['purchased']} for i in room['shops'][stock_key]]
        mine = None if not p else {k: p[k] for k in ('key', 'team', 'alive', 'zone', 'hp', 'score', 'kills', 'death', 'card', 'potions', 'ready_at', 'left','weapons','large_potions','last_battle','found_corpse')}
        region_names=room.get('region_names') or [entry[0] for entry in REGIONS]
        zones=[{**cell,'name':region_names[cell['region']] if cell['region'] is not None else '野外'} for cell in CELLS]
        return {'protocol':3,'id':room['id'],'mode':room['mode'],'locked':False,'round':room['round'],'status':room['status'],'host':room['host'],'winner':room.get('winner'),'winner_name':room.get('winner_name'),'players':visible,'ai':ai_visible,'me':mine,'battle':battle,'stock':stock,'phase':room['phase'],'closed':closed_cells(room),'next_close':room['close_stages'][room['phase']] if room['phase']<9 else [],'next_close_at':room['started']+(room['phase']+1)*90 if room.get('started') and room['phase']<9 else None,'next_start':room.get('next_start'),'zones':zones,'log':room['log'][-100:],'log_count':len(room['log']),'ai_alive':sum(n['alive'] for n in room['npcs']),'corpses':[{'id':c['id'],'name':c['name']} for c in room['corpses'] if p and c['id']==p.get('found_corpse') and not c['looted'] and same_area(c['zone'],p['zone'])],'server_now':now,'version':room['version'],'started':bool(room.get('started')),'ending':room.get('ending',False),'ladder':room.get('ladder') if room['status'] in ('finished','cooldown') else None,'finish_reason':room.get('finish_reason','')}


    def new_player(user,body=None):
        # 访客只能得到运行时随机名字；登录用户仍可填写展示名，双方都不能导入单人存档。
        clan = re.sub(r'[\r\n@+]', '', user['teamname'])[:40] or '旅人'
        body=body or {};name=str(body.get('name','')).strip()
        if user.get('guest'):
            clan='系统旅人';name=''
        elif '@' in name:name,clan=name.rsplit('@',1)
        elif body.get('clan'):clan=str(body['clan']).strip()
        if len(name)>100 or not clan or len(clan)>80 or any(c in name+clan for c in '\r\n@+'):raise Error(400,'arena_name','请输入合法的名字@战队；本名最多 100 字，战队最多 80 字，不含 + 或换行。')
        card=runtime(op='create',seed=secrets.randbits(32),clan=clan,name=name)['card']
        return {'key': user['user_key'], 'team': user['teamname'], 'card': card, 'hp': card['stats']['hp'], 'score': 1500, 'zone': 4, 'alive': True, 'kills': 0, 'death': '', 'battle': None, 'potions': 2, 'purchased': [], 'ready_at': 0, 'receipts': [], 'left': False,'weapons':[],'large_potions':0,'last_battle':None,'found_corpse':None}

    def identity(write=False):
        api['rate_limit'](600 if write else 900)
        user = api['current_user']()
        if user is None:
            # 匿名身份由浏览器保存的高熵 UUID 派生，不共享登录态也不会接纳自定义角色。
            guest_id=request.headers.get('X-Cards-Arena-Guest','')
            if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',guest_id,re.I):
                user={'user_key':'guest:'+guest_id.lower(),'teamname':'随机访客','guest':True}
            else:
                user=api['require_user']()
        if write:
            api['check_csrf'](user['user_key'])
        return user

    @router.get('/api/cards/arena/session')
    def arena_session():
        api['rate_limit'](900)
        user=identity()
        return api['ok']({'logged_in':not user.get('guest',False),'guest':bool(user.get('guest')),'teamname':user['teamname'],'csrf_token':api['csrf_for'](user['user_key'])})

    @router.get('/api/cards/arena/health')
    def arena_health():
        # 同源部署验收检查真实存储与 WASM，不能以静态构建成功代替后端可用。
        api['rate_limit'](60)
        row=db().execute('SELECT state_json FROM cards_arena_room WHERE id=?',(PUBLIC_ID,)).fetchone()
        heartbeat=json.loads(row['state_json']).get('timer_heartbeat',0) if row else 0
        result=runtime(op='health')
        return api['ok']({'bundle_revision':result.get('revision',''),'runtime_ready':bool(result.get('ready')),'timer_ready':0<=clock()-heartbeat<15,'timer_heartbeat':heartbeat,'protocol':3})

    @router.get('/api/cards/arena/rooms')
    def arena_rooms():
        api['rate_limit'](900)
        user = identity()
        maintenance()
        rows = db().execute("SELECT state_json FROM cards_arena_room WHERE status IN ('waiting','active','cooldown') ORDER BY updated DESC LIMIT 40").fetchall()
        rooms = []
        for row in rows:
            r = json.loads(row['state_json'])
            if r['status'] == 'waiting' and clock()-r['created']>3600:
                continue
            rooms.append({'id':r['id'],'status':r['status'],'count':len([p for p in r['players'].values() if not p.get('left')]),'alive':len(alive(r)),'host':r['players'][r['host']]['team'] if r.get('host') in r['players'] else '公共房间','mode':r.get('mode','private'),'round':r.get('round',1),'next_start':r.get('next_start'),
                # 大厅只展示公房概况，不暴露玩家位置或未发现目标。
                'map_cells':CELL_COUNT if r.get('mode')=='public' else None,'phase':r.get('phase',0),'closed_count':len(closed_cells(r)),'ai_alive':sum(n['alive'] for n in r.get('npcs',[])),'next_close_at':r.get('started',0)+(r.get('phase',0)+1)*90 if r.get('started') and r.get('phase',0)<9 else None})
        active = db().execute('SELECT room_id FROM cards_arena_member WHERE user_key=?',(user['user_key'],)).fetchone() if user else None
        return api['ok']({'rooms':rooms,'logged_in':not user.get('guest',False),'guest':bool(user.get('guest')),'my_room':active['room_id'] if active else None})

    @router.get('/api/cards/arena/history')
    def arena_match_history():
        # 私房结算不对外公开；公房保留最近十局的固定结算快照。
        api['rate_limit'](120)
        rows=db().execute("SELECT state_json FROM cards_arena_room WHERE status IN ('cooldown','archived') ORDER BY updated DESC LIMIT 80").fetchall()
        matches=[]
        for row in rows:
            room=json.loads(row['state_json'])
            if room.get('mode')!='public' or not room.get('finished_at'):
                continue
            matches.append({'victory':'最终存活','score':round(room.get('winner_score',0)),'name':room.get('winner_card_name') or room.get('winner_name') or '无人','clan':room.get('winner_clan') or '—','finished_at':room['finished_at']})
            if len(matches)>=10:
                break
        return api['ok']({'matches':matches})

    @router.post('/api/cards/arena/rooms')
    def arena_create():
        user=identity(True)
        if user.get('guest'):
            raise Error(403,'arena_guest_private','随机访客只能加入公房；登录后才能创建私房。')
        conn=db();conn.execute('BEGIN IMMEDIATE')
        try:
            old=conn.execute('SELECT room_id FROM cards_arena_member WHERE user_key=?',(user['user_key'],)).fetchone()
            if old:
                raise Error(409,'arena_already_joined','你已经在房间 '+old['room_id']+' 中，请先返回该房间。')
            body=api['json_body']();password=str(body.get('key',''))
            if len(password)<4 or len(password)>80:raise Error(400,'arena_key','私房密钥需要 4～80 个字符。')
            p=new_player(user,body);code=secrets.token_hex(3).upper()
            room=new_room(code,host=p['key'],private_key=password);room['players'][p['key']]=p;retire_matching(room,p)
            log(room,p['team']+' 创建了房间。')
            conn.execute('INSERT INTO cards_arena_room VALUES (?,?,?,?)',(code,'waiting',json.dumps(room,ensure_ascii=False),clock()))
            conn.execute('INSERT INTO cards_arena_member VALUES (?,?)',(p['key'],code))
            out=view(room,p['key']);save(room);conn.commit()
            return api['ok']({'room':out},201)
        except Exception:
            conn.rollback();raise

    @router.get('/api/cards/arena/rooms/<room_id>')
    def arena_room(room_id):
        user=identity()
        if room_id.upper()==PUBLIC_ID and not db().execute('SELECT id FROM cards_arena_room WHERE id=?',(PUBLIC_ID,)).fetchone():maintenance()
        conn=db();conn.execute('BEGIN IMMEDIATE')
        try:
            room=load(room_id.upper())
            if user.get('guest') and room['mode']!='public':
                raise Error(403,'arena_guest_private','随机访客只能加入公房；登录后才能进入私房。')
            tick(room,clock());out=view(room,user['user_key']);save(room);conn.commit()
            return api['ok']({'room':out})
        except Exception:
            conn.rollback();raise
    def begin_battle(room, me, target=None,npc=None):
        if target is not None:
            if not target['alive'] or not same_area(target['zone'],me['zone']) or target.get('battle') or target['key'] == me['key']:
                raise Error(409, 'arena_target', '对手已移动、被淘汰或正在交战。')
            cards, hp, keys = [me['card'],target['card']], [me['hp'],target['hp']], [me['key'],target['key']]
        else:
            npc=npc or {'id':secrets.token_hex(8),'zone':me['zone'],'seed':secrets.randbits(32),'alive':True,'battle':None,'card':None,'hp':None}
            if npc not in room['npcs']:
                room['npcs']=[n for n in room['npcs'] if n['alive'] or n.get('battle')];room['npcs'].append(npc)
            if npc['card'] is None:npc['card']=runtime(op='npc',seed=npc['seed'],layer=room['phase'])['card'];npc['hp']=npc['card']['stats']['hp']
            cards,hp,keys=[me['card'],npc['card']],[me['hp'],npc['hp']],[me['key'],None]
        b={'id':secrets.token_hex(12),'seed':secrets.randbits(32),'pvp':target is not None,'cards':cards,'hp':hp,'keys':keys,'actions':[],'turn':0,'deadline':clock()+TURN_SECONDS,'done':False,'hazard':[0,0],'npc_id':npc['id'] if target is None else None}
        room['battles']={k:v for k,v in room['battles'].items() if not v.get('done')}
        room['battles'][b['id']]=b
        me['battle']=b['id']
        if target is None:npc['battle']=b['id']
        if target is not None:
            target['battle']=b['id']
        log(room,actor_name(me)+' 与 '+actor_name(target if target else npc)+' 开始交战。')
        result=engine_battle(b)
        update_battle_hp(room,b,result)
        if result['done']:
            finish_battle(room,b,result)

    def update_battle_hp(room,b,result):
        for side,key in enumerate(b['keys']):
            if key is not None and room['players'][key]['alive']:
                p=room['players'][key]
                p['hp']=max(0,min(p['card']['stats']['hp'],result['root_hp'][side])-b['hazard'][side])
        if b.get('npc_id'):
            npc=next(n for n in room['npcs'] if n['id']==b['npc_id'])
            if npc['alive']:npc['hp']=max(0,result['root_hp'][1]-b['hazard'][1])

    @router.get('/api/cards/arena/rooms/<room_id>/log')
    def arena_history(room_id):
        user=identity();room=load(room_id.upper())
        if room['mode']=='private':player(room,user['user_key'])
        try:before=int(request.args.get('before',len(room['log'])+1))
        except ValueError:raise Error(400,'arena_log','历史消息编号无效。')
        return api['ok']({'log':[e for e in room['log'] if e['seq']<before][-100:],'total':len(room['log'])})

    @router.post('/api/cards/arena/rooms/<room_id>/actions')
    def arena_action(room_id):
        user=identity(True)
        body=api['json_body']()
        action_id=str(body.get('action_id',''))
        if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',action_id):
            raise Error(400,'arena_action_id','操作缺少唯一编号，请刷新后重试。')
        conn=db();conn.execute('BEGIN IMMEDIATE')
        try:
            room=load(room_id.upper());now=clock();tick(room,now)
            # 时间推进独立提交；过期/非法手牌不能通过事务回滚撤销超时托管或环境伤害。
            save(room);conn.commit();conn.execute('BEGIN IMMEDIATE');room=load(room_id.upper())
            kind=body.get('kind')
            if kind=='join':
                public=room['mode']=='public'
                if user.get('guest') and not public:
                    raise Error(403,'arena_guest_private','随机访客只能加入公房；登录后才能进入私房。')
                if room['status']!='waiting' and not (public and room['status']=='active'):raise Error(409,'arena_started','当前不能加入，请等待下一局。')
                if not public and not check_password_hash(room['key_hash'],str(body.get('key',''))):raise Error(403,'arena_key','私房密钥不正确。')
                prior=room['players'].get(user['user_key'])
                if public and prior and (not prior['alive'] or prior.get('left')):raise Error(409,'arena_eliminated','本局已经淘汰，请等待下一局。')
                old=conn.execute('SELECT room_id FROM cards_arena_member WHERE user_key=?',(user['user_key'],)).fetchone()
                if old and old['room_id']!=room['id']:
                    raise Error(409,'arena_already_joined','请先退出房间 '+old['room_id']+'。')
                p=room['players'].get(user['user_key'])
                if not p or p.get('left'):
                    if len([x for x in room['players'].values() if not x.get('left')])>=(81 if public else 12):
                        raise Error(409,'arena_full','房间人数已满。')
                    p=p or new_player(user,body);p['left']=False
                    if public:p['zone']=secrets.choice([i for i in range(CELL_COUNT) if i not in closed_cells(room)])
                    room['players'][p['key']]=p
                    conn.execute('INSERT INTO cards_arena_member VALUES (?,?) ON CONFLICT(user_key) DO UPDATE SET room_id=excluded.room_id',(p['key'],room['id']))
                    retire_matching(room,p)
                    log(room,actor_name(p)+'加入游戏。')
            else:
                p=player(room,user['user_key'])
            if action_id in p['receipts']:
                out=view(room,p['key']);save(room);conn.commit();return api['ok']({'room':out})
            if kind=='join':
                pass
            elif kind=='ack_battle':
                # 结算已读写回房间，重新进入多人模式不会重复弹出旧战斗结果。
                if p.get('last_battle') and body.get('battle')==p['last_battle'].get('id'):
                    p['last_battle']=None
            elif kind=='leave':
                if room['status']=='active':
                    eliminate(room,p,'退出对局');end_if_needed(room)
                elif room['mode']=='public':
                    p['left']=True
                else:
                    p['left']=True
                    members=[x for x in room['players'].values() if not x.get('left')]
                    if not members:
                        room['status']='finished'
                    elif room['host']==p['key']:
                        room['host']=members[0]['key']
                conn.execute('DELETE FROM cards_arena_member WHERE user_key=? AND room_id=?',(p['key'],room['id']))
            elif kind=='start':
                if room['host']!=p['key'] or room['status']!='waiting' or len(alive(room))<2:
                    raise Error(409,'arena_cannot_start','需要房主操作，且至少两人加入后才能开局。')
                import random
                rng=random.Random(room['seed'])
                positions=list(range(CELL_COUNT));rng.shuffle(positions)
                for i,who in enumerate(alive(room)):
                    who['zone']=positions[i%CELL_COUNT]
                room.update(status='active',started=now)
                log(room,'本局开始。每 90 秒新增一个危险区域，最后存活者获胜。')
            else:
                if room['status']!='active' or not p['alive']:
                    raise Error(409,'arena_not_active','本局未开始、已结束，或你已被淘汰。')
                if kind=='card':
                    b=room['battles'].get(p.get('battle'))
                    if not b or b.get('done'):
                        raise Error(409,'arena_no_battle','当前没有正在进行的战斗。')
                    result=engine_battle(b)
                    if body.get('turn')!=b['turn'] or result['side'] is None or b['keys'][result['side']]!=p['key']:
                        raise Error(409,'arena_wrong_turn','当前不是你的出牌回合，或这张手牌已过期。')
                    chosen=next((c for c in result['hand'] if c['id']==body.get('card') and c['usable']),None)
                    if chosen is None:
                        raise Error(400,'arena_bad_card','这张手牌不可用，或 MP 不足。')
                    b['actions'].append([result['actor'],chosen['code'],chosen['cost']])
                    b['turn']+=1;b['deadline']=now+TURN_SECONDS
                    result=engine_battle(b);update_battle_hp(room,b,result)
                    if result['done']:
                        finish_battle(room,b,result)
                else:
                    if p.get('battle'):
                        raise Error(409,'arena_busy','正在交战，不能移动或使用地图补给。')
                    if now<p['ready_at']:
                        raise Error(429,'arena_cooldown','操作稍快，请等待冷却结束。')
                    if kind=='move':
                        target=body.get('zone')
                        if isinstance(target,bool) or not isinstance(target,int) or target not in range(CELL_COUNT) or target in closed_cells(room):
                            raise Error(400,'arena_zone','不能移动到不存在或已经危险的区域。')
                        p['zone']=target;p['ready_at']=now+2
                        p['found_corpse']=None
                        encounter(room,p,35)
                    elif kind=='search':
                        p['ready_at']=now+3
                        if encounter(room,p,45):pass
                        else:
                            # 区域决定掉落倾向；点击地图不掷奖励，行动区搜索才触发。
                            tables={'wild':['points']*5+['hp']*3+['skill','weapon'],'supplies':['hp']*5+['large']*2+['points']*3,'healing':['hp']*5+['large']*4+['points'],'skill':['skill']*7+['points']*2+['large'],'weapon':['weapon']*7+['points']*2+['hp'],'mixed':['points','hp','large','skill','weapon']}
                            kind_loot=secrets.choice(tables[CELLS[p['zone']]['loot']])
                            if kind_loot=='points':
                                gain=180+secrets.randbelow(121);p['score']+=gain;reward=str(gain)+' 天梯分数'
                            elif kind_loot in ('hp','large'):
                                field='potions' if kind_loot=='hp' else 'large_potions';p[field]+=1;reward='一瓶'+('生命药水' if kind_loot=='hp' else '大瓶生命药水')
                            else:
                                stock=runtime(op='shop',seed=secrets.randbits(32),clan='补给站',layer=min(10,room['phase']+1))['stock']
                                item=next(i for i in stock if i['kind']==kind_loot and (kind_loot!='skill' or i.get('rarity')!='gold'))
                                if kind_loot=='weapon':p['weapons'].append(item['weapon']);reward='武器「'+item['weapon']['name']+'」（在物品栏装备）'
                                else:p['card']=runtime(op='buy',card=p['card'],item=item,seed=0)['card'];reward='技能锻造增量 '+item['skill']['id']+' +'+str(item['skill']['lv'])
                            log(room,p['team']+' 搜索获得 '+reward+'。')
                    elif kind=='loot':
                        corpse=next((c for c in room['corpses'] if c['id']==body.get('corpse') and c['id']==p.get('found_corpse') and not c['looted'] and same_area(c['zone'],p['zone'])),None)
                        if corpse is None:raise Error(400,'arena_corpse','尸体尚未发现、已被搜刮或已经离开范围。')
                        corpse['looted']=True;p['found_corpse']=None;p['score']+=150;p['ready_at']=now+2
                        if corpse['weapons']:p['weapons'].append(secrets.choice(corpse['weapons']));reward='一把武器和 150 天梯分数'
                        else:p['potions']+=1;reward='一瓶生命药水和 150 天梯分数'
                        log(room,actor_name(p)+'搜刮了 '+corpse['name']+' 的尸体，获得'+reward+'。')
                    elif kind=='attack':
                        target=room['players'].get(str(body.get('target','')))
                        if target is None:
                            raise Error(404,'arena_target','对手不存在。')
                        begin_battle(room,p,target)
                    elif kind=='buy':
                        offers=view(room,p['key'])['stock']
                        item=next((i for i in offers if i['id']==body.get('item')),None)
                        if item is None or item['sold'] or p['score']<item['price']:
                            raise Error(400,'arena_buy','商品不在当前补给站、已经售出，或分数不足。')
                        if item['kind']=='potion':
                            p['potions']+=item['potion']['n']
                        else:
                            p['card']=runtime(op='buy',card=p['card'],item=item,seed=0)['card']
                            p['hp']=min(p['hp'],p['card']['stats']['hp'])
                        if item['kind']=='weapon':p['weapons'].append(item['weapon'])
                        p['score']-=item['price'];p['purchased'].append(item['id']);p['ready_at']=now+1
                        log(room,p['team']+' 在补给站购买了'+{'weapon':'武器（立即装备）','skill':'技能锻造增量','potion':'生命药水'}[item['kind']]+'。')
                    elif kind=='equip':
                        weapon=next((w for w in p['weapons'] if w['id']==body.get('item')),None)
                        if body.get('item') is not None and weapon is None:raise Error(400,'arena_weapon','没有这把武器。')
                        p['card']=runtime(op='equip',card=p['card'],weapon=weapon,seed=0)['card'];p['hp']=min(p['hp'],p['card']['stats']['hp']);p['ready_at']=now+1
                    elif kind=='heal':
                        field='large_potions' if body.get('large') is True else 'potions'
                        if p[field]<1 or p['hp']>=p['card']['stats']['hp']:
                            raise Error(400,'arena_heal','没有药水或当前生命已满。')
                        p[field]-=1;p['hp']=min(p['card']['stats']['hp'],p['hp']+math.ceil(p['card']['stats']['hp']*(.6 if field=='large_potions' else .35)));p['ready_at']=now+1
                        log(room,p['team']+' 使用生命药水，立刻恢复生命。')
                    elif kind=='rest':
                        if p['score']<100 or p['hp']>=p['card']['stats']['hp']:
                            raise Error(400,'arena_rest','休整需要 100 局内分数，且当前生命未满。')
                        p['score']-=100;p['hp']=min(p['card']['stats']['hp'],p['hp']+math.ceil(p['card']['stats']['hp']*.2));p['ready_at']=now+5
                    else:
                        raise Error(400,'arena_action','未知操作。')
            p['receipts']=(p['receipts']+[action_id])[-32:]
            end_if_needed(room);out=view(room,p['key']);save(room);conn.commit()
            return api['ok']({'room':out})
        except Exception:
            conn.rollback();raise
