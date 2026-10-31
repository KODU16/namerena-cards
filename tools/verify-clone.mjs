// 通过真实 Duel 持久会话验证分身出牌，旧战报和随机流应当持续保留。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.window={};
globalThis.document={getElementById(){},addEventListener(){}};
globalThis.fetch=async url=>new Response(readFileSync(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
const E=await import('../js/engine.js');await E.loadEngine();
const {Duel,NORMAL_ID}=await import('../js/duel.js');
const wasm=E.engineWasm();
for(const level of [9,106]) {
 const player=E.makeCard('tya_love_zrh #5Iilr3cYCKPr7TOzKQSH','测试'),enemy=E.makeCard('叶夜电','!');
 player.stats={hp:20000,atk:40,def:40,spd:200,agi:40,mag:40,res:40,wis:100};
 player.skillList=[{id:'sklclone',lv:level},{id:'sklfire',lv:60}];
 enemy.stats={hp:20000,atk:10,def:40,spd:80,agi:40,mag:40,res:40,wis:40};enemy.skillList=[];
 const input=E.buildLine(player)+'\n\n'+E.buildLine(enemy)+'\nseed:3719276890@!';
 const probe=new wasm.BattleSession(input,{max_rounds:20000});
 const playerTeam=probe.initial_states().find(s=>s.input_team_index===0).team_index;probe.free();
 let created=0;
 const trackedWasm={...wasm,BattleSession:class extends wasm.BattleSession {constructor(...args){super(...args);created++;}},battle_replay_forced(){throw Error('实战不能重新运行开局回放');}};
 const duel=new Duel({wasm:trackedWasm,iconFor:E.iconFor},{input,playerTeam,champion:player,team:[player],enemies:[enemy]});
 let decision=duel.nextDecision(),cloneTurns=0,cloneSkills=0;const commands=[];
 const runtime=duel.session;
 for(let turn=0;turn<16;turn++) {
   assert.ok(decision.unit,'应继续等待出牌，而非提前结束');
   const isClone=decision.unit.minion_kind==='clone';
   if(isClone) cloneTurns++;
   const useSkill=isClone && decision.unit.magic_point>=8 && cloneTurns%2===0;
   const skill=turn===0?23:useSkill?0:NORMAL_ID,mp=skill===NORMAL_ID?0:8;
   if(useSkill)cloneSkills++;
   const previous=decision.replay.frames;
   assert.strictEqual(duel.simulate(),decision.replay,'等待出牌时不得额外推进');
   commands.push(decision.unit.id,skill,mp);
   duel.queue(decision.unit.id,skill,mp);
   decision=duel.nextDecision();
   assert.strictEqual(duel.session,runtime,'所有动作需基于同一个当前运行时');
   assert.ok(decision.replay.frames.length>previous.length,'出牌后应推进战报');
   previous.forEach((frame,i)=>assert.strictEqual(decision.replay.frames[i],frame,'历史战报对象应原样保留'));
   assert.deepEqual(decision.replay.frames.slice(0,previous.length),previous,'既有战报不得因分身指令改变');
   if(useSkill)assert.ok(decision.replay.frames.slice(previous.length).flatMap(f=>f.updates).some(u=>u.message_rendered.includes('火球')),'分身技能需实际执行');
 }
 assert.ok(cloneTurns>=2);assert.ok(cloneSkills>=1);assert.equal(created,1);
 // 离线回放仅作结果对照，实际 Duel 禁止调用它。
 const reference=wasm.battle_replay_forced(input,new Uint32Array(commands),{controlled_team:playerTeam,max_rounds:20000});
 assert.deepEqual(decision.replay.final_states,reference.final_states);
 assert.deepEqual(decision.replay.frames,reference.frames);
 duel.dispose();assert.equal(duel.session,null);
 console.log(JSON.stringify({cloneLevel:level,decisions:16,cloneTurns,cloneSkills,replayPrefix:'unchanged',sessionsCreated:created,mode:'persistent'}));
}

// 正常终局保留可读战报并释放运行时，后续查询不会创建新对局。
const winner=E.makeCard('持续会话胜者','测试'),loser=E.makeCard('持续会话对手','!');
winner.stats={hp:3000,atk:200,def:150,spd:240,agi:100,mag:40,res:150,wis:100};winner.skillList=[];
loser.stats={hp:80,atk:10,def:10,spd:40,agi:10,mag:10,res:10,wis:10};loser.skillList=[];
const input=E.buildLine(winner)+'\n\n'+E.buildLine(loser)+'\nseed:finish-session@!';
const probe=new wasm.BattleSession(input,{}),playerTeam=probe.initial_states().find(s=>s.input_team_index===0).team_index;probe.free();
const duel=new Duel({wasm,iconFor:E.iconFor},{input,playerTeam,champion:winner,team:[winner],enemies:[loser]});
let decision=duel.nextDecision();for(let turn=0;decision.unit&&turn<30;turn++){duel.queue(decision.unit.id,NORMAL_ID);decision=duel.nextDecision();}
assert.equal(decision.replay.finished,true);assert.equal(duel.session,null);assert.strictEqual(duel.simulate(),decision.replay);
assert.throws(()=>duel.queue(0,NORMAL_ID));duel.dispose();
console.log(JSON.stringify({finished:true,sessionFreed:true,cachedResult:true}));
