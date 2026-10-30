// 使用真实 WASM 回归暂停续行、指令封包和药水生命周期。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = path.resolve(process.argv[2] || 'dist');
const wasm = await import(pathToFileURL(path.join(dir, 'tswn_wasm.js')).href);
wasm.initSync({ module: readFileSync(path.join(dir, 'tswn_wasm_bg.wasm')) });
const line = (name, speed, skills = {}) => name + '@test+ol:' + JSON.stringify({attrs:[40,40,speed,40,40,40,100,20000],skills,name_factor_enabled:false});
const raw = line('one',140,{sklfire:60}) + '\n' + line('two',140) + '\n\n' + line('enemy',100) + '\nseed:card-regression@!';
const options = {controlled_team:0,max_rounds:2000};
const paused = wasm.battle_replay_forced(raw,new Uint32Array(),options);
assert.equal(paused.stop_reason,'paused');
assert.equal(typeof paused.paused_actor,'number');
assert.ok(paused.initial_states.some(s=>s.skills.some(([name,lv])=>name==='core.skill.fire' && lv===60)));
for (const packet of [[1],[1,0],[1,25,0],[1,0,8<<8],[1,0,11<<8],[1,0,1<<16]]) {
  assert.throws(()=>wasm.battle_replay_forced(raw,new Uint32Array(packet),options));
}
for (const pct of [0,-1,Infinity,NaN]) assert.throws(()=>wasm.battle_replay(raw,{...options,start_hp_pct:pct}));
assert.throws(()=>wasm.battle_replay(raw,{start_hp_pct:1.2}));
const half = wasm.battle_replay_forced(raw,new Uint32Array(),{...options,start_hp_pct:0.5});
for(const state of half.initial_states) assert.equal(state.hp,state.team_index===0 ? Math.round(state.max_hp*0.5) : state.max_hp);
const session = new wasm.BattleSession(raw,options), other = new wasm.BattleSession(raw,options);
const frames=[], commands=[], counts=new Map();
let overlap=false,fire=false;
function advance(s,out){ for(let f;(f=s.next_frame())!=null;)out.push(f); assert.equal(s.stop_reason(),'paused'); assert.equal(s.is_done(),false); }
advance(session,frames);
for(let turn=0;turn<10;turn++) {
  const actor=session.paused_actor(),count=counts.get(actor)||0;
  if(turn===0) advance(other,[]);
  const isFire=count===0 && session.current_states().find(s=>s.id===actor).skills.some(([name])=>name==='core.skill.fire');
  const skill=isFire?0:255,packed=(count===0?1<<8:0)|23;
  fire ||= isFire;
  counts.set(actor,count+1);commands.push(actor,skill,packed);
  session.submit_action(actor,skill,packed);advance(session,frames);
  let boosted=0;
  for(const state of session.current_states().filter(s=>s.team_index===0)) {
    const base=paused.initial_states.find(s=>s.id===state.id).attack;
    const n=counts.get(state.id)||0;
    assert.equal(state.attack,n===1?base+Math.max(8,Math.trunc(base/4)):base);
    boosted+=Number(n===1);
  }
  overlap ||= boosted===2;
}
assert.ok(overlap);
assert.ok(fire);
const replay=wasm.battle_replay_forced(raw,new Uint32Array(commands),options);
assert.deepEqual(replay.frames,frames);
assert.deepEqual(replay.final_states,session.current_states());
assert.equal(replay.paused_actor,session.paused_actor());
// 缺少技能的合法主动编号会明确记录退化普攻的原因。
const unavailable=wasm.battle_replay_forced(raw,new Uint32Array([paused.paused_actor,24,23]),options);
assert.ok(unavailable.frames.flatMap(f=>f.updates).some(u=>u.message_rendered.includes('改为普通攻击')));

// 先耗尽 MP；能量药水必须让紧接着的技能成功，不能等技能结束才回复。
const immediateRaw=line('caster',240,{sklfire:60})+'\n\n'+line('dummy',40)+'\nseed:immediate-potion@!';
const opening=wasm.battle_replay_forced(immediateRaw,new Uint32Array(),options);
const caster=opening.paused_actor,initialMp=opening.final_states.find(s=>s.id===caster).magic_point;
const drain=[caster,0,initialMp];
const drained=wasm.battle_replay_forced(immediateRaw,new Uint32Array(drain),options);
const before=drained.final_states.find(s=>s.id===caster).magic_point;
assert.ok(before<50 && before+40>=50);
const energy=wasm.battle_replay_forced(immediateRaw,new Uint32Array([...drain,caster,0,(10<<8)|50]),options);
const newUpdates=energy.frames.slice(drained.frames.length).flatMap(f=>f.updates);
assert.ok(newUpdates.some(u=>u.caster_id===caster && u.message_rendered.includes('火球')));
assert.ok(!newUpdates.some(u=>u.message_rendered.includes('改为普通攻击')));
const magic=wasm.battle_replay_forced(immediateRaw,new Uint32Array([caster,0,(5<<8)|initialMp]),options);
const baseMagic=opening.final_states.find(s=>s.id===caster).magic;
assert.equal(magic.final_states.find(s=>s.id===caster).magic,baseMagic+Math.max(8,Math.trunc(baseMagic/4)));

session.free();other.free();
console.log(JSON.stringify({turns:10,streamMatchesBatch:true,potionOverlap:overlap,fire,invalidPackets:'rejected',fractionalHp:'passed',immediatePotion:'passed'}));
