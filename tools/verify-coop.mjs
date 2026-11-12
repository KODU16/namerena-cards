// 真实引擎验证联机人数倍率、全票选路、分数、胜利留人、替补及独立功能节点。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
globalThis.window={};globalThis.document={addEventListener(){},getElementById(){}};
globalThis.localStorage={getItem(){return null;},setItem(){}};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const E=await import('../js/engine.js');await E.loadEngine();const G=await import('../js/game.js');const C=await import('../js/coop-rules.js');
const tactics=JSON.parse(readFileSync(new URL('../data/tactics.json',import.meta.url))).tactics;
const entries=Array.from({length:100},(_,i)=>({name:'天梯'+i+'@敌队'+(i%3),rank:100-i,score:100+i*5}));
const ctx={entries,tactics};
async function fixture(count=3,lane='1A'){
 const room=C.createCoopRoom({id:'ABC234',host:'u0',team:'队0',seed:195,lane,nodeCount:20});
 for(let i=1;i<count;i++)C.joinCoop(room,{key:'u'+i,team:'队'+i});
 for(const m of room.members)await C.reduceCoop(room,m.key,{type:'ready',ready:true},ctx);
 await C.reduceCoop(room,'u0',{type:'start'},ctx);return room;
}
function forceNode(room,kind){
 for(const m of room.members){const g=m.state.run.graph,from=g.byId.get(m.state.run.nodeId);const id='scenario-'+kind;const node={id,kind,next:[],payload:kind==='filler'?G.makeFiller(m.state.run.teamSize,G.mulberry32(71)):kind==='ladder'||kind==='end'?G.opponentFromEntry({...entries[0],name:m.state.run.teamSize===2?entries[0].name+'+第二名字@敌队':entries[0].name},m.state.run.teamSize):kind==='cpu'?G.makeCpu(G.mulberry32(8)):null};g.nodes.push(node);g.byId.set(id,node);from.next=[id];}return 'scenario-'+kind;
}
async function voteAll(room,id){for(const m of C.activeMembers(room))await C.reduceCoop(room,m.key,{type:'vote',node:id},ctx);}
for(const count of [2,3,4])for(const lane of ['1A','1B','2A','2B']){
 const room=await fixture(count,lane),id=forceNode(room,'filler');
 await C.reduceCoop(room,'u0',{type:'vote',node:id},ctx);assert.equal(room.phase,'map');
 for(const m of room.members.slice(1))await C.reduceCoop(room,m.key,{type:'vote',node:id},ctx);
 assert.equal(room.phase,'prep');assert.equal(room.population,count);assert.equal(room.opponent.cards.length,count*Number(lane[0]));
 assert.equal(new Set(room.opponent.cards.map(c=>c.name)).size,room.opponent.cards.length);
}
const voting=await fixture();const from=voting.members[0].state.run.graph.byId.get(voting.members[0].state.run.nodeId);const left=forceNode(voting,'filler');const right=forceNode(voting,'shop');for(const m of voting.members)m.state.run.graph.byId.get(m.state.run.nodeId).next=[left,right];
await C.reduceCoop(voting,'u0',{type:'vote',node:left},ctx);await C.reduceCoop(voting,'u1',{type:'vote',node:left},ctx);await C.reduceCoop(voting,'u2',{type:'vote',node:right},ctx);assert.equal(voting.phase,'map');await C.reduceCoop(voting,'u2',{type:'vote',node:left},ctx);assert.equal(voting.phase,'prep');
const ladder=await fixture(3,'2A');await voteAll(ladder,forceNode(ladder,'ladder'));assert.equal(ladder.opponent.cards.length,6);assert.deepEqual(ladder.opponent.cards[0].stats,ladder.opponent.cards[2].stats);assert.equal(ladder.opponent.cards[0].name,ladder.opponent.cards[2].name);
for(const m of ladder.members)await C.reduceCoop(ladder,m.key,{type:'battle-ready',ready:true},ctx);
const combat=new C.CoopCombat(),view=combat.snapshot(ladder,'u0');assert.equal(view.states.filter(s=>s.input_team_index===0&&s.owner_id==null).length,6);assert.equal(view.states.filter(s=>s.input_team_index===1&&s.owner_id==null).length,6);
const enemies=view.states.filter(s=>s.input_team_index===1);assert.equal(enemies[0].id_name,enemies[2].id_name);assert.equal(enemies[0].attack,enemies[2].attack);assert.equal(enemies[0].max_hp,enemies[2].max_hp);
const owner=combat.snapshot(ladder,view.owner);assert.ok(owner.your_turn);assert.ok(owner.hand.length);assert.throws(()=>combat.play(ladder,'intruder',{turn:0,card:'normal'}));combat.play(ladder,view.owner,{turn:0,card:'normal'});assert.throws(()=>combat.play(ladder,view.owner,{turn:0,card:'normal'}));
const rosterBefore=ladder.members.map(m=>[...m.state.run.teamIds]);const oracle=structuredClone(ladder.members[0].state);const expected=G.addScore(oracle,entries[0].score)*3;
C.settleCoopBattle(ladder,{won:true,rounds:9,fallen:[{key:'u0',cardId:rosterBefore[0][0]}]});assert.equal(ladder.score,expected);assert.deepEqual(ladder.members.map(m=>m.state.run.teamIds),rosterBefore);assert.ok(ladder.members.every(m=>m.state.run.downed.length===0));combat.release(ladder.id+':'+ladder.node+':1');
// 每人商店不同，完成一人不推进，重复完成/重复购买不能多次扣款。
const shops=await fixture();await voteAll(shops,forceNode(shops,'shop'));const projections=shops.members.map(m=>C.coopView(shops,m.key));assert.notEqual(projections[0].stock[0].id,projections[1].stock[0].id);shops.score=999999;for(const m of shops.members)m.state.run.score=shops.score;const item=projections[0].stock[0];await C.reduceCoop(shops,'u0',{type:'personal',action:{type:'buy',id:item.id}},ctx);const paid=shops.score;await assert.rejects(C.reduceCoop(shops,'u0',{type:'personal',action:{type:'buy',id:item.id}},ctx));assert.equal(shops.score,paid);await C.reduceCoop(shops,'u0',{type:'done'},ctx);assert.equal(shops.phase,'node');await C.reduceCoop(shops,'u1',{type:'done'},ctx);await C.reduceCoop(shops,'u2',{type:'done'},ctx);assert.equal(shops.phase,'map');
// 全队战败时才淘汰出战卡；有库存者换人，无库存者旁观并退出投票人数。
const defeat=await fixture();const spare=E.makeCard('替补','队0');G.grantCard(defeat.members[0].state,spare);await voteAll(defeat,forceNode(defeat,'filler'));for(const m of defeat.members)await C.reduceCoop(defeat,m.key,{type:'battle-ready',ready:true},ctx);C.settleCoopBattle(defeat,{won:false});assert.equal(defeat.phase,'replacement');assert.equal(C.activeMembers(defeat).length,1);assert.equal(defeat.population,3);await C.reduceCoop(defeat,'u0',{type:'team',ids:[spare.id]},ctx);await C.reduceCoop(defeat,'u0',{type:'battle-ready',ready:true},ctx);assert.equal(defeat.phase,'battle');assert.equal(defeat.opponent.cards.length,3);C.settleCoopBattle(defeat,{won:true,rounds:1});await C.reduceCoop(defeat,'u0',{type:'reward',index:0},ctx);assert.equal(defeat.phase,'map');assert.equal(defeat.population,3);
// JSON 往返不丢图结构，个人投影不泄漏其他成员的物品。
const restored=C.restoreCoop(JSON.parse(JSON.stringify(defeat)));assert.ok(restored.members[0].state.run.graph.byId instanceof Map);const privateView=C.coopView(restored,'u0');assert.ok(!('state' in privateView.members[1]));
assert.throws(()=>C.createCoopRoom({lane:'3A'}));const full=await fixture(4);assert.throws(()=>C.joinCoop(full,{key:'u4',team:'队4'}));
console.log(JSON.stringify({sizes:[2,3,4],lanes:C.COOP_LANES,trialMultiplier:'passed',ladderDuplicates:'identical names/icons/stats; unique runtime IDs',unanimousSwitching:'passed',sharedScore:'3x',victoryKeepsKnockedOut:true,replacementsAndSpectators:'passed',personalShops:'different; synchronized completion',jsonRecovery:'passed'}));


// 每个试炼名字独立携武器：固定人数下必须包含 0、部分及全员携带的真实混合样本。
const mixed=await fixture(3,'1B'),mixedId=forceNode(mixed,'filler');for(const m of mixed.members)m.state.run.selectedId=mixedId;const armedCounts=new Set();
for(let seed=1;seed<=160;seed++){mixed.seed=seed;const enemy=C.coopOpponent(mixed);armedCounts.add(enemy.cards.filter(c=>c.weapon).length);}
assert.deepEqual([...armedCounts].sort(),[0,1,2,3]);
// 共享装备保留唯一物品和占用者，其他玩家不能重复装备；卸下后立即可用。
const items=await fixture(3,'2A');items.inventory.weapons.push({id:'shared-weapon',name:'合作之剑'});items.inventory.skillCards.push({uid:'shared-forge',kind:'attribute',name:'共享属性',attrs:{atk:5}});
const char0=items.members[0].state.collection[0],char1=items.members[1].state.collection[0];
await C.reduceCoop(items,'u0',{type:'personal',action:{type:'equip',id:'shared-weapon',character:char0.id}},ctx);
let sharedView=C.coopView(items,'u1');assert.equal(sharedView.inventory.weapons.length,1);assert.equal(sharedView.inventory.claims['weapon:shared-weapon'].characterName,char0.name);assert.equal(sharedView.inventory.claims['weapon:shared-weapon'].team,'队0');
await assert.rejects(C.reduceCoop(items,'u1',{type:'personal',action:{type:'equip',id:'shared-weapon',character:char1.id}},ctx));
await C.reduceCoop(items,'u0',{type:'personal',action:{type:'unequip',character:char0.id}},ctx);await C.reduceCoop(items,'u1',{type:'personal',action:{type:'equip',id:'shared-weapon',character:char1.id}},ctx);assert.equal(items.inventory.claims['weapon:shared-weapon'].key,'u1');
await C.reduceCoop(items,'u0',{type:'personal',action:{type:'forge',id:'shared-forge',character:char0.id}},ctx);assert.ok(items.inventory.claims['skill:shared-forge'].consumed);assert.equal(items.members[1].state.run.skillCards.length,0);await assert.rejects(C.reduceCoop(items,'u1',{type:'personal',action:{type:'forge',id:'shared-forge',character:char1.id}},ctx));
const potionId=items.inventory.potions[0].id;await C.reduceCoop(items,'u0',{type:'reserve-potion',id:potionId,reserve:true},ctx);await assert.rejects(C.reduceCoop(items,'u1',{type:'reserve-potion',id:potionId,reserve:true},ctx));await C.reduceCoop(items,'u0',{type:'reserve-potion',id:potionId,reserve:false},ctx);await C.reduceCoop(items,'u1',{type:'reserve-potion',id:potionId,reserve:true},ctx);
// 强制两人的独立商店抽到同件遗物，服务端统一换成不同报价；购买后全队持有一份。
const relicShops=await fixture();await voteAll(relicShops,forceNode(relicShops,'shop'));relicShops.score=100000;for(const [i,m] of relicShops.members.entries()){m.state.run.score=relicShops.score;G.currentNode(m.state).shopItems=[{id:'same-relic-'+i,kind:'relic',relic:'cpu-fan',rarity:'blue',price:100}];}
const offers=relicShops.members.map(m=>C.coopView(relicShops,m.key).stock).flat();assert.equal(new Set(offers.map(o=>o.relic)).size,3);
const chosen=offers[0];await C.reduceCoop(relicShops,'u0',{type:'personal',action:{type:'buy',id:chosen.id}},ctx);assert.equal(relicShops.inventory.relics.filter(id=>id===chosen.relic).length,1);assert.ok(relicShops.members.every(m=>m.state.relics.includes(chosen.relic)));
assert.ok(C.coopView(relicShops,'u1').stock.every(o=>o.sold||o.relic!==chosen.relic));
const restoredItems=C.restoreCoop(JSON.parse(JSON.stringify(items)));assert.equal(C.coopView(restoredItems,'u2').inventory.claims['weapon:shared-weapon'].key,'u1');
console.log(JSON.stringify({trialWeaponCounts:[...armedCounts].sort(),sharedInventory:'one authoritative bag',weaponClaims:'exclusive with owner/character; release reusable',consumables:'atomic; visible consumed claims',relicShops:'global deduplication; shared acquisition',claimRecovery:'passed'}));


// 永久旁观不投票、不领取功能奖励，但现有角色继续以原生引擎行动；全败顺序自动换人。
const automatic=await fixture(3,'1B');const autoSpare=E.makeCard('托管替补','队1');G.grantCard(automatic.members[1].state,autoSpare);
await C.reduceCoop(automatic,'u1',{type:'spectate'},ctx);assert.ok(automatic.members[1].auto);await assert.rejects(C.reduceCoop(automatic,'u1',{type:'vote',node:'invalid'},ctx));
await voteAll(automatic,forceNode(automatic,'filler'));for(const m of C.activeMembers(automatic))await C.reduceCoop(automatic,m.key,{type:'battle-ready',ready:true},ctx);
assert.equal(automatic.battle.roster.length,3);const autoEngine=new C.CoopCombat();const autoView=autoEngine.snapshot(automatic,'u0');assert.notEqual(autoView.owner,'u1');
const autoId=automatic.battle.id;autoEngine.release(autoId);C.settleCoopBattle(automatic,{won:false});assert.deepEqual(automatic.members[1].state.run.teamIds,[autoSpare.id]);assert.ok(automatic.members[1].spectator);assert.ok(automatic.members[1].ready);assert.equal(automatic.population,3);
// 正在暂停的角色退出操作后直接恢复引擎选招，重建动作历史仍能得到完全一致的状态。
const mid=await fixture(2,'1B');await voteAll(mid,forceNode(mid,'filler'));for(const m of mid.members)await C.reduceCoop(mid,m.key,{type:'battle-ready',ready:true},ctx);const live=new C.CoopCombat(),beforeAuto=live.snapshot(mid,'u0');await C.reduceCoop(mid,beforeAuto.owner,{type:'spectate'},ctx);const afterAuto=live.snapshot(mid,'u0');assert.notEqual(afterAuto.owner,beforeAuto.owner);const replayAuto=new C.CoopCombat();assert.deepEqual(replayAuto.snapshot(JSON.parse(JSON.stringify(mid)),'u0').states,afterAuto.states);live.release(mid.battle.id);replayAuto.release(mid.battle.id);
// 自定义时限由服务端时钟控制，重复获取不会续期，刚到期只代打一手。
const timed=await fixture(2,'1B');timed.turnSeconds=45;await voteAll(timed,forceNode(timed,'filler'));for(const m of timed.members)await C.reduceCoop(timed,m.key,{type:'battle-ready',ready:true},ctx);const timerEngine=new C.CoopCombat();const firstClock=C.timeCoopBattle(timed,timerEngine,1000,'u0');assert.equal(firstClock.deadline,1045);assert.equal(C.timeCoopBattle(timed,timerEngine,1044,'u0').turn,0);assert.equal(C.timeCoopBattle(timed,timerEngine,1044,'u0').deadline,1045);const expired=C.timeCoopBattle(timed,timerEngine,1045,'u0');assert.equal(expired.turn,1);assert.equal(expired.deadline,1090);timerEngine.release(timed.battle.id);
console.log(JSON.stringify({permanentSpectator:'native AI; no vote; automatic stock replacement',midBattleDelegation:'replay identical',customTimeout:45,refreshDoesNotReset:true,timeoutAutoPlay:'server authoritative'}));


// A20 最终关同时复制 #1/#2 各人口倍，真实分组导出收益必须保留，不能冻结为独立卡。
for(const lane of ['1A','2A']){
 const final=await fixture(3,lane);
 for(const m of final.members){const run=m.state.run;run.difficulty=20;run.layer=10;run.entries=Array.from({length:100},(_,i)=>G.opponentFromEntry({rank:100-i,score:100+i,name:'配队'+i+'@共同队伍'+(lane[0]==='2'?'+搭档'+i+'@共同队伍':'')},run.teamSize));G.buildGraphForLayer(m.state);run.selectedId=run.graph.endId;}
 const node=G.currentNode(final.members[0].state),base=structuredClone(node.payload.cards),opponent=C.coopOpponent(final);
 assert.equal(base.length,2*Number(lane[0]));assert.equal(opponent.cards.length,3*base.length);assert.ok(opponent.cards.every(c=>c.groupBoosted));
 for(const c of base)assert.equal(opponent.cards.filter(e=>e.id===c.id).length,3);
 assert.ok(opponent.cards.some((c,i)=>JSON.stringify(c.stats)!==JSON.stringify(base[i%base.length].stats)||JSON.stringify(c.skillList)!==JSON.stringify(base[i%base.length].skillList)));
}
console.log(JSON.stringify({A20Final:'rank #1 and #2 each copied 3 times; native team upgrade preserved',counts:{'1A':6,'2A':12}}));
// 可选本地界面验收夹具，内容来自同一真实规则执行结果，不发布到站点。
if(process.env.COOP_UI_FIXTURES){
 const mapRoom=await fixture(),target=mapRoom.members[0].state.run.graph.byId.get(mapRoom.members[0].state.run.nodeId).next[0];await C.reduceCoop(mapRoom,'u0',{type:'vote',node:target},ctx);
 const battleRoom=await fixture(4,'2A');await voteAll(battleRoom,forceNode(battleRoom,'ladder'));for(const m of battleRoom.members)await C.reduceCoop(battleRoom,m.key,{type:'battle-ready',ready:true},ctx);
 const engine=new C.CoopCombat(),b=engine.snapshot(battleRoom,'u0');
 const shopRoom=await fixture();await voteAll(shopRoom,forceNode(shopRoom,'shop'));
 writeFileSync(process.env.COOP_UI_FIXTURES,JSON.stringify({inventory:C.coopView(items,'u0'),map:C.coopView(mapRoom,'u0'),battle:C.coopView(battleRoom,b.owner,engine.snapshot(battleRoom,b.owner)),shop:C.coopView(shopRoom,'u0')}));engine.release(battleRoom.battle.id);
}
