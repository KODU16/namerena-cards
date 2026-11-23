// 真实浏览器验证子路径加载、账户名字、禁用入口、存档和战斗流程。
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,extname,sep} from 'node:path';
const root=resolve('../exports/cards-toy/site');
const output=resolve('output/toy');await mkdir(output,{recursive:true});
// 仅测试服务器注入 SDK 替身；正式产物不包含假账号或假排行榜。
const mock=`<script>window.__scores=[];window.__profileFail=true;window.toy={getUserProfile:async()=>{if(window.__profileFail){window.__profileFail=false;throw Error('测试读取失败')}return {nickname:'测试玩家_甲'}},submitScore:async p=>{window.__scores.push(p);return {score:p.score}},getRankList:async()=>[{rank:1,score:1234,nickname:'榜首玩家'}],getMyRank:async()=>({rank:1,score:1234})};</script>`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),prefix='/toy/local-check/';
  if(url.pathname.endsWith('/favicon.ico')){res.writeHead(204);res.end();return;}
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const path=resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  let data=await readFile(path);
  if(extname(path)==='.html')data=Buffer.from(data.toString().replace('<head>','<head>'+mock));
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const script='('+async function(){
 try{
  const check=(x,m)=>{if(!x)throw Error(m)},pause=ms=>new Promise(r=>setTimeout(r,ms));
  const button=t=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===t),click=t=>{const b=button(t);check(b,'button '+t);b.click();};
  for(let i=0;i<100&&!window.__namerenaBooted;i++)await pause(50);
  check(!document.querySelector('#fortune-launch,#fortune-dialog'),'no fortune');
  check(!/名字工坊|大逃杀|合作爬塔/.test(document.body.textContent),'no workshop or multiplayer');
  check(!document.querySelector('a[href^="http"]'),'no external links');
  check(document.body.dataset.screen==='home','hash arena blocked');
  click('通关排行榜');await pause(80);check(document.querySelector('#overlay').textContent.includes('榜首玩家'),'rank list');click('关闭');
  click('开始爬塔');await pause(80);check(document.body.textContent.includes('测试读取失败'),'profile error visible');
  check(!button('带着这个名字出发'),'no random fallback');click('重试');await pause(100);
  check(!document.querySelector('input,textarea'),'no names/clan input');
  check(!/重抽|随机填/.test(document.body.textContent),'no rerolls');
  check(document.querySelector('.setup__name-row b').textContent==='测试玩家_甲','SDK name');
  check(document.body.textContent.includes('测试玩家_甲@测试玩家_甲'),'exact calculation name');
  click('2A');await pause(50);check(document.querySelectorAll('.setup__name-row').length===2,'two slots');
  click('带着这个名字出发');await pause(500);check(document.body.dataset.screen==='map','started');
  const q=window.__nc,s=q.state;
  check(s.ladderSource==='snapshot'&&!s.customCards.length,'local ladder/no customs');
  check(s.run.clan==='测试玩家_甲','account team');
  check(s.collection.length===2&&s.collection.every(c=>c.name==='测试玩家_甲'&&c.clan==='测试玩家_甲'),'no random duplicate replacement');
  check(new Set(s.run.teamIds).size===2,'independent card ids');
  const reopen=async target=>{
   const start=s.run.graph.byId.get(s.run.nodeId);start.next=[target.id];q.G.persist(s);
   localStorage.setItem('namerena-cards-toy/saves',JSON.stringify({1:{summary:'fixture',updated_at:new Date().toISOString(),payload:q.G.snapshot(s)}}));
   document.querySelector('.brand').click();[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('存档 ·')).click();await pause(40);
   check(!document.querySelector('#overlay input[type=file]')&&!document.querySelector('#overlay').textContent.includes('导入 txt'),'no save imports');
   click('读取');await pause(60);document.querySelector('.map-node.is-avail[data-id="'+target.id+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause(820);
  };
  const cpu=s.run.graph.nodes.find(n=>n.kind==='cpu');await reopen(cpu);
  check(!document.querySelector('#overlay input,#overlay textarea'),'cpu no free input');
  click('测号（仅一次）');await pause(200);check(s.run.graph.byId.get(cpu.id).cpuScanUsed,'cpu used');click('离开');
  const filler=s.run.graph.nodes.find(n=>n.kind==='filler');await reopen(filler);
  check(document.body.dataset.screen==='prep','prep');click('开战');await pause(150);q.view.skip=true;
  for(let i=0;i<160&&!q.view?.interactive;i++)await pause(25);
  check(q.view?.interactive,'battle action');check(document.querySelector('#battle-escape').textContent.includes('%'),'escape probability');
  const roots=q.duel.session.initial_states().filter(x=>x.input_team_index===0&&x.owner_id==null);
  q.duel.session.set_field_resources(new Int32Array([roots[0].id,10,10,roots[1].id,20,20]));
  q.view.rng=()=>0;document.querySelector('#battle-escape').click();check(document.body.dataset.screen==='map','escape map');
  check(s.run.fieldStates[s.run.teamIds[0]][1].hp===10&&s.run.fieldStates[s.run.teamIds[1]][1].hp===20,'same-name HP remains independent');
  check(window.__scores.length===0,'no score before victory');
  // 用真实游戏结算设置通关存档，再通过实际读档界面触发最终分数提交。
  s.run.layer=10;s.run.score=1234;q.G.advanceLayer(s);
  localStorage.setItem('namerena-cards-toy/saves',JSON.stringify({1:{summary:'victory',updated_at:new Date().toISOString(),payload:q.G.snapshot(s)}}));
  document.querySelector('.brand').click();click('选择存档');await pause(40);click('读取');await pause(100);
  check(document.body.dataset.screen==='end','victory screen');
  check(window.__scores.length===1&&window.__scores[0].score===1234&&window.__scores[0].board===1,'victory final score');
  click('回首页');click('选择存档');await pause(40);click('读取');await pause(100);
  // 原槽位是上传前快照；先保存已确认结果，再验证重绘不会重复上报。
  localStorage.setItem('namerena-cards-toy/saves',JSON.stringify({1:{summary:'victory',updated_at:new Date().toISOString(),payload:q.G.snapshot(s)}}));
  const sent=window.__scores.length;click('回首页');click('选择存档');await pause(40);click('读取');await pause(100);
  check(window.__scores.length===sent,'sent victory not resubmitted');
  const external=performance.getEntriesByType('resource').filter(e=>!e.name.startsWith(location.origin));
  check(!external.length,'no outside request with SDK mock');
  return {ok:true,width:innerWidth,accountName:true,noRerolls:true,cpu:true,battleEscape:true,noMultiplayer:true,noFortune:true,noFreeNames:true,storageIsolated:!!localStorage.getItem('namerena-cards-toy/v1'),overflow:document.documentElement.scrollWidth>innerWidth+1};
 }catch(e){return {error:e.message,stack:e.stack};}
}.toString()+')()';
try{
 for(const width of [1440,320]){
  const outputText=await new Promise((yes,no)=>{
   const child=spawn(process.execPath,['tools/cdp.mjs','http://127.0.0.1:'+server.address().port+'/toy/local-check/index.html#arena',resolve(output,width+'.png'),'800',script],{env:{...process.env,CARDS_VIEWPORT_WIDTH:String(width),CARDS_VIEWPORT_HEIGHT:'1000'},stdio:['ignore','pipe','pipe']});
   let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('error',no);child.on('exit',code=>code?no(Error(out)):yes(out));
  });
  const line=outputText.split('\n').find(l=>l.startsWith('EVAL '));const result=JSON.parse(line.slice(5));
  console.log(JSON.stringify(result));assert.equal(result.ok,true,result.error);assert.equal(result.overflow,false);assert.ok(outputText.includes('--- errors ---\n(none)'),outputText);
 }
}finally{await new Promise(r=>server.close(r));}
