// 通过真实存档、奖励和 WASM 战斗验证能力独立于熟练度。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const saves=new Map();
globalThis.localStorage={setItem:(k,v)=>saves.set(k,v),getItem:k=>saves.get(k)};
globalThis.window={};globalThis.document={getElementById(){},addEventListener(){}};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const A=await import('../js/abilities.js'),E=await import('../js/engine.js');await E.loadEngine();
const G=await import('../js/game.js'),{Duel}=await import('../js/duel.js');
assert.equal(A.ABILITIES.length,37);assert.ok(A.ABILITIES.every(a=>a.rarity==='blue'));
const fire=A.ABILITIES.find(a=>a.effect.skill==='sklfire'),cost={...fire,effect:{skill:'sklfire',kind:'mp',metric:'mp'},value:2};
const state=G.createState();state.run={seed:31,index:0,layer:1,clan:'red',score:100000,skillCards:[],forged:[]};
state.collection=[E.makeCard('ability-test','red')];state.tacticsPool=JSON.parse(readFileSync('data/tactics.json')).tactics;
const rawSkills=JSON.stringify(state.collection[0].skillList);
for(const a of [fire,{...fire,value:1.06},{...fire,value:1.10},cost])G.applyReward(state,{kind:'ability',ability:a});
assert.equal(state.abilities.length,2);assert.equal(state.abilities.find(a=>a.effect.kind==='power').value,1.10);
assert.equal(A.normalizeAbilities([fire,{...fire,effect:{metric:fire.effect.metric,kind:'power',skill:'sklfire'},value:1.10}]).length,1);
assert.equal(A.abilityMpCost(state.abilities,'sklfire',8),6);assert.equal(JSON.stringify(state.collection[0].skillList),rawSkills);
const restored=G.createState();G.restoreSnapshot(restored,G.snapshot(state));assert.deepEqual(restored.abilities,state.abilities);
const loaded=G.createState();G.loadSave(loaded);assert.deepEqual(loaded.abilities,state.abilities);
assert.ok(G.destroyItem(restored,'ability',A.abilityKey(cost)));assert.equal(restored.abilities.length,1);
let supplies=0;
for(let seed=0;seed<100;seed++){
 const normal=G.rollRewards(state,seed),elite=G.rollRewards(state,seed,true,true),supply=G.rollRewards(state,seed,false,false,true);
 assert.ok([...normal,...elite].every(o=>o.kind!=='ability'));
 supplies+=supply.filter(o=>o.kind==='ability').length;
 const shop=G.rollShop(state,seed,1),ability=shop.find(o=>o.kind==='ability');
 assert.ok(ability);assert.equal(ability.rarity,'blue');
 assert.ok(ability.price>shop.find(o=>o.kind==='tactic').price);
}
assert.ok(supplies>0);
// 同一随机种子、同一出牌：倍率改变实际伤害，减耗改变 MP，技能表保持原样。
const wasm=E.engineWasm();
function fight(abilities,skill='sklfire',level=106){
 const player=E.makeCard('ability-test','red'),enemy=E.makeCard('ability-target','blue');
 player.stats={hp:20000,atk:90,def:40,spd:200,agi:40,mag:90,res:40,wis:100};player.skillList=[{id:skill,lv:level}];
 enemy.stats={hp:20000,atk:10,def:40,spd:20,agi:0,mag:10,res:40,wis:20};enemy.skillList=[];
 const input=E.buildLine(player)+'\n\n'+E.buildLine(enemy)+'\nseed:ability-42@!';
 const probe=new wasm.BattleSession(input,{}),team=probe.initial_states().find(s=>s.input_team_index===0).team_index;probe.free();
 const duel=new Duel({wasm,iconFor:E.iconFor},{input,playerTeam:team,champion:player,team:[player],abilities});
 let d=duel.nextDecision();const before=d.unit,skills=structuredClone(before.skills);
 duel.queue(before.id,0,8);d=duel.nextDecision();
 const states=d.replay.final_states,me=states.find(s=>s.id===before.id),target=states.find(s=>s.input_team_index===1);
 assert.deepEqual(me.skills,skills);assert.deepEqual(player.skillList,[{id:skill,lv:level}]);
 const damage=20000-target.hp,mp=me.magic_point;
 duel.dispose();return {damage,mp};
}
const base=fight([]),boost=fight([fire]),cheap=fight([cost]),over=fight([fire],'sklfire',204);
assert.ok(boost.damage>base.damage,JSON.stringify({base,boost}));assert.equal(cheap.mp,base.mp+2);
assert.equal(cheap.damage,base.damage);assert.deepEqual(over,boost);
console.log(JSON.stringify({skills:37,supplies,default:base,boost,costReduction:cheap,proficiency:'unchanged; effective 106'}));
