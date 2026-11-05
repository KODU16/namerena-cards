// 真实双账号、400 格地图与战斗弹窗回归；手机横屏游玩，竖屏显示旋转提示。
import {spawnSync} from 'node:child_process';
const script=`(async()=>{try{
const original=window.fetch.bind(window);window.fetch=(url,opts={})=>original(url,{...opts,headers:{...(opts.headers||{}),...(String(url).startsWith('/api/cards')?{'X-Debug-Team':'ui-alpha'}:{})}});
const auth=await window.fetch('/api/cards/arena/session').then(r=>r.json());const rooms=await window.fetch('/api/cards/arena/rooms').then(r=>r.json());if(rooms.my_room)await window.fetch('/api/cards/arena/rooms/'+rooms.my_room+'/actions',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':auth.csrf_token},body:JSON.stringify({kind:'leave',action_id:crypto.randomUUID()})});
const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('等待界面超时：'+document.querySelector('#screen').textContent.slice(0,160));};
const button=text=>[...document.querySelectorAll('#screen button')].find(b=>b.textContent.trim()===text);
button('多人 · 大逃杀').click();await wait(()=>button('创建私房'));document.querySelector('[aria-label="创建私房密钥"]').value='ui-room-key';button('创建私房').click();await wait(()=>document.querySelector('.arena-game'));
const code=document.querySelector('.arena-mode__header b').textContent.match(/[A-F0-9]{6}/)[0],base='/api/cards/arena/rooms/'+code;
if(innerWidth<innerHeight&&innerWidth<=900){if(getComputedStyle(document.querySelector('.arena-rotate')).display==='none'||getComputedStyle(document.querySelector('.arena-workspace')).display!=='none')throw Error('竖屏未提示旋转');return {portrait:'rotate prompt',width:innerWidth};}
const alpha={'Content-Type':'application/json','X-Debug-Team':'ui-alpha','X-CSRFToken':auth.csrf_token};
const session=await original('/api/cards/arena/session',{headers:{'X-Debug-Team':'ui-beta'}}).then(r=>r.json());const beta={'Content-Type':'application/json','X-Debug-Team':'ui-beta','X-CSRFToken':session.csrf_token};
const post=async(url,body,headers=beta)=>{const r=await original(url,{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};
const betaRooms=await original('/api/cards/arena/rooms',{headers:{'X-Debug-Team':'ui-beta'}}).then(r=>r.json());if(betaRooms.my_room)await post('/api/cards/arena/rooms/'+betaRooms.my_room+'/actions',{kind:'leave',action_id:crypto.randomUUID()});
await post(base+'/actions',{kind:'join',key:'ui-room-key',action_id:crypto.randomUUID()});await wait(()=>button('开始对局')&&!button('开始对局').disabled);button('开始对局').click();await wait(()=>button('搜索'));
await post('/test/arena-fixture',{room:code},{'Content-Type':'application/json'});
await post(base+'/actions',{kind:'attack',target:'ui-beta',action_id:crypto.randomUUID()},alpha);await wait(()=>document.querySelector('.arena-battle-modal'));
let me=await window.fetch(base).then(r=>r.json());const turn=me.room.battle.turn;
if(me.room.battle.your_turn){const normal=[...document.querySelectorAll('#battle-hand .hcard')].find(b=>b.textContent.includes('普通攻击'));if(!normal||normal.disabled)throw Error('普攻不可点击');normal.click();}
else{const current=await original(base,{headers:beta}).then(r=>r.json());await post(base+'/actions',{kind:'card',card:'normal',turn:current.room.battle.turn,action_id:crypto.randomUUID()});}
for(let i=0;i<100;i++){const check=await window.fetch(base).then(r=>r.json());if(check.room.battle?.turn>turn)break;if(i===99)throw Error('手动出牌没有完成');await new Promise(r=>setTimeout(r,50));}
await post('/test/arena-fixture',{room:code,expire:true},{'Content-Type':'application/json'});await new Promise(r=>setTimeout(r,2600));
let after=await window.fetch(base).then(r=>r.json());if(after.room.battle.turn<turn+2)throw Error('超时未托管');
for(let i=0;i<8;i++){const now=await window.fetch(base).then(r=>r.json());if(now.room.battle.your_turn)break;const other=await original(base,{headers:beta}).then(r=>r.json());await post(base+'/actions',{kind:'card',card:'normal',turn:other.room.battle.turn,action_id:crypto.randomUUID()});}
await wait(()=>document.querySelector('#battle-hand button'));await new Promise(r=>setTimeout(r,300));
const audit=scope=>{const buttons=[...scope.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;});const collisions=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].getBoundingClientRect(),b=buttons[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>3&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>3)collisions.push([buttons[i].textContent.slice(0,12),buttons[j].textContent.slice(0,12)]);}if(collisions.length||document.documentElement.scrollWidth>innerWidth+1)throw Error(JSON.stringify({collisions,width:innerWidth,scroll:document.documentElement.scrollWidth}));};
audit(document.querySelector('.arena-battle-modal'));const handButtons=document.querySelectorAll('#battle-hand button').length;
button('收起查看地图').click();const grid=document.querySelector('.arena-map'),right=document.querySelector('.arena-right');if(grid.children.length!==400||grid.getBoundingClientRect().right>right.getBoundingClientRect().left+1)throw Error('地图没有位于左侧或不是400格');
button('物品栏').click();if(!document.querySelector('.arena-inventory'))throw Error('物品栏切换失败');button('状态').click();audit(document.querySelector('.arena-workspace'));
return {room:code,width:innerWidth,height:innerHeight,mapCells:400,mapLeft:true,inventory:true,battleModal:true,manualPlay:true,timeout:true,handButtons,collisions:0};
}catch(e){return {error:String(e),stack:e.stack}}})()`;
const evalScript=process.env.CARDS_ARENA_SCREENSHOT==='battle'?script.replace('return {room:code',"button('返回战斗').click();return {room:code"):script;
const r=spawnSync(process.execPath,['tools/cdp.mjs','http://127.0.0.1:8817/cards/','output/arena-browser-'+(process.env.CARDS_VIEWPORT_WIDTH||1440)+'.png','1800',evalScript],{encoding:'utf8',maxBuffer:1024*1024});console.log(r.stdout,r.stderr);if(r.status||r.stdout.includes('"error":'))process.exitCode=1;
