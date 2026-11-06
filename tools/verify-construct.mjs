// 验证真实角色构建、扣款原子性、随机属性分配和跨存档/换装的永久增益。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const store=new Map();globalThis.localStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const E=await import('../js/engine.js');await E.loadEngine();const G=await import('../js/game.js');
const fixture=seed=>{const s=G.createState(),a=E.makeCard('构造检验','青'),b=E.makeCard('旁观角色','青');s.collection=[a,b];const n={id:'construct-1',kind:'constructMerchant',next:[]};s.run={seed,status:'active',index:0,layer:1,score:100000,clan:'青',teamIds:[a.id],forged:[],nodeId:n.id,graph:{nodes:[n],byId:new Map([[n.id,n]])}};G.refreshRunBuff(s);return s};
const s=fixture(31),a=s.collection[0];
for(const value of ['',0,-1,249,'1.5','1e3','Infinity','0x1000',100001,Number.MAX_SAFE_INTEGER]){const before=JSON.stringify(G.snapshot(s));assert.equal(G.constructCharacter(s,a.id,value).ok,false);assert.equal(JSON.stringify(G.snapshot(s)),before)}
assert.equal(G.constructCharacter(s,s.collection[1].id,1000).ok,true);
const keys=new Set(),counts=new Set();
for(let seed=0;seed<200;seed++){const t=fixture(seed),c=t.collection[0],before={...c.stats},q=G.constructQuote(c,5000);const r=G.constructCharacter(t,c.id,5000);assert.ok(r.ok);assert.equal(t.run.score,95000);assert.equal(r.gains.reduce((n,g)=>n+g.units,0),q.units);counts.add(r.gains.length);for(const g of r.gains){keys.add(g.key);assert.equal(g.amount,g.units*(g.key==='hp'?3:1));assert.equal(c.stats[g.key]-before[g.key],g.amount)}const stats={...c.stats};G.refreshRunBuff(t);assert.deepEqual(c.stats,stats);const snap=G.snapshot(t);assert.equal(snap.collection[0].constructSpent,5000);const restored=G.createState();assert.ok(G.restoreSnapshot(restored,snap));assert.deepEqual(restored.collection[0].stats,stats);assert.equal(restored.collection[0].constructSpent,5000)}
assert.equal(keys.size,8);assert.equal(counts.size,8);
const total=G.constructQuote(a,5000).units;let split=0;for(let i=0;i<5;i++){split+=G.constructQuote(a,1000).units;assert.ok(G.constructCharacter(s,a.id,1000).ok)}assert.equal(split,total);assert.equal(a.constructSpent,5000);
const before={...a.stats};s.weapons=[{id:'test-weapon',name:'构造试验刃'}];assert.ok(G.equipWeapon(s,'test-weapon',a.id));assert.equal(a.weapon,'构造试验刃');assert.ok(G.unequipWeapon(s,a.id));assert.deepEqual(a.stats,before);
G.persist(s);const loaded=G.createState();G.loadSave(loaded);assert.equal(loaded.collection[0].constructSpent,5000);assert.deepEqual(loaded.collection[0].stats,a.stats);
console.log(JSON.stringify({seeds:200,attributes:[...keys],counts:[...counts].sort(),splitBudget:split,saveAndEquipment:'passed',invalidPayment:'atomic'}));

// 新节点仍需满足地图连通性、容量与几何约束。
const M=await import('../js/map.js');let merchants=0;
for(let seed=0;seed<100;seed++){const graph=M.buildLayerGraph({entries:Array.from({length:100},(_,i)=>({rank:i+1,cards:[a]})),layer:1,teamSize:1,rng:G.mulberry32(seed),makeFiller:()=>[a],makeElite:()=>[a],makeCpu:()=>({speed:2})});const check=M.validateGraph(graph);for(const [key,value] of Object.entries(check))if(typeof value==='boolean')assert.ok(value,key);merchants+=graph.nodes.filter(n=>n.kind==='constructMerchant').length;}assert.ok(merchants>15&&merchants<50);console.log(JSON.stringify({maps:100,constructMerchants:merchants}));
