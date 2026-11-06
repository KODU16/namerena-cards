// 能力与熟练度独立：倍率只作用于对应技能，效果语义完全相同才比较高低值。
import {SKILLS, SKILL_IDS, skillMeta} from './skills.js';
export const ABILITY_SKILLS = [...SKILL_IDS];
const COST_SKILLS = new Set(['sklhalf','sklexchange','sklcharm','sklhaste','sklslow','skliron','sklcharge','sklaccumulate','sklsummon','sklclone','sklshadow','skldefend','sklprotect','sklreflect','sklzombie','sklpossess']);
const SPECIAL = {sklreraise:'复起体力',sklshield:'护盾增长',sklmerge:'继承资源',sklupgrade:'属性增量',sklhide:'隐匿增益'};
// 蓝色能力卡定位为中等幅度的永久强化，仍不触碰任何技能熟练度。
export const ABILITIES = ABILITY_SKILLS.map((skill) => ({id:'ability-'+skill,rarity:'blue',name:skillMeta(skill).name+'·'+(COST_SKILLS.has(skill)?'节流':'增幅'),effect:{skill,kind:COST_SKILLS.has(skill)?'mp':'power',metric:COST_SKILLS.has(skill)?'mp':SPECIAL[skill]||'随机强度'},value:COST_SKILLS.has(skill)?3:1.15}));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const abilityKey = (ability) => JSON.stringify(canonical(ability.effect));
export function abilityDescription(a) {
 const name=skillMeta(a.effect.skill).name;
 return a.effect.kind==='mp' ? name+'发动时少消耗 '+a.value+' MP。' : name+'的'+a.effect.metric+' ×'+a.value+'（额外乘区，不改变熟练度）。';
}
export function normalizeAbilities(list) {
 const result=new Map();
 for(const a of Array.isArray(list)?list:[]) {
  if(!a?.effect || !SKILLS[a.effect.skill] || !['mp','power'].includes(a.effect.kind) || !Number.isFinite(a.value) || (a.effect.kind==='mp' ? a.value<1||a.value>20||!Number.isInteger(a.value) : a.value<=1||a.value>2))continue;
  const key=abilityKey(a),old=result.get(key);
  if(!old || a.value>old.value)result.set(key,{...a,rarity:'blue',effect:{...a.effect}});
 }
 return [...result.values()];
}
export function rollAbility(rng) {
 const base=ABILITIES[Math.floor(rng()*ABILITIES.length)];
 const value=base.effect.kind==='mp'?2+Math.floor(rng()*3):Math.round((1.12+Math.floor(rng()*3)*.03)*100)/100;
 return {...base,effect:{...base.effect},value};
}
export function acquireAbility(state, ability) {
 const before=state.abilities||[],next=normalizeAbilities([...before,ability]);
 const key=abilityKey(ability),previous=before.find(a=>abilityKey(a)===key),stored=next.find(a=>abilityKey(a)===key);
 state.abilities=next;
 return {changed:!!stored&&(!previous||stored.value>previous.value),upgraded:!!previous&&!!stored&&stored.value>previous.value};
}
export function abilityFor(list,skill) { return normalizeAbilities(list).filter(a=>a.effect.skill===skill); }
// 展示和引擎采用同一减耗边界，多个不同效果共存时也不重复或超额扣减。
export function abilityMpCost(list,skill,base) { return Math.max(1,base-Math.min(20,abilityFor(list,skill).filter(a=>a.effect.kind==='mp').reduce((n,a)=>n+a.value,0))); }
export function abilityPacket(list) {
 const out=[];
 for(const [id,skill] of ABILITY_SKILLS.entries()) {
  const effects=abilityFor(list,skill),mp=effects.filter(a=>a.effect.kind==='mp').reduce((n,a)=>n+a.value,0),power=effects.filter(a=>a.effect.kind==='power').reduce((n,a)=>n*a.value,1);
  if(effects.length)out.push(id,Math.min(20,mp),Math.min(20000,Math.round(power*10000)));
 }
 return new Uint32Array(out);
}
