// 实际引擎验证八围口径、试炼奖励、武器命名与出战切换。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.localStorage={setItem(){}};globalThis.document={getElementById(){},addEventListener(){}};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const E=await import('../js/engine.js');await E.loadEngine();const G=await import('../js/game.js'),U=await import('../js/ui.js');
for(const [name,clan,expected] of [['浴缸 #NXTISKVR','test1123',670.3],['涵虚7880','涵虚',682]]){
 const card=E.makeCard(name,clan);assert.equal(G.eightSum(card),expected);assert.equal(U.eightSumOf(card),expected);
 const session=new (E.engineWasm().BattleSession)(E.buildLine(card)+'\n\na@x',{});
 const state=session.initial_states().find(s=>s.input_team_index===0);assert.deepEqual(E.battleDisplayStats(state),E.cardDisplayStats(card.stats));session.free();
}
const scan=G.cpuScan('涵虚',7880,{speed:2},'涵虚');assert.equal(scan.sum,G.eightSum(scan.card));
const state=G.createState();state.collection=[E.makeCard('浴缸 #NXTISKVR','test1123'),E.makeCard('出战候选','test1123'),E.makeCard('异队','赤')];
state.run={seed:31,index:0,layer:1,clan:'test1123',teamSize:1,teamIds:[state.collection[0].id],score:0,skillCards:[],forged:[]};
state.tacticsPool=JSON.parse(readFileSync('data/tactics.json')).tactics;
const slots=new Set(),kinds=new Set();
for(let seed=0;seed<300;seed++)for(const elite of [false,true]){
 const offers=G.rollRewards(state,seed,elite,true);assert.equal(offers.length,3);assert.equal(offers.filter(o=>o.kind==='score').length,1);
 slots.add(offers.findIndex(o=>o.kind==='score'));offers.filter(o=>o.kind!=='score').forEach(o=>kinds.add(o.kind));
}
assert.equal(slots.size,3);assert.ok(kinds.size>=4);
assert.ok(G.toggleTeamMember(state,state.collection[1].id).ok);assert.deepEqual(state.run.teamIds,[state.collection[1].id]);
assert.equal(G.toggleTeamMember(state,state.collection[2].id).ok,false);
state.run.downed=[state.collection[0].id];assert.equal(G.toggleTeamMember(state,state.collection[0].id).ok,false);state.run.downed=[];
state.run.teamSize=2;assert.ok(G.toggleTeamMember(state,state.collection[0].id).ok);const third=E.makeCard('双人替换','test1123');state.collection.push(third);
assert.ok(G.toggleTeamMember(state,third.id,state.collection[1].id).ok);assert.deepEqual(new Set(state.run.teamIds),new Set([third.id,state.collection[0].id]));
const r=G.mulberry32(101),names=Array.from({length:1000},()=>G.randomWeapon(r));assert.ok(new Set(names).size>990);assert.ok(new Set(names.map(n=>n.length)).size>=8);
for(const name of names.slice(0,30))assert.ok(E.buildWithWeapon(third.name,third.clan,name));
console.log(JSON.stringify({eightSum:670.3,scoreOffers:600,scoreSlots:[...slots],randomTypes:[...kinds],uniqueWeapons:new Set(names).size,teamSwitch:'passed'}));

const attrCard=G.rollAttributeForgeCard(G.mulberry32(217),.5,'forge-regression');
assert.ok(Object.keys(attrCard.attrs).length>=1);const attrTarget=state.collection[0];
state.run.skillCards=[attrCard];const forgeBefore={...(attrTarget.forge||{})};
assert.equal(G.forgeChance(state,attrTarget.id,attrCard),1);assert.ok(G.forgeSkill(state,attrCard.uid,attrTarget.id).ok);
for(const [key,value] of Object.entries(attrCard.attrs))assert.equal(attrTarget.forge[key],(forgeBefore[key]||0)+value);
assert.equal(state.run.skillCards.length,0);const forgedStats={...attrTarget.stats};G.refreshRunBuff(state);assert.deepEqual(attrTarget.stats,forgedStats);
console.log(JSON.stringify({attributeForge:'guaranteed and permanent',attributes:attrCard.attrs}));

// 缺员天梯用试炼占据缺失进度位，十层始终覆盖100个位置且终点可战斗。
for(const count of [0,34,40,75,77,87,99,100]){
 const entries=Array.from({length:count},(_,i)=>G.opponentFromEntry({rank:i+1,score:100+i,name:'补齐验证'+i+'@检查'},1));
 const f=G.createState();f.collection=[E.makeCard('进度补齐','青')];f.tacticsPool=[];f.run={seed:517,difficulty:20,layer:1,teamSize:1,nodeCount:40,entries,index:0,score:0};
 let positions=0,trials=0;for(let layer=1;layer<=10;layer++){f.run.layer=layer;G.buildGraphForLayer(f);const g=f.run.graph,end=g.byId.get(g.endId);assert.equal(g.nodes.length,40);assert.ok(end.payload.cards.length);const slots=g.nodes.filter(n=>n.progressionRank!=null);assert.equal(slots.length,10);positions+=slots.length;trials+=slots.filter(n=>n.kind==='filler'||n.payload?.trial).length;for(const n of slots)if(n.kind==='ladder')assert.ok(n.rank<=count);}
 assert.equal(positions,100);assert.equal(trials,100-count);
}
console.log(JSON.stringify({sparseLadderSizes:[0,34,40,75,77,87,99,100],progressionSlots:100,missingSlots:'random trials',bosses:'all have enemies'}));

// 已存在的缺员旧存档只修复空终点，不清空路线、当前位置或角色。
const legacy=G.createState();legacy.collection=[E.makeCard('旧档补齐','青')];legacy.run={seed:9,layer:1,teamSize:1,difficulty:20,index:6,nodeId:'old-current',selectedId:'old-end',cleared:['kept'],graph:{endId:'old-end',nodes:[{id:'old-current',kind:'filler',next:['old-end']},{id:'old-end',kind:'end',next:[],rank:91}]}};legacy.run.graph.byId=new Map(legacy.run.graph.nodes.map(n=>[n.id,n]));G.enhanceLayerBoss(legacy.run);assert.ok(G.currentOpponent(legacy).trial);assert.ok(G.currentOpponent(legacy).cards.length);assert.deepEqual(legacy.run.cleared,['kept']);assert.equal(legacy.run.nodeId,'old-current');
