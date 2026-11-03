// 通过真实构建、交易和存读档验证稀有技能、层末倍率与皇冠履历。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const saved=new Map();globalThis.localStorage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)||null};
globalThis.document={getElementById(){},addEventListener(){}};globalThis.window={};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const E=await import('../js/engine.js');await E.loadEngine();
const G=await import('../js/game.js'),H=await import('../js/run-honor.js'),R=await import('../js/rare-skills.js');
const {drawHand,Duel}=await import('../js/duel.js');
const pool=JSON.parse(readFileSync('data/tactics.json')).tactics;
function makeState(card,seed=1){const s=G.createState();s.collection=[card];s.tacticsPool=pool;
 const node={id:'curse',kind:'curseMerchant',next:[]};s.run={seed,index:10,layer:1,status:'active',clan:card.clan,score:99999,teamIds:[card.id],skillCards:[],forged:[],nodeId:node.id,entries:[],graph:{nodes:[node],byId:new Map([[node.id,node]])}};return s;}
let shadowOffers=0,purifyOffers=0;
const basic=makeState(E.makeCard('稀有检查','青'));
for(let seed=0;seed<1000;seed++){
 for(const offer of G.rollShop(basic,seed,1)){
  if(offer.kind==='tactic')assert.ok(R.isTacticEnabled(offer.tactic));
  if(offer.kind!=='skill')continue;
  if(R.isRareSkill(offer.skill.id)){
   const rule=R.RARE_SKILLS[offer.skill.id];assert.equal(offer.rarity,'gold');assert.ok(offer.skill[rule.tag]);
   assert.ok(offer.skill.lv>=1&&offer.skill.lv<=rule.offerMax);assert.equal(offer.price,rule.price);
   if(offer.skill.id==='sklshadow')shadowOffers++;else purifyOffers++;
  }
 }
 for(const allowAbility of [false,true])for(const offer of G.rollRewards(basic,seed,true,true,allowAbility)){
  assert.ok(offer.kind!=='skill'||!R.isRareSkill(offer.skill.id));
  assert.ok(offer.kind!=='tactic'||R.isTacticEnabled(offer.tactic));
 }
}
assert.ok(shadowOffers>0&&purifyOffers>0);assert.ok(R.RARE_SKILLS.sklshadow.price<R.RARE_SKILLS.skldisperse.price);
// 开局替换不改熟练度、不与已有技能重叠，换装和存档后也保留同一替换结果。
const starterOriginal=E.makeCard('Dsuv2quzuq5m7cw','Splay');
const starter=G.replaceStarterRareSkills(starterOriginal),replacements=structuredClone(starter.starterReplacements);
assert.ok(replacements.length);assert.ok(!starter.skillList.some(k=>R.isRareSkill(k.id)));
for(const replacement of replacements){assert.equal(starter.skillList.find(k=>k.id===replacement.to).lv,replacement.lv);assert.equal(starterOriginal.skillList.find(k=>k.id===replacement.from).lv,replacement.lv);}
assert.deepEqual(G.replaceStarterRareSkills(starterOriginal).starterReplacements,replacements);
const starterState=makeState(starter);G.refreshRunBuff(starterState);G.refreshRunBuff(starterState);
assert.equal(starter.skillList.find(k=>k.id===replacements[0].to).lv,replacements[0].lv);
starterState.weapons=[{id:'starter-weapon',name:'试作月影'}];G.equipWeapon(starterState,'starter-weapon',starter.id);G.unequipWeapon(starterState,starter.id);
assert.equal(starter.skillList.find(k=>k.id===replacements[0].to).lv,replacements[0].lv);
const starterRestored=G.createState();G.restoreSnapshot(starterRestored,G.snapshot(starterState));
assert.deepEqual(starterRestored.collection[0].starterReplacements,replacements);
assert.equal(starterRestored.collection[0].skillList.find(k=>k.id===replacements[0].to).lv,replacements[0].lv);
const p=E.makeCard('Dsuv2quzuq5m7cw','Splay'),s=makeState(p);
assert.ok(p.skillList.find(k=>k.id==='sklshadow').lv>5);
G.refreshRunBuff(s);assert.ok(!p.skillList.some(k=>k.id==='sklshadow'));
assert.equal(drawHand([{id:'sklshadow',lv:92}],()=>0).length,0);
assert.equal(drawHand([{id:'sklshadow',lv:92,fromWeapon:true}],()=>0)[0].lv,5);
assert.equal(drawHand([{id:'sklshadow',lv:92,playerShadow:true}],()=>0)[0].lv,5);
s.ownedTactics=['t-shadow'];assert.equal(G.ownedTacticObjects(s).length,0);
assert.ok(!E.applyTactics(p,[pool.find(t=>t.id==='t-shadow')]).skillList.some(k=>k.id==='sklshadow'));
s.run.skillCards=[{id:'sklshadow',lv:4,uid:'rare-shadow',playerShadow:true}];
const originalRandom=Math.random;Math.random=()=>0;
try {assert.ok(G.forgeSkill(s,'rare-shadow',p.id).ok);}finally{Math.random=originalRandom;}
G.prepareBattleCard(s,p);assert.equal(p.skillList.find(k=>k.id==='sklshadow').lv,4);
assert.ok(G.campForge(s,p.id,'sklshadow'));assert.equal(R.playerSkillLevel(p.skillList.find(k=>k.id==='sklshadow')),5);
assert.equal(G.campForge(s,p.id,'sklshadow'),null);assert.equal(G.forgeChance(s,p.id,{id:'sklshadow',lv:1,playerShadow:true}),0);
s.run.forged.push({charId:p.id,skillId:'sklshadow',lv:200,playerShadow:true});G.prepareBattleCard(s,p);
assert.ok(p.skillList.find(k=>k.id==='sklshadow').lv>106);
assert.equal(JSON.parse(E.buildLine(p).split('+ol:')[1]).skills.sklshadow,5);
const q=E.makeCard('Dsuv2quzuq5m7cw','Splay'),weaponState=makeState(q);
weaponState.weapons=[{id:'w',name:'试作月影'}];G.equipWeapon(weaponState,'w',q.id);
assert.ok(q.skillList.find(k=>k.id==='sklshadow')?.fromWeapon);assert.ok(q.skillList.find(k=>k.id==='sklshadow').lv<=5);
G.unequipWeapon(weaponState,q.id);assert.ok(!q.skillList.some(k=>k.id==='sklshadow'));
// 玩家战斗内为 5，天梯天然幻术保持原始技能强度。
p.stats={...p.stats,hp:20000,spd:200};const enemy=E.makeCard('幻术目标','赤');enemy.stats={...enemy.stats,hp:20000,spd:20};enemy.skillList=[];
const wasm=E.engineWasm(),input=E.buildLine(p)+'\n\n'+E.buildLine(enemy)+'\nseed:rare-shadow@!';
const probe=new wasm.BattleSession(input,{}),team=probe.initial_states().find(k=>k.input_team_index===0).team_index;probe.free();
const duel=new Duel({wasm,iconFor:E.iconFor},{input,playerTeam:team,champion:p,team:[p]});const decision=duel.nextDecision();
assert.equal(decision.unit.skills.find(([name])=>name==='core.skill.shadow')[1],5);duel.queue(decision.unit.id,24,8);duel.nextDecision();duel.dispose();
assert.ok(JSON.parse(E.buildLine(E.makeCard('Dsuv2quzuq5m7cw','Splay')).split('+ol:')[1]).skills.sklshadow>5);
assert.equal(R.shownSkillLevel({id:'sklshadow',lv:88,fromWeapon:true}),88);
assert.equal(R.shownSkillLevel({id:'sklshadow',lv:88,fromWeapon:true,playerRestricted:true}),5);
let enemyWeapons=0;
const enemyRng=G.mulberry32(93);
for(let i=0;i<120;i++)for(const card of G.makeFiller(1,enemyRng))if(card.weapon){
  enemyWeapons++;const raw=E.buildWithWeapon(card.name,card.clan,card.weapon);
  for(const skill of card.skillList)assert.equal(skill.lv,raw.skills.find(k=>k.id===skill.id).lv);
}
assert.ok(enemyWeapons>0);
for(let layer=1;layer<=10;layer++){
 const card=E.makeCard('Boss检查','赤'),base={...card.stats},entry={cards:[card],rank:91};
 const end={id:'end',kind:'end',payload:entry},ordinary={id:'normal',kind:'ladder',payload:entry};
 const run={layer,graph:{endId:'end',nodes:[ordinary,end],byId:new Map([['end',end],['normal',ordinary]])}};
 G.enhanceLayerBoss(run);G.enhanceLayerBoss(run);
 const boss=end.payload.cards[0],mult=1+layer*.05;
 for(const [key,value] of Object.entries(base))assert.equal(boss.stats[key],Math.round(value*mult));
 assert.deepEqual(ordinary.payload.cards[0].stats,base);
 const session=new wasm.BattleSession(E.buildLine(boss)+'\n\nother@x',{});
 assert.deepEqual(E.battleDisplayStats(session.initial_states().find(k=>k.input_team_index===0)),boss.stats);session.free();
}
// 构造裸熟练度不足但锻造很高的角色，不能用锻造凑金卡门槛。
let low,high;
for(let i=0;i<1000&&(!low||!high);i++){
 const card=E.makeCard('代价检查'+i,'青');const levels=card.skillList.filter(k=>k.id!=='sklshadow');
 if(levels.length&&Math.max(...levels.map(k=>k.lv))<70)low||=card;
 if(levels.some(k=>k.lv>=70))high||=card;
}
function constrain(state){for(const card of state.collection){const base=G.curseBaseStats(card);card.curseStats=Object.fromEntries(Object.entries(base).map(([k,v])=>[k,Math.max(0,v-(k==='hp'?140:45))]));}}
let expensive=0;
for(let seed=0;seed<250;seed++){
 const lowState=makeState(structuredClone(low),seed);constrain(lowState);
 const id=lowState.collection[0].skillList.find(k=>k.id!=='sklshadow').id;
 lowState.collection[0].skillTraining={[id]:{gain:200,count:1,mpMul:1}};
 assert.ok(G.curseStock(lowState,lowState.collection[0].id).every(o=>!R.isRareSkill(o.skill?.id)));
 const highState=makeState(structuredClone(high),seed);constrain(highState);
 for(const offer of G.curseStock(highState,high.id).filter(o=>R.isRareSkill(o.skill?.id))){
  expensive++;assert.equal(offer.cost.type,'skill');assert.ok(G.curseNativeLevel(high,offer.cost.skillId)>=70);assert.ok(G.canBuyCurse(highState,offer));
 }
 const rich=makeState(structuredClone(low),seed);rich.collection[0].forge=Object.fromEntries(Object.keys(low.stats).map(k=>[k,k==='hp'?600:100]));
 for(const offer of G.curseStock(rich,low.id).filter(o=>R.isRareSkill(o.skill?.id))){
  assert.equal(offer.cost.type,'stat');assert.ok(offer.cost.units>=50);assert.equal(offer.cost.amount,offer.cost.units*(offer.cost.key==='hp'?3:1));assert.ok(G.canBuyCurse(rich,offer));
 }
}
assert.ok(expensive>0);
const honorState=makeState(E.makeCard('皇冠检查','青'));H.beginHonor(honorState.run);
const checkpoint=structuredClone(G.snapshot(honorState));
assert.ok(G.restoreSnapshot(honorState,checkpoint));assert.ok(H.hasHonor(honorState.run));
honorState.run.selectedId='another-preview';
assert.ok(G.restoreSnapshot(honorState,checkpoint));assert.ok(!H.hasHonor(honorState.run));
assert.ok(G.restoreSnapshot(honorState,checkpoint));assert.ok(!H.hasHonor(honorState.run));
const auto=G.createState();G.loadSave(auto);assert.ok(!H.hasHonor(auto.run));assert.deepEqual(auto.run.honor.loads,honorState.run.honor.loads);
const clean=makeState(E.makeCard('金色检查','青'));H.beginHonor(clean.run);const other=structuredClone(G.snapshot(clean));other.run.nodeId='other';
G.restoreSnapshot(clean,other);assert.ok(H.hasHonor(clean.run));other.run.nodeId='third';G.restoreSnapshot(clean,other);assert.ok(H.hasHonor(clean.run));
clean.run.layer=10;G.advanceLayer(clean);assert.ok(clean.run.goldVictory);assert.ok(clean.records[0].gold);
honorState.run.layer=10;G.advanceLayer(honorState);assert.equal(honorState.run.goldVictory,false);assert.equal(honorState.records[0].gold,false);
console.log(JSON.stringify({shops:1000,shadowOffers,purifyOffers,bossLayers:10,rareCurseOffers:expensive,shadowSourceAndCap:'passed',honorRollbackAndGold:'passed'}));
