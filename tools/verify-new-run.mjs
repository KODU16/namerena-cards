// 真实新开局、装备重构和快照恢复验证，避免能力卡/武器跨局残留。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const store=new Map();globalThis.localStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)};
globalThis.window={};globalThis.document={getElementById(){},addEventListener(){}};
globalThis.fetch=async url=>{if(String(url).startsWith('http'))throw Error('offline fixture');return new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});};
const E=await import('../js/engine.js');await E.loadEngine();const G=await import('../js/game.js');const {ABILITIES}=await import('../js/abilities.js');
for(const status of ['won','lost','active']){
 const s=G.createState();s.tacticsPool=JSON.parse(readFileSync('data/tactics.json')).tactics;s.run={seed:42,status,index:10,clan:'青',score:1000,forged:[]};
 const card=E.makeCard('new-run-test','青');s.collection=[card];s.customCards=[card];s.weapons=[{id:'old-weapon',name:'old-weapon'},{id:'unused',name:'unused'}];G.equipWeapon(s,'old-weapon',card.id);s.abilities=[ABILITIES[0]];s.relics=['cpu-fan'];s.tacticPower={old:99};const old=G.snapshot(s);
 await G.startRun(s,{seed:54,lane:'1A',starters:[card],ladder:{lanes:{'1A':{queue:[{rank:1,score:9000,name:'target@青'}]}}}});
 assert.deepEqual(s.weapons,[]);assert.deepEqual(s.abilities,[]);assert.deepEqual(s.relics,[]);assert.deepEqual(s.tacticPower,{});assert.ok(s.collection.every(c=>!c.weapon&&!c.weaponItem));assert.ok(s.customCards.every(c=>!c.weapon&&!c.weaponItem));
 const reloaded=G.createState();G.loadSave(reloaded);assert.deepEqual(reloaded.weapons,[]);assert.deepEqual(reloaded.abilities,[]);
 const previous=G.createState();assert.ok(G.restoreSnapshot(previous,old));assert.equal(previous.weapons.length,1);assert.equal(previous.abilities.length,1);assert.ok(previous.collection[0].weapon);
}
console.log(JSON.stringify({newRunStatuses:3,abilitiesCleared:true,weaponsCleared:true,equipmentCleared:true,previousSnapshotPreserved:true}));
