// 使用真实 WASM 验证掉落入库、预饮药效、逃跑让行与遭遇存读档。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.window={};
globalThis.document={addEventListener(){},getElementById(){}};
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const E=await import('../js/engine.js');await E.loadEngine();
const G=await import('../js/game.js'),{Duel}=await import('../js/duel.js');
const w=E.engineWasm();
const line=(name,speed=100)=>name+'@test+ol:'+JSON.stringify({attrs:[40,40,speed,40,40,40,100,20000],skills:{},name_factor_enabled:false});
const raw=line('one',200)+'\n'+line('two',190)+'\n\n'+line('enemy',60)+'\nseed:escape-regression@!';
const create=()=>new w.BattleSession(raw,{controlled_team:0,max_rounds:2000});
const advance=session=>{const frames=[];for(let f;(f=session.next_frame())!=null;)frames.push(f);return frames;};
const state=G.createState(),card=E.makeCard('掉落回归','青');
state.collection=[card];state.tacticsPool=JSON.parse(readFileSync(new URL('../data/tactics.json',import.meta.url))).tactics;
state.run={seed:31,index:0,layer:1,status:'active',teamIds:[card.id],teamSize:1,clan:'青',score:0,skillCards:[],potions:[],forged:[]};
for(const elite of [false,true]){
 const seen=new Set();
 for(let seed=0;seed<300;seed++)for(const offer of G.rollRewards(state,seed,elite,true,true,true)){
  const n=G.rewardQuantity(offer);
  if(offer.kind==='card')assert.equal(n,1);
  else {assert.ok(n>=(elite?5:1)&&n<=(elite?10:5));seen.add(n);assert.ok(G.rewardSummary(offer).label.includes('×'+n));}
 }
 assert.equal(seen.size,elite?6:5);
}
G.applyReward(state,{kind:'skill',quantity:10,skill:{id:'sklfire',uid:'stack',lv:12}});
assert.equal(state.run.skillCards.length,10);assert.equal(new Set(state.run.skillCards.map(s=>s.uid)).size,10);
G.applyReward(state,{kind:'weapon',quantity:8,weapon:{id:'stack-weapon',name:'剑'}});
assert.equal(state.weapons.length,8);assert.equal(new Set(state.weapons.map(s=>s.id)).size,8);
G.applyReward(state,{kind:'potion',quantity:7,potion:{id:'hp',n:7}});
assert.equal(state.run.potions[0].n,7);
G.applyReward(state,{kind:'relic',quantity:5,relic:'cpu-fan'});
assert.equal(state.relics.length,5);G.destroyItem(state,'relic','cpu-fan');assert.equal(state.relics.length,4);
const session=create(),initial=session.initial_states(),one=initial.find(s=>s.id_name==='one'),enemy=initial.find(s=>s.id_name==='enemy');
assert.equal(one.id_key_name,'one@test');
session.set_field_resources(new Int32Array([one.id,1000,5]));
session.use_potion(one.id,9);session.use_potion(one.id,10);
let current=session.current_states().find(s=>s.id===one.id);
assert.equal(current.hp,1000+Math.max(10,Math.floor(one.max_hp/4)));assert.equal(current.magic_point,45);
session.use_potion(one.id,1);session.use_potion(one.id,2);
const boostedAttack=one.attack+Math.max(8,Math.trunc(one.attack/4));
assert.equal(session.initial_states().find(s=>s.id===one.id).attack,boostedAttack);
advance(session);assert.equal(session.paused_actor(),one.id);
session.submit_action(one.id,255,0);advance(session);
assert.equal(session.current_states().find(s=>s.id===one.id).attack,boostedAttack);
for(let turn=0;turn<8;turn++){
 const actor=session.paused_actor();assert.ok(actor!=null);
 session.submit_action(actor,255,0);advance(session);
 if(actor===one.id)break;
}
assert.equal(session.current_states().find(s=>s.id===one.id).attack,one.attack);
// 逃跑失败无普攻伤害，随后首个造成行动战报的角色必须为敌方。
const failed=create();advance(failed);
const before=failed.current_states().find(s=>s.id===enemy.id).hp;
failed.submit_action(failed.paused_actor(),256,0);
const frames=advance(failed),failure=frames.findIndex(f=>f.updates.some(u=>u.message_rendered.includes('逃跑失败')));
assert.ok(failure>=0);
assert.equal(frames[failure].states.find(s=>s.id===enemy.id).hp,before);
assert.ok(frames.slice(failure+1).some(f=>f.updates.some(u=>u.caster_id===enemy.id)));
assert.equal(frames.slice(failure+1).flatMap(f=>f.rows||[]).flatMap(r=>r.clips||[]).find(c=>c.caster_ids?.length)?.caster_ids[0],enemy.id);
// 在真实状态存储中构造双方正负状态，检查逃跑只清指定方向且血量不变。
const configured=create(),rows=JSON.parse(configured.encounter_snapshot());
for(const row of rows){
 row[1].hp=4321;row[1].magic_point=70;
 row[2].entries=[
  {legacy_order_key:222,extension_state_id:null,hook_mask:4,priority:0,registration_order:0,payload:{Slow:{step:3}}},
  {legacy_order_key:223,extension_state_id:null,hook_mask:4,priority:0,registration_order:1,payload:{Iron:{protect:35,step:3}}}
 ];row[2].runtime_registration_orders=[0,1];row[2].next_runtime_registration_order=2;
}
configured.restore_encounter(JSON.stringify(rows));advance(configured);
const pre=configured.current_states(),saved=JSON.parse(configured.escape());
for(const row of saved){
 const own=row[0]!=='enemy@test',payloads=row[2].entries.map(s=>Object.keys(s.payload)[0]);
 assert.ok(own?payloads.includes('Slow'):payloads.includes('Iron'));
 assert.ok(own?!payloads.includes('Iron'):!payloads.includes('Slow'));
 const unit=pre.find(s=>s.id_key_name===row[0]);
 assert.equal(row[1].hp,unit.hp);assert.equal(row[1].magic_point,initial.find(s=>s.id_key_name===row[0]).magic_point);
}
state.run.fieldStates={[card.id]:saved.find(row=>row[0]==='one@test')};
const kept=structuredClone(state.run.fieldStates);
state.run.graph={nodes:[{id:'map',kind:'start',next:['shop']},{id:'shop',kind:'shop',next:['camp']},{id:'camp',kind:'camp',next:[]}]};
state.run.graph.byId=new Map(state.run.graph.nodes.map(n=>[n.id,n]));state.run.nodeId='map';state.run.selectedId='shop';state.run.cleared=[];
G.clearNode(state);state.run.selectedId='camp';G.clearNode(state);
assert.deepEqual(state.run.fieldStates,kept);
G.persist(state);const loaded=G.createState();G.loadSave(loaded);assert.deepEqual(loaded.run.fieldStates,kept);
const restored=create();restored.restore_encounter(JSON.stringify(saved));
for(const row of saved)assert.equal(restored.initial_states().find(s=>s.id_key_name===row[0]).hp,row[1].hp);
// 换装备后的新模板必须生效，遭遇读档只继承资源和状态。
const changed=new w.BattleSession(raw.replaceAll('[40,40,','[80,40,'),{controlled_team:0});
const freshAttack=changed.initial_states().find(s=>s.id_key_name==='one@test').attack;
changed.restore_encounter(JSON.stringify(saved));
assert.equal(changed.initial_states().find(s=>s.id_key_name==='one@test').attack,freshAttack);
assert.equal(changed.initial_states().find(s=>s.id_key_name==='one@test').hp,saved.find(r=>r[0]==='one@test')[1].hp);
changed.free();
// 外显智敏按总和相除；人数、阵亡、召唤物和分身都必须按规则处理。
const unit=(wis,agi,extra={})=>({hp:100,alive:true,wisdom:wis-36,agility:agi-36,...extra});
assert.equal(G.escapeChance([unit(25,25)],[unit(50,50)]),.5);
assert.equal(G.escapeChance([unit(50,50)],[unit(50,50)]),1);
assert.equal(G.escapeChance([unit(80,80)],[unit(50,50)]),1);
assert.equal(G.escapeChance([unit(10,10),unit(15,15)],[unit(50,50)]),.5);
assert.equal(G.escapeChance([unit(25,25),unit(255,255,{hp:0,alive:false}),unit(255,255,{owner_id:1,minion_kind:'clone'})],[unit(50,50)]),.5);
assert.equal(G.escapeChance([unit(25,25)],[unit(50,50),unit(255,255,{owner_id:3,minion_kind:'summon'})]),.5);
assert.equal(G.escapeChance([unit(1,1)],[unit(0,0)]),1);
const reserve={id:'reserve'};state.run.fieldStates[reserve.id]=structuredClone(kept[card.id]);
state.run.preBattlePotions={[card.id]:['atk'],[reserve.id]:['def']};
G.consumeFieldResources(state,[reserve]);
assert.deepEqual(state.run.fieldStates[card.id],kept[card.id]);
assert.deepEqual(state.run.preBattlePotions[card.id],['atk']);
assert.equal(state.run.fieldStates[reserve.id],undefined);
assert.ok(G.fieldDebuffs(state,card.id).some(s=>s.name==='迟缓'&&s.turns>0));
assert.deepEqual(G.fieldDebuffs(state,reserve.id),[]);
for(const s of [session,failed,configured,restored])s.free();
console.log(JSON.stringify({drops:'ordinary 1..5; elite 5..10',quantities:'independent IDs and real counts',potions:'immediate HP/MP, opening stats expire after one action cycle',escape:'no attack; enemy acts next; selective cleanse; HP preserved',debuffs:'preserved across two nodes and save/load'}));

