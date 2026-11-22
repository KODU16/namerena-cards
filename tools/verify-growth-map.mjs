// 实际生成地图，验证增加成长内容后仍满足节点预算、可达性、总度数与几何约束。
import assert from 'node:assert/strict';
import{buildLayerGraph,validateGraph}from'../js/map.js';
// 统计各类节点的真实横坐标，避免“连通但特殊节点持续右偏”。
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const entries=Array.from({length:100},(_,i)=>({rank:i+1,name:'测试'+i,score:100,cards:[{name:'测试'+i}]}));
const make=(nodeCount,seed,layer=1)=>buildLayerGraph({entries,layer,teamSize:1,nodeCount,rng:rng(seed),makeFiller:()=>[{name:'试炼'}],makeElite:()=>({cards:[{name:'精英'}]}),makeCpu:()=>({speed:4000}),eliteCount:3});
let generated=0;for(const size of [20,30,40,50,60,70,80])for(let seed=1;seed<=100;seed++){const g=make(size,seed),v=validateGraph(g);assert.equal(g.nodes.length,size);for(const [key,value]of Object.entries(v))if(typeof value==='boolean')assert.ok(value,key+' '+size+' '+seed);assert.equal(g.nodes.filter(n=>n.progressionRank!=null).length,10);generated++;}
const g=make(40,18),counts=Object.fromEntries(['camp','cpu','shop','chest','event','elite','filler'].map(k=>[k,g.nodes.filter(n=>n.kind===k).length]));assert.equal(counts.camp,4);assert.equal(counts.cpu,2);assert.equal(counts.shop,3);assert.equal(counts.chest,2);assert.equal(counts.event,3);assert.equal(counts.elite,3);console.log(JSON.stringify({maps:generated,nodeCounts:'20..80 preserved',geometryAndConnectivity:'passed',A20FortyNodeCounts:counts}));
const positions=new Map();
for(let seed=1;seed<=500;seed++)for(const node of make(40,seed).nodes){
 if(!['camp','shop','cpu','chest','event','elite','weaponMerchant','curseMerchant','constructMerchant'].includes(node.kind))continue;
 if(!positions.has(node.kind))positions.set(node.kind,[]);
 positions.get(node.kind).push(node.px);
}
const means=Object.fromEntries([...positions].map(([kind,x])=>[kind,x.reduce((a,b)=>a+b,0)/x.length]));
for(const[k,mean]of Object.entries(means))assert.ok(mean>.43&&mean<.57,k+' mean '+mean);
console.log(JSON.stringify({horizontalMeans:means,distribution:'all special kinds centered across 500 seeds'}));
