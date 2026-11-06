// 常驻服务器运行时：共享 cards 构建/商店/抽牌规则，每场战斗只增量推进。
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import * as wasm from '../vendor/tswn_wasm_duel/tswn_wasm.js';
import {loadEngine,makeCard,buildLine} from '../js/engine.js';
import * as G from '../js/game.js';
import {drawHand,ACTIVE_ID,NORMAL_ID,canPlayHandCard} from '../js/hand.js';
import {effectiveSkillLevel} from '../js/skills.js';
import tactics from '../data/tactics.json';
import ladderSnapshot from '../data/ladder.json';

wasm.initSync({module:readFileSync(new URL('./arena-wasm/tswn_wasm_bg.wasm',import.meta.url))});
await loadEngine();
const battles=new Map();
const clean=value=>JSON.parse(JSON.stringify(value,(k,v)=>k==='icon'?undefined:v));
function stateFor(card){return {collection:[card],weapons:[],run:{clan:card.clan,index:10,forged:[]}};}
function snapshot(entry,q){
  const session=entry.session,states=session.current_states(),initial=session.initial_states();
  const actor=states.find(s=>s.id===session.paused_actor());
  const side=actor?.input_team_index ?? null;
  let hand=[];
  if(actor){
    const source=q.cards[side],excluded=new Set();
    const allies=states.filter(s=>s.input_team_index===side);
    if(!allies.some(s=>!s.alive))excluded.add('sklrevive');
    if(actor.status_labels.some(x=>x.startsWith('蓄力')))excluded.add('sklcharge');
    if(actor.status_labels.some(x=>x.startsWith('铁壁')))excluded.add('skliron');
    if(allies.some(s=>s.owner_id===actor.id&&s.minion_kind==='summon'&&s.alive))excluded.add('sklsummon');
    const skills=actor.skills.map(([name,lv])=>{const id='skl'+name.replace(/^core\.skill\./,'');return {...source.skillList.find(s=>s.id===id),id,lv:effectiveSkillLevel(lv)};});
    if(actor.status_labels.some(x=>x.startsWith('狂暴')))for(const id of Object.keys(ACTIVE_ID))excluded.add(id);
    hand=[{id:'normal',lv:0,cost:0},...drawHand(skills,G.mulberry32((q.seed^(q.actions.length*2654435761))>>>0),3,excluded)]
      .map(c=>({...c,code:c.id==='normal'?NORMAL_ID:ACTIVE_ID[c.id],usable:canPlayHandCard(c,actor.magic_point)}));
  }
  // 结算后本体可能不再标记 active；只排除召唤物，保证胜者带出真实剩余 HP。
  return {states,initial,actor:actor?.id??null,side,hand,done:session.is_done(),winner:session.result()?.winner_team_indices||[],rounds:session.rounds_advanced(),log:entry.log.slice(-32),root_hp:q.cards.map((_,i)=>Math.max(0,...states.filter(s=>s.input_team_index===i&&s.owner_id==null&&s.alive).map(s=>s.hp)))};
}
function advance(entry){
  for(let f;(f=entry.session.next_frame())!=null;){entry.log.push(...f.updates.map(u=>u.message_rendered).filter(Boolean));if(entry.log.length>80)entry.log.splice(0,entry.log.length-64);}
}
function battle(q){
  let entry=battles.get(q.id);
  // 只有服务重启或数据库回滚导致指令前缀不一致时才恢复历史，正常出牌保留原会话。
  if(entry&&(entry.count>q.actions.length||JSON.stringify(entry.actions)!==JSON.stringify(q.actions.slice(0,entry.count)))){entry.session.free();battles.delete(q.id);entry=null;}
  if(!entry){
    const input=q.cards.map(c=>buildLine(c)).join('\n\n')+'\nseed:'+q.seed+'@!';
    const session=new wasm.BattleSession(input,{include_icons:false,max_rounds:5000,controlled_team:q.pvp?4294967295:0});
    const initial=session.initial_states();
    // input_team_index 是原输入位置，不依赖引擎对队伍/名字的排序。
    if(!q.pvp&&initial.find(s=>s.input_team_index===0).team_index!==0){session.free();const team=initial.find(s=>s.input_team_index===0).team_index;entry={session:new wasm.BattleSession(input,{include_icons:false,max_rounds:5000,controlled_team:team}),count:0,actions:[],log:[]};}
    else entry={session,count:0,actions:[],log:[]};
    entry.session.set_initial_hp(new Uint32Array(entry.session.initial_states().filter(s=>s.owner_id==null).flatMap(s=>[s.id,Math.max(1,Math.min(s.max_hp,q.hp[s.input_team_index]))])));
    advance(entry);battles.set(q.id,entry);
  }
  while(entry.count<q.actions.length){
    const command=q.actions[entry.count];
    entry.session.submit_action(...command);advance(entry);entry.actions.push(command);entry.count++;
  }
  entry.touched=Date.now();
  return snapshot(entry,q);
}
export async function execute(q){
  if(q.op==='ladder'){
    // 复用 cards 的 1A 天梯抓取；网络不可用时明确保存仓库快照来源。
    try { const entries=await G.fetchLaneEntries('1A',{signal:AbortSignal.timeout(4000)});if(!entries.length)throw Error('empty ladder');return {score:Math.max(...entries.map(e=>Number(e.score))),source:'live',fetched_at:new Date().toISOString(),lane:'1A'}; }
    catch { const entries=ladderSnapshot.lanes?.['1A']?.queue||[];return {score:entries.length?Math.max(...entries.map(e=>Number(e.score))):null,source:'snapshot',fetched_at:ladderSnapshot.meta?.fetchedAt||null,lane:'1A'}; }
  }
  const rng=G.mulberry32(q.seed>>>0);
  if(q.op==='spawn_npcs'){
    // 开局固定二十个真实 1A 名字与二十个原版随机试炼，测试仅替换外部天梯输入。
    let entries=q.ladder_entries,source=q.ladder_entries?'fixture':'live';
    if(!entries){try{entries=await G.fetchLaneEntries('1A',{signal:AbortSignal.timeout(4000)});if(!entries.length)throw Error('empty');}catch{entries=ladderSnapshot.lanes['1A'].queue;source='snapshot';}}
    entries=[...entries];for(let i=entries.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[entries[i],entries[j]]=[entries[j],entries[i]];}
    const cards=Array.from({length:20},(_,i)=>{const entry=entries[i%entries.length];return {kind:'ladder',score:Number(entry.score)||0,card:G.opponentFromEntry(entry,1).cards[0]};});
    cards.push(...Array.from({length:20},()=>({kind:'trial',score:0,card:G.makeFiller(1,rng)[0]})));return clean({npcs:cards,source});
  }
  if(q.op==='ai_battle'){
    // AI 对战不启用手牌控制，随机 seed 完全交给 tswn，结束后释放独立会话。
    const input=q.cards.map(c=>buildLine(c)).join('\n\n')+'\nseed:'+q.seed+'@!';
    const session=new wasm.BattleSession(input,{include_icons:false,max_rounds:5000});
    try{
      const initial=session.initial_states(),log=[];
      session.set_initial_hp(new Uint32Array(initial.filter(s=>s.owner_id==null).flatMap(s=>[s.id,Math.max(1,Math.min(s.max_hp,q.hp[s.input_team_index]))])));
      for(let f;(f=session.next_frame())!=null;){log.push(...f.updates.map(u=>u.message_rendered).filter(Boolean));if(log.length>30)log.splice(0,log.length-16);}
      const states=session.current_states(),teams=session.result()?.winner_team_indices||[];
      let winner=initial.find(s=>s.owner_id==null&&teams.includes(s.team_index))?.input_team_index??null;
      if(winner===null&&!session.is_done()){const hp=q.cards.map((_,i)=>Math.max(0,...states.filter(s=>s.input_team_index===i&&s.alive).map(s=>s.hp)));winner=hp[0]===hp[1]?Math.floor(rng()*2):hp[0]>hp[1]?0:1;}
      return {winner,log:log.slice(-12),rounds:session.rounds_advanced()};
    }finally{session.free();}
  }
  if(q.op==='create'){
    const card=G.replaceStarterRareSkills(makeCard(q.name||G.randomName(rng),q.clan),rng);G.refreshRunBuff(stateFor(card));return clean({card});
  }
  if(q.op==='npc'){
    // 普通 AI 与单人模式试炼完全共用随机 @! 构建，不额外缩放数值。
    return clean({card:G.makeFiller(1,rng)[0]});
  }
  if(q.op==='shop'){
    const s={run:{clan:q.clan},tacticsPool:tactics.tactics,ownedTactics:[],relics:[]};
    const stock=G.rollShop(s,q.seed,q.layer||1).filter(i=>['skill','weapon','potion'].includes(i.kind)).map(i=>({...i,price:Math.max(100,Math.round(i.price*.5/25)*25),...(i.potion?{potion:{id:'hp',n:2}}:{})}));return clean({stock});
  }
  if(q.op==='equip'){
    // 地图物品栏装卸沿用单人构建；战斗中由服务器拒绝换装。
    const card=structuredClone(q.card),state=stateFor(card);G.refreshRunBuff(state);
    if(q.weapon){state.weapons.push(q.weapon);G.equipWeapon(state,q.weapon.id,card.id);}else G.unequipWeapon(state,card.id);
    return clean({card});
  }
  if(q.op==='buy'){
    const card=structuredClone(q.card),s=stateFor(card);G.refreshRunBuff(s);
    if(q.item.kind==='weapon'){s.weapons.push(q.item.weapon);G.equipWeapon(s,q.item.weapon.id,card.id);}
    else if(q.item.kind==='skill'){
      const add=q.item.skill;if(card.lostSkills?.[add.id])throw Error('skill removed');
      const training=(card.skillTraining||={})[add.id]||={gain:0,count:0,mpMul:1};training.gain+=add.lv;
      if(add.playerShadow)training.playerShadow=true;if(add.playerDisperse)training.playerDisperse=true;
      G.refreshRunBuff(s);
    }
    return clean({card});
  }
  if(q.op==='battle')return battle(q);
  if(q.op==='release'){const e=battles.get(q.id);if(e)e.session.free();battles.delete(q.id);return {};}
  if(q.op==='health')return {ready:true,sessions:battles.size,revision:process.env.ARENA_REVISION||''};
  throw Error('unknown arena operation');
}
// 仅回环地址提供内部 RPC，秘密来自服务器环境，浏览器不能提交战斗结果或角色数值。
const secret=process.env.CARDS_SECRET||'dev-secret-change-me';
const server=createServer(async(req,res)=>{
  const token=String(req.headers['x-arena-secret']||''),a=Buffer.from(token),b=Buffer.from(secret);
  if(a.length!==b.length||!timingSafeEqual(a,b)){res.writeHead(403);res.end();return;}
  if(req.headers['x-arena-revision']&&req.headers['x-arena-revision']!==(process.env.ARENA_REVISION||'')){res.writeHead(409);res.end();return;}
  let body='';try{for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw Error('request too large');}const q=JSON.parse(body||'{}');if(q.op==='shutdown'){res.end(JSON.stringify({ok:true}));server.close(()=>process.exit(0));return;}const result=await execute(q);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(clean({ok:true,protocol:3,...result})));}
  catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:String(error)}));}
});
server.listen(Number(process.env.ARENA_RUNTIME_PORT||8801),'127.0.0.1');
server.on('error',error=>{process.stderr.write(String(error));process.exit(1);});
setInterval(()=>{for(const [id,e]of battles)if(Date.now()-e.touched>30*60*1000){e.session.free();battles.delete(id);}},60_000).unref();
