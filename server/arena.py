"""独立多人存活模式：房间事务、移动探索、禁区、服务端商店与双人手牌战斗。"""
from __future__ import annotations
import json
import math
import re
import secrets
import time
from flask import request
from arena_runtime import call_runtime

ZONES = ['云阶入口', '蓝桥集市', '碎光庭院', '旧观测台', '星环中枢', '风铃走廊', '青石驿站', '薄雾港', '落日坡']
SHOPS = {1, 4, 6}
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


def install_arena(app, api):
    db, Error = api['db'], api['ApiError']
    clock = lambda: time.time()
    with app.app_context():
        db().executescript(SCHEMA)
        db().commit()

    def runtime(**payload):
        try:
            return call_runtime(payload, api['CARDS_SECRET'])
        except Exception as exc:
            raise Error(503, 'arena_engine', '多人战斗服务暂不可用，请稍后重试。') from exc

    def log(room, text):
        room['log'].append({'at': clock(), 'text': text})
        room['log'] = room['log'][-60:]

    def save(room):
        room['version'] += 1
        db().execute('UPDATE cards_arena_room SET status=?,state_json=?,updated=? WHERE id=?', (room['status'], json.dumps(room, ensure_ascii=False), clock(), room['id']))

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

    def end_if_needed(room):
        if room['status'] != 'active':
            return
        remaining = alive(room)
        if len(remaining) <= 1:
            room['ladder'] = runtime(op='ladder',seed=0)
            room['ending'] = bool(remaining and room['ladder'].get('score') is not None and remaining[0]['score'] > room['ladder']['score'])
            room['status'] = 'finished'
            room['winner'] = remaining[0]['key'] if remaining else None
            log(room, ('最终存活：' + remaining[0]['team']) if remaining else '所有参赛者均已淘汰，本局无人存活。')
            db().execute('DELETE FROM cards_arena_member WHERE room_id=?', (room['id'],))

    def eliminate(room, p, reason):
        if not p['alive']:
            return
        p['alive'], p['hp'] = False, 0
        p['death'] = reason
        p['battle'] = None
        log(room, p['team'] + ' 被淘汰：' + reason)

    def engine_battle(b):
        return runtime(op='battle', id=b['id'], seed=b['seed'], cards=b['cards'], hp=b['hp'], pvp=b['pvp'], actions=b['actions'])

    def finish_battle(room, b, result):
        # 只结算一次；角色与分数均从服务器战报推导，浏览器没有上传结算结果的接口。
        if b.get('done'):
            return
        b['done'] = True
        living = [i for i, hp in enumerate(result['root_hp']) if hp > 0]
        winner = next((i for i in range(2) if any(s['input_team_index'] == i and s['owner_id'] is None and s['team_index'] in result['winner'] for s in result['initial'])), None)
        if winner is None and living:
            winner = max(living, key=lambda i: result['root_hp'][i] / b['cards'][i]['stats']['hp'])
        for side, key in enumerate(b['keys']):
            if key is None:
                continue
            p = room['players'][key]
            p['battle'] = None
            if side != winner:
                eliminate(room, p, '玩家交战失利' if b['pvp'] else '试炼失利')
            else:
                surviving_hp=result['root_hp'][side] or max([s['hp'] for s in result['states'] if s['team_index'] in result['winner'] and s['alive']]+[1])
                p['hp'] = max(0,min(p['card']['stats']['hp'], surviving_hp)-b['hazard'][side])
                if p['hp']<=0:
                    eliminate(room,p,'危险区域伤害')
                    continue
                p['kills'] += int(b['pvp'])
                points = (1000 if b['pvp'] else 850) + (min(1000, room['players'][b['keys'][1-side]]['score'] // 2) if b['pvp'] else 0)
                p['score'] += points
                log(room, p['team'] + ' 赢得' + ('玩家交战' if b['pvp'] else '试炼') + '，获得 ' + str(points) + ' 天梯分数。')
        end_if_needed(room)
        try:
            call_runtime({'op':'release','id':b['id']},api['CARDS_SECRET'])
        except Exception:
            pass

    def advance_battle(room, b, now):
        result = engine_battle(b)
        if result['done']:
            finish_battle(room, b, result)
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
                finish_battle(room, b, result)
        return result

    def tick(room, now):
        if room['status'] == 'waiting' and now-room['created'] > 3600:
            room['status'] = 'finished'
            db().execute('DELETE FROM cards_arena_member WHERE room_id=?', (room['id'],))
        if room['status'] != 'active':
            return
        # 按真实时间顺序追算环境与十秒托管；所有人离线也不能暂停或重置回合。
        for _ in range(1200):
            pending=[b for b in room['battles'].values() if not b.get('done')]
            hazard_at=room['started']+(room['hazard_tick']+1)*10
            due=min([hazard_at]+[b['deadline'] for b in pending])
            if due>now or room['status']!='active':
                break
            if hazard_at<=due:
                room['hazard_tick']+=1
                phase=min(9,room['hazard_tick']//9)
                closed=set(room['close_order'][:phase])
                for p in alive(room):
                    if p['zone'] in closed:
                        damage=math.ceil(p['card']['stats']['hp']*(.06+.01*phase))
                        p['hp']-=damage
                        active=room['battles'].get(p.get('battle'))
                        if active and not active.get('done'):
                            active['hazard'][active['keys'].index(p['key'])]+=damage
                        if p['hp']<=0:
                            eliminate(room,p,'危险区域伤害')
            for battle in pending:
                if any(key is not None and not room['players'][key]['alive'] for key in battle['keys']):
                    battle['done']=True
                    for key in battle['keys']:
                        if key is not None:
                            room['players'][key]['battle']=None
                    try:
                        call_runtime({'op':'release','id':battle['id']},api['CARDS_SECRET'])
                    except Exception:
                        pass
                elif battle['deadline']<=due and room['status']=='active':
                    advance_battle(room,battle,battle['deadline'])
            end_if_needed(room)
        room['phase']=min(9,max(0,int((now-room['started'])//90)))

    def view(room, key):
        now = clock()
        p = room['players'].get(key)
        own_battle = room['battles'].get(p.get('battle')) if p else None
        battle = None
        if own_battle and not own_battle.get('done'):
            result = engine_battle(own_battle)
            turn_key = own_battle['keys'][result['side']] if result['side'] is not None else None
            battle = {k: result[k] for k in ('states', 'actor', 'side', 'done', 'log', 'rounds')}
            battle.update({'id': own_battle['id'], 'turn': own_battle['turn'], 'deadline': own_battle['deadline'], 'your_turn': turn_key == key, 'hand': result['hand'] if turn_key == key else [], 'pvp': own_battle['pvp']})
        visible = []
        for other in room['players'].values():
            if other.get('left'):
                continue
            visible.append({**{k: other[k] for k in ('key', 'team', 'alive', 'zone', 'hp', 'score', 'kills', 'death')},'busy':bool(other.get('battle'))})
        stock = []
        if p and p['alive'] and p['zone'] in SHOPS and room['status'] == 'active':
            stock_key = str(room['phase']) + ':' + str(p['zone'])
            if stock_key not in room['shops']:
                seed = room['seed'] ^ (p['zone']*0x51ed) ^ (room['phase']*0x1571)
                room['shops'][stock_key] = runtime(op='shop', seed=seed, clan='补给站', layer=min(10,room['phase']+1))['stock']
            stock = [{**i, 'sold': i['id'] in p['purchased']} for i in room['shops'][stock_key]]
        mine = None if not p else {k: p[k] for k in ('key', 'team', 'alive', 'zone', 'hp', 'score', 'kills', 'death', 'card', 'potions', 'ready_at', 'left')}
        return {'id': room['id'], 'status': room['status'], 'host': room['host'], 'winner': room.get('winner'), 'players': visible, 'me': mine, 'battle': battle, 'stock': stock, 'phase': room['phase'], 'closed': room['close_order'][:room['phase']], 'next_close': room['close_order'][room['phase']] if room['phase']<len(room['close_order']) else None, 'next_close_at': room['started']+(room['phase']+1)*90 if room.get('started') else None, 'zones': [{'id': i, 'name': name, 'shop': i in SHOPS} for i,name in enumerate(ZONES)], 'log': room['log'][-24:], 'server_now': now, 'version': room['version'], 'started':bool(room.get('started')), 'ending':room.get('ending',False), 'ladder':room.get('ladder') if room['status']=='finished' else None}

    def new_player(user):
        # 身份来自登录态，名字由服务器生成；不能导入单人存档或伪造角色数值。
        clan = re.sub(r'[\r\n@+]', '', user['teamname'])[:40] or '旅人'
        card = runtime(op='create', seed=secrets.randbits(32), clan=clan)['card']
        return {'key': user['user_key'], 'team': user['teamname'], 'card': card, 'hp': card['stats']['hp'], 'score': 1500, 'zone': 4, 'alive': True, 'kills': 0, 'death': '', 'battle': None, 'potions': 2, 'purchased': [], 'ready_at': 0, 'receipts': [], 'left': False}

    def identity(write=False):
        api['rate_limit'](600 if write else 900)
        user = api['require_user']()
        if write:
            api['check_csrf'](user['user_key'])
        return user

    @app.get('/api/cards/arena/rooms')
    def arena_rooms():
        api['rate_limit'](900)
        user = api['current_user']()
        rows = db().execute("SELECT state_json FROM cards_arena_room WHERE status IN ('waiting','active') ORDER BY updated DESC LIMIT 40").fetchall()
        rooms = []
        for row in rows:
            r = json.loads(row['state_json'])
            if r['status'] == 'waiting' and clock()-r['created']>3600:
                continue
            rooms.append({'id':r['id'],'status':r['status'],'count':len([p for p in r['players'].values() if not p.get('left')]),'alive':len(alive(r)),'host':r['players'][r['host']]['team']})
        active = db().execute('SELECT room_id FROM cards_arena_member WHERE user_key=?',(user['user_key'],)).fetchone() if user else None
        return api['ok']({'rooms':rooms,'logged_in':bool(user),'my_room':active['room_id'] if active else None})

    @app.post('/api/cards/arena/rooms')
    def arena_create():
        user=identity(True)
        conn=db();conn.execute('BEGIN IMMEDIATE')
        try:
            old=conn.execute('SELECT room_id FROM cards_arena_member WHERE user_key=?',(user['user_key'],)).fetchone()
            if old:
                raise Error(409,'arena_already_joined','你已经在房间 '+old['room_id']+' 中，请先返回该房间。')
            p=new_player(user);code=secrets.token_hex(3).upper()
            room={'id':code,'host':p['key'],'status':'waiting','seed':secrets.randbits(32),'version':0,'created':clock(),'started':None,'phase':0,'hazard_tick':0,'close_order':[],'players':{p['key']:p},'battles':{},'shops':{},'log':[]}
            log(room,p['team']+' 创建了房间。')
            conn.execute('INSERT INTO cards_arena_room VALUES (?,?,?,?)',(code,'waiting',json.dumps(room,ensure_ascii=False),clock()))
            conn.execute('INSERT INTO cards_arena_member VALUES (?,?)',(p['key'],code))
            out=view(room,p['key']);save(room);conn.commit()
            return api['ok']({'room':out},201)
        except Exception:
            conn.rollback();raise

    @app.get('/api/cards/arena/rooms/<room_id>')
    def arena_room(room_id):
        user=identity()
        conn=db();conn.execute('BEGIN IMMEDIATE')
        try:
            room=load(room_id.upper());tick(room,clock());out=view(room,user['user_key']);save(room);conn.commit()
            return api['ok']({'room':out})
        except Exception:
            conn.rollback();raise
    def begin_battle(room, me, target=None):
        if target is not None:
            if not target['alive'] or target['zone'] != me['zone'] or target.get('battle') or target['key'] == me['key']:
                raise Error(409, 'arena_target', '对手已移动、被淘汰或正在交战。')
            cards, hp, keys = [me['card'],target['card']], [me['hp'],target['hp']], [me['key'],target['key']]
        else:
            npc=runtime(op='npc',seed=secrets.randbits(32),layer=room['phase'])['card']
            cards,hp,keys=[me['card'],npc],[me['hp'],npc['stats']['hp']],[me['key'],None]
        b={'id':secrets.token_hex(12),'seed':secrets.randbits(32),'pvp':target is not None,'cards':cards,'hp':hp,'keys':keys,'actions':[],'turn':0,'deadline':clock()+TURN_SECONDS,'done':False,'hazard':[0,0]}
        room['battles']={k:v for k,v in room['battles'].items() if not v.get('done')}
        room['battles'][b['id']]=b
        me['battle']=b['id']
        if target is not None:
            target['battle']=b['id']
        log(room,me['team']+' 与 '+(target['team'] if target else npc['name']+'@!')+' 开始交战。')
        result=engine_battle(b)
        update_battle_hp(room,b,result)
        if result['done']:
            finish_battle(room,b,result)

    def update_battle_hp(room,b,result):
        for side,key in enumerate(b['keys']):
            if key is not None and room['players'][key]['alive']:
                p=room['players'][key]
                p['hp']=max(0,min(p['card']['stats']['hp'],result['root_hp'][side])-b['hazard'][side])

    @app.post('/api/cards/arena/rooms/<room_id>/actions')
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
                if room['status']!='waiting':
                    raise Error(409,'arena_started','本局已经开始。')
                old=conn.execute('SELECT room_id FROM cards_arena_member WHERE user_key=?',(user['user_key'],)).fetchone()
                if old and old['room_id']!=room['id']:
                    raise Error(409,'arena_already_joined','请先退出房间 '+old['room_id']+'。')
                p=room['players'].get(user['user_key'])
                if not p or p.get('left'):
                    if len([x for x in room['players'].values() if not x.get('left')])>=12:
                        raise Error(409,'arena_full','房间已满，最多 12 人。')
                    p=p or new_player(user);p['left']=False
                    room['players'][p['key']]=p
                    conn.execute('INSERT OR REPLACE INTO cards_arena_member VALUES (?,?)',(p['key'],room['id']))
                    log(room,p['team']+' 加入房间。')
            else:
                p=player(room,user['user_key'])
            if action_id in p['receipts']:
                out=view(room,p['key']);save(room);conn.commit();return api['ok']({'room':out})
            if kind=='join':
                pass
            elif kind=='leave':
                if room['status']=='active':
                    eliminate(room,p,'退出对局');end_if_needed(room)
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
                order=list(range(9));order.remove(4);rng.shuffle(order);order.append(4)
                positions=list(range(9));rng.shuffle(positions)
                for i,who in enumerate(alive(room)):
                    who['zone']=positions[i%9]
                room.update(status='active',started=now,close_order=order)
                room['ladder']=runtime(op='ladder',seed=0)
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
                        if isinstance(target,bool) or not isinstance(target,int) or target not in range(9) or target in room['close_order'][:room['phase']]:
                            raise Error(400,'arena_zone','不能移动到不存在或已经危险的区域。')
                        if abs(target//3-p['zone']//3)+abs(target%3-p['zone']%3)!=1:
                            raise Error(400,'arena_distance','只能移动到上下左右相邻区域。')
                        p['zone']=target;p['ready_at']=now+2
                        log(room,p['team']+' 移动到 '+ZONES[target]+'。')
                    elif kind=='search':
                        p['ready_at']=now+3
                        roll=secrets.randbelow(100)
                        if roll<45:
                            begin_battle(room,p)
                        elif roll<75:
                            gain=180+secrets.randbelow(121);p['score']+=gain;log(room,p['team']+' 搜索获得 '+str(gain)+' 局内分数。')
                        elif roll<90:
                            p['potions']+=1;log(room,p['team']+' 搜索获得一瓶生命药水。')
                        else:
                            stock=runtime(op='shop',seed=secrets.randbits(32),clan='补给站',layer=1)['stock']
                            item=next(i for i in stock if i['kind']=='skill')
                            p['card']=runtime(op='buy',card=p['card'],item=item,seed=0)['card']
                            log(room,p['team']+' 搜索获得技能锻造增量 '+item['skill']['id']+' +'+str(item['skill']['lv'])+'。')
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
                        p['score']-=item['price'];p['purchased'].append(item['id']);p['ready_at']=now+1
                        log(room,p['team']+' 在补给站购买了'+{'weapon':'武器（立即装备）','skill':'技能锻造增量','potion':'生命药水'}[item['kind']]+'。')
                    elif kind=='heal':
                        if p['potions']<1 or p['hp']>=p['card']['stats']['hp']:
                            raise Error(400,'arena_heal','没有药水或当前生命已满。')
                        p['potions']-=1;p['hp']=min(p['card']['stats']['hp'],p['hp']+math.ceil(p['card']['stats']['hp']*.35));p['ready_at']=now+1
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
