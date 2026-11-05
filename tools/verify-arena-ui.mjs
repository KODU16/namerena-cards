// 使用实际部署构建和本地 Flask/WASM 后端，验证创建、加入、PvP 出牌与十秒托管。
import {spawnSync} from 'node:child_process';
const script=`(async()=>{try{
const original=window.fetch.bind(window);window.fetch=(url,opts={})=>original(url,{...opts,headers:{...(opts.headers||{}),...(String(url).startsWith('/api/cards')?{'X-Debug-Team':'ui-alpha'}:{})}});
const auth=await window.fetch('/api/cards/session').then(r=>r.json());const rooms=await window.fetch('/api/cards/arena/rooms').then(r=>r.json());if(rooms.my_room)await window.fetch('/api/cards/arena/rooms/'+rooms.my_room+'/actions',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':auth.csrf_token},body:JSON.stringify({kind:'leave',action_id:crypto.randomUUID()})});
const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('等待界面超时：'+document.querySelector('#screen').textContent.slice(0,180));};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
button('多人 · 大逃杀').click();await wait(()=>button('创建房间')&&!button('创建房间').disabled);button('创建房间').click();await wait(()=>document.querySelector('.arena-mode__header b'));
const code=document.querySelector('.arena-mode__header b').textContent.match(/[A-F0-9]{6}/)[0],base='/api/cards/arena/rooms/'+code;
const session=await original('/api/cards/session',{headers:{'X-Debug-Team':'ui-beta'}}).then(r=>r.json());const beta={'Content-Type':'application/json','X-Debug-Team':'ui-beta','X-CSRFToken':session.csrf_token};
const post=async(url,body,headers=beta)=>{const r=await original(url,{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};
await post(base+'/actions',{kind:'join',action_id:crypto.randomUUID()});await wait(()=>button('开始对局')&&!button('开始对局').disabled);button('开始对局').click();await wait(()=>document.querySelector('.arena-map'));
await post('/test/arena-fixture',{room:code},{'Content-Type':'application/json'});await wait(()=>button('交战'));button('交战').click();await wait(()=>document.querySelector('[data-arena-timer]'));
let me=await window.fetch(base).then(r=>r.json());const turn=me.room.battle.turn;
if(me.room.battle.your_turn){const normal=[...document.querySelectorAll('.arena-mode__hand .hcard')].find(b=>b.textContent.includes('普通攻击'));if(!normal||normal.disabled)throw Error('普攻不可点击');normal.click();}
else{const current=await original(base,{headers:beta}).then(r=>r.json());await post(base+'/actions',{kind:'card',card:'normal',turn:current.room.battle.turn,action_id:crypto.randomUUID()});}
for(let i=0;i<100;i++){const check=await window.fetch(base).then(r=>r.json());if(check.room.status==='finished'||check.room.battle?.turn>turn)break;if(i===99)throw Error('手动出牌没有完成');await new Promise(r=>setTimeout(r,50));}
await post('/test/arena-fixture',{room:code,expire:true},{'Content-Type':'application/json'});await new Promise(r=>setTimeout(r,2800));
const after=await window.fetch(base).then(r=>r.json());if(after.room.status==='active'&&after.room.battle.turn<turn+2)throw Error('超时未托管');
// 让当前浏览器实际获得手牌后再检查，避免只验证等待对手的空白区域。
for(let i=0;i<8;i++){const now=await window.fetch(base).then(r=>r.json());if(now.room.battle?.your_turn)break;const other=await original(base,{headers:beta}).then(r=>r.json());await post(base+'/actions',{kind:'card',card:'normal',turn:other.room.battle.turn,action_id:crypto.randomUUID()});}
await wait(()=>document.querySelector('.arena-mode__hand button'));await new Promise(r=>setTimeout(r,300));
const root=document.querySelector('#screen'),controls=[...root.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;});let collisions=0;const overlaps=[];
for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>3&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>3){collisions++;overlaps.push([controls[i].textContent.slice(0,35),controls[j].textContent.slice(0,35)]);}}
if(collisions||document.documentElement.scrollWidth>document.documentElement.clientWidth+1)throw Error(JSON.stringify({collisions,overlaps,width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,8)}));
return {room:code,realBattle:true,manualPlay:true,timeout:true,handButtons:root.querySelectorAll('.arena-mode__hand button').length,collisions,width:document.documentElement.clientWidth};
}catch(e){return {error:String(e),stack:e.stack}}})()`;
const r=spawnSync(process.execPath,['tools/cdp.mjs','http://127.0.0.1:8817/cards/','output/arena-browser-'+(process.env.CARDS_VIEWPORT_WIDTH||1440)+'.png','1800',script],{encoding:'utf8',maxBuffer:1024*1024});console.log(r.stdout,r.stderr);if(r.status||r.stdout.includes('"error":'))process.exitCode=1;
