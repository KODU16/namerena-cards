// 真实手牌验证负 MP、喝药后仍为负 MP 时的普攻按钮和 0 费用提交。
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
globalThis.document={getElementById(){},addEventListener(){}};
const {canPlayHandCard}=await import('../js/duel.js');
for(const mp of [-100000,-200,-80,-20,-1,0,1,100]){
  assert.equal(canPlayHandCard({id:'normal',cost:0},mp),true);
  assert.equal(canPlayHandCard({id:'sklfire',cost:8},mp),mp>=8);
}
const script=`(async()=>{try{
const E=await import('/js/engine.js'),D=await import('/js/duel.js'),U=await import('/js/ui.js'),G=await import('/js/game.js');await E.loadEngine();
const p=E.makeCard('负魔测试','青'),e=E.makeCard('负魔目标','赤');p.skillList=[{id:'sklfire',lv:50}];p.stats.hp=e.stats.hp=20000;
const w=E.engineWasm(),input=E.buildLine(p)+'\\n\\n'+E.buildLine(e)+'\\nseed:negative@!',probe=new w.BattleSession(input,{}),team=probe.initial_states().find(s=>s.input_team_index===0).team_index;probe.free();
const duel=new D.Duel({wasm:w,iconFor:E.iconFor},{input,playerTeam:team,champion:p,team:[p]}),decision=duel.nextDecision(),root=document.querySelector('#screen');
U.renderBattleShell(root,window.__nc.state,null,{onSpeed(){},onSkip(){}});const v=new D.DuelView(root,duel,{onFinish(){}});v.current=decision.replay;v.step=()=>{};
let submitted=[];duel.queue=(...args)=>submitted.push(args);const results=[];
for(const mp of [-200,-80,-20,-1,0,100])for(const potion of [false,true]){
 const state={...decision.unit,magic_point:mp};v.askCard(decision,state);if(potion)v.previewPotion(G.potionById('mp'),state);
 const current=potion?Math.min(100,mp+40):mp,normal=root.querySelector('.hcard--normal');
 if(normal.disabled||normal.classList.contains('is-locked'))throw Error('普攻被锁定：'+current);
 if(current<0&&[...root.querySelectorAll('.hcard:not(.hcard--normal)')].some(n=>!n.disabled))throw Error('负 MP 技能不应可用');
 const before=submitted.length;normal.click();await new Promise(r=>setTimeout(r,350));
 if(submitted.length!==before+1||submitted.at(-1)[1]!==255||submitted.at(-1)[2]!==0)throw Error('普攻未以零费用提交');
 if(v.displayMp.get(state.id)!==current)throw Error('普攻额外扣除了 MP');
 results.push({mp:current,potion,submitted:true,cost:0});
}
duel.dispose();return {cases:results.length,negative:results.filter(r=>r.mp<0).length,normalAlwaysAvailable:true,zeroCost:true};
}catch(e){return {error:String(e),stack:e.stack}}})()`;
const r=spawnSync(process.execPath,['tools/cdp.mjs',process.env.CARDS_TEST_URL||'http://127.0.0.1:8127/','output/negative-mp-verified.png','1600',script],{encoding:'utf8'});
console.log(r.stdout,r.stderr);if(r.status||r.stdout.includes('"error":')||!r.stdout.includes('normalAlwaysAvailable'))process.exitCode=1;
