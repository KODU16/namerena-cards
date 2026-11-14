import {abilityFor} from './abilities.js';
// 混沌牌的操作定义、数值解析与中文描述同源；每局固定牌池，升级只提高原槽位熟练度。
import {SKILL_IDS,SKILLS,effectiveSkillLevel} from './skills.js';
export const CHAOS_VERSION=1;
const targetNames={enemy:'随机一名存活敌人',enemies:'所有存活敌人',self:'自身',ally:'随机一名存活友方（含自身）',allies:'所有存活友方',dead_ally:'随机一名可复活的阵亡本体友方'};
const atom=(id,name,targets,base,step,text,source)=>({id,name,targets,base,step,text,source});
export const CHAOS_OPERATIONS=Object.freeze([
 atom('physical','斩击',['enemy','enemies'],65,1,v=>'以引擎物理普攻随机强度的 '+v+'% 攻击；正常经过命中、防御、护盾与反应钩子','攻击/连击/会心/反击'),
 atom('magic','魔弹',['enemy','enemies'],70,1,v=>'以引擎法术普攻随机强度的 '+v+'% 攻击；正常经过命中、抗性、护盾与反应钩子','火球/雷击/地震/吸血'),
 atom('pure','穿透',['enemy'],8,1,v=>'造成固定 '+v+' 点伤害；不做普攻命中与防御换算，保留死亡/复活链及低伤害遗物判定','净化伤害/自爆伤害'),
 atom('heal','回春',['self','ally','allies'],16,2,v=>'回复 '+v+' 点体力，不超过最大体力；不复活阵亡者','治愈/吸血/护身符回复'),
 atom('shield','凝盾',['self','ally','allies'],8,1,v=>'增加 '+v+' 点技能护盾，吸收后续伤害；不改护盾熟练度','蓄盾/守护/防御'),
 atom('mp','回蓝',['self','ally'],8,.25,v=>'回复 '+v+' 点 MP，上限 100','蓄力/恢复'),
 atom('drain_mp','蚀蓝',['enemy','enemies'],8,.4,v=>'扣除 '+v+' 点 MP，允许降为负数','净化/附体'),
 atom('haste','疾走',['self','ally'],1,.02,v=>'设置 '+Math.min(4,v)+' 个自身行动结束计数的疾走，速度 ×2；覆盖原疾走计数，自身施放当次行动末即计一次','加速'),
 atom('slow','迟缓',['enemy','enemies'],1,.02,v=>'设置 '+Math.min(4,v)+' 个目标行动结束计数的迟缓，速度减半；覆盖原迟缓计数','减速'),
 atom('ice','冻结',['enemy'],1,.02,v=>'调用 '+Math.min(4,v)+' 次原生冰冻附加判定；保留冰冻免疫、蓄力和遗物延时规则，不先造成伤害','冰冻'),
 atom('poison','毒素',['enemy','enemies'],5,0,()=> '直接进行原生中毒附加：存活且不免疫的目标中毒，毒强度来自施法者的原生法术随机强度，持续 4 次目标行动，遗物可延长','中毒'),
 atom('burn','灼痕',['enemy','enemies'],1,.02,v=>'调用 '+Math.min(4,v)+' 次原生燃烧附加；每次增加半档火焰伤害系数，不先造成伤害，保留免疫和语言包规则','火球/使魔自爆'),
 atom('curse','咒印',['enemy'],1,0,()=> '直接调用原生诅咒附加；保留 Boss/加成免疫、叠加和伤害加倍判定，不先造成伤害','诅咒'),
 atom('berserk','狂乱',['enemy'],1,0,()=> '直接调用原生狂暴附加；未免疫目标增加 1 回合狂暴（原生蓄力判定可增加），狂暴攻击由引擎接管','狂暴/附体'),
 atom('charm','魅惑',['enemy'],1,0,()=> '施放原生魅惑：保留命中、抗性、Boss 免疫与持续规则；通常 1 个行动结束计数，蓄力时 4，遗物可延长','魅惑'),
 atom('cleanse','净身',['self','ally','allies'],1,0,()=> '移除冰冻、中毒、诅咒、迟缓、狂暴、魅惑和燃烧，不移除感染类 Boss 状态','净化自身'),
 atom('dispel','驱散',['enemy'],1,0,()=> '调用原生正面状态清除，并扣 MP：原 MP>64 时扣64，>32 时清零，否则扣32；不先造成伤害','净化敌方'),
 atom('revive','苏生',['dead_ally'],20,2,v=>'复活目标并设为 '+v+' 点体力（不超过最大体力）；没有合法阵亡友方时跳过本项，不回收已被吞噬尸体','苏生'),
 ...[['atk_up','战意','攻击','聚气/垂死抗争'],['def_up','坚守','防御','防御/守护'],['mag_up','秘能','魔力属性','聚气/升级'],['res_up','抗咒','抗性','反弹/守护'],['agi_up','隐匿','敏捷','隐匿'],['wis_up','洞察','智慧','反击'],['speed_up','疾步','速度','加速']].map(([id,name,label,source])=>atom(id,name,['self','ally'],3,.2,v=>'本场战斗永久增加 '+v+' 点内部'+label+'，模板与当前值同步；不写回角色基础属性',source)),
 atom('iron','铁壁',['self','ally'],35,1,v=>'设置减伤值 '+v+' 的原生铁壁，持续 2 个目标行动结束计数；覆盖原铁壁，自身施放当次行动末即计一次','铁壁'),
 atom('max_hp','强生',['self','ally'],10,1,v=>'本场战斗最大体力和当前体力同时增加 '+v+'；不写回角色基础属性','分身属性构造/吞噬'),
 atom('sacrifice','献祭',['self'],6,.3,v=>'自身受到固定 '+v+' 点伤害，不做防御换算；可能触发致死和复活，施法者阵亡后终止后续操作','血祭/自爆'),
 atom('execute','瘟疫',['enemy'],5,.1,v=>'造成目标当前体力 '+v+'% 向下取整的直接伤害；不做普攻命中与防御换算，保留死亡/复活链和低伤害遗物','瘟疫'),
 atom('covid','疫源',['enemy'],1,.06,v=>'调用 covid Boss 原生接触感染，变异值 '+Math.min(15,v)+'；后续变异、扩散和肺炎由原生状态执行，已经有同种变异时按原生规则处理','Boss covid：接触/变异/扩散'),
 atom('lazy','怠惰',['enemy'],1,0,()=> '调用 lazy Boss 原生感染：未感染目标速度减半并保留原生怠惰发作行为，不改造成普通迟缓','Boss lazy：感染/发作'),
 atom('pneumonia','肺炎',['enemy'],1,.05,v=>'立即触发一次 covid Boss 原生肺炎结算（变异值 '+Math.min(15,v)+'）：按目标自身法术随机强度、其魔防和变异量计算伤害，并按原规则回复施法者','Boss covid：肺炎/吸收'),
 ...[['summon','使魔','血祭'],['shadow','幻影','幻术'],['zombie','亡灵','召唤亡灵'],['clone','分身','分身']].map(([id,name,source])=>atom(id,name,['self'],20,.4,v=>'为自身创造一个'+name+'类混沌子体：最大体力与当前内部攻防魔抗敏智取本体的 '+v+'% 向下取整，速度取本体，体力至少1；子体不携带技能与随机程序，按引擎普通行动；同根角色最多8个存活子体，本体不衰减',source)),
 atom('merge','吞噬',['dead_ally'],1,0,()=> '调用原生吞噬已阵亡友方；属性取原生构造各项较高值、技能按原生固定槽位继承，不保证每次提高，不复活尸体','吞噬'),
 atom('saitama','认真一拳',['enemy'],240,3,v=>'提取 saitama Boss 拳击强度，以物理普攻随机强度的 '+v+'% 攻击；不附带原 Boss 的十次等待与饥饿离场条件','Boss saitama：拳击'),
]);
const catalogue=new Map(CHAOS_OPERATIONS.map(x=>[x.id,x]));
export const CHAOS_SOURCES=Object.freeze({
 sklfire:['magic','burn'],sklice:['magic','ice'],sklthunder:['magic'],sklquake:['magic'],sklabsorb:['magic','heal'],sklpoison:['magic','poison'],sklrapid:['physical'],sklcritical:['physical'],sklhalf:['execute'],sklexchange:['mp','drain_mp'],sklberserk:['physical','berserk'],sklcharm:['charm'],sklhaste:['haste'],sklslow:['slow'],sklcurse:['magic','curse'],sklheal:['heal'],sklrevive:['revive'],skldisperse:['dispel','cleanse'],skliron:['iron'],sklcharge:['physical','mp'],sklaccumulate:['atk_up'],sklassassinate:['physical','agi_up'],sklsummon:['sacrifice','summon'],sklclone:['clone'],sklshadow:['shadow'],skldefend:['def_up'],sklprotect:['shield'],sklreflect:['res_up','magic'],sklreraise:['heal'],sklshield:['shield'],sklcounter:['physical','wis_up'],sklmerge:['merge'],sklzombie:['zombie'],sklupgrade:['atk_up','def_up','mag_up'],sklhide:['agi_up'],sklexplode:['sacrifice','magic'],sklpossess:['berserk','drain_mp'],boss_covid:['covid','pneumonia'],boss_lazy:['lazy'],boss_saitama:['saitama'],
});
const rngFor=seed=>()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
export function chaosSeed(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
// 名称片段必须逐字来自实际组成技能；不造前缀、不加序号或分隔符。
export const CHAOS_NAME_PARTS=Object.freeze({
 sklfire:['火球','术'],sklice:['冰冻','术'],sklthunder:['雷击','术'],sklquake:['地裂','术'],sklabsorb:['吸','血'],sklpoison:['投','毒'],sklrapid:['连','击'],sklcritical:['会心','一击'],sklhalf:['瘟','疫'],sklexchange:['生命','之轮'],sklberserk:['狂暴','术'],sklcharm:['魅惑'],sklhaste:['加速','术'],sklslow:['减速','术'],sklcurse:['诅','咒'],sklheal:['治愈','魔法'],sklrevive:['苏生','术'],skldisperse:['净','化'],skliron:['铁','壁'],sklcharge:['蓄','力'],sklaccumulate:['聚','气'],sklassassinate:['背','刺'],sklsummon:['血','祭'],sklclone:['分','身'],sklshadow:['幻','术'],skldefend:['防','御'],sklprotect:['守','护'],sklreflect:['伤害','反弹'],sklreraise:['护身','符'],sklshield:['蓄','盾'],sklcounter:['反','击'],sklmerge:['吞','噬'],sklzombie:['召唤','亡灵'],sklupgrade:['垂死','抗争'],sklhide:['隐','匿'],sklexplode:['自','爆'],sklpossess:['附','体'],boss_covid:['新冠','肺炎'],boss_lazy:['怠','惰'],boss_saitama:['认真','一拳'],
});
export function assembleChaosName(ops,rng=Math.random){
 const sources=ops.map(op=>op.source).filter(id=>CHAOS_NAME_PARTS[id]);
 const chosen=sources.slice(0,3);if(!chosen.length)return '';
 return chosen.map((id,index)=>{const parts=CHAOS_NAME_PARTS[id];if(index===0)return parts[0];if(index===chosen.length-1)return parts[Math.floor(rng()*parts.length)];return parts[0];}).join('');
}
export function createChaosPool(seed){
 const rng=rngFor(seed^0xc4a05),pick=list=>list[Math.floor(rng()*list.length)];
 const occurrences=Object.entries(CHAOS_SOURCES).flatMap(([source,ids])=>ids.filter(id=>catalogue.has(id)).map(id=>({source,atom:catalogue.get(id)})));
 return Object.fromEntries(SKILL_IDS.map(id=>{
  const ops=Array.from({length:2+Math.floor(rng()*2)},()=>{const entry=pick(occurrences),a=entry.atom;return {op:a.id,target:pick(a.targets),base:a.base,step:a.step,source:entry.source};});
  // 首项不只有代价或无目标苏生；改用实际火球来源以保证名字也跟随真实配方。
  if(ops[0].op==='revive'||ops[0].op==='sacrifice')ops[0]={op:'magic',target:'enemy',base:70,step:1,source:'sklfire'};
  return [id,{version:CHAOS_VERSION,id,name:assembleChaosName(ops,rng),nameSources:ops.map(x=>x.source),icon:pick(SKILL_IDS),ops}];
 }));
}
export function chaosDefinition(run,id){return run?.mode==='chaos'?run.chaosPool?.[id]:null;}
export function chaosProgram(definition,level){
 if(!definition||definition.version!==CHAOS_VERSION)throw Error('混沌卡牌定义缺失或版本不兼容');
 const lv=effectiveSkillLevel(level);
 return {version:CHAOS_VERSION,name:definition.name,ops:definition.ops.map(op=>{if(!catalogue.has(op.op)||!targetNames[op.target])throw Error('未知混沌操作');return {op:op.op,target:op.target,value:Math.max(1,Math.round(op.base+lv*op.step))};})};
}
// 简短卡面直接投影实际操作，不从文案反推效果或暗藏名称语义。
const SHORT_TARGET={enemy:'随机敌人',enemies:'所有敌人',self:'自身',ally:'随机友方',allies:'所有友方',dead_ally:'随机阵亡友方'};
export function chaosOperationText(op){
 const t=SHORT_TARGET[op.target],v=op.value;
 switch(op.op){
  case 'physical':return '对'+t+'造成'+v+'%物理攻击';
  case 'magic':return '对'+t+'造成'+v+'%法术攻击';
  case 'saitama':return '对'+t+'打出'+v+'%物理一拳';
  case 'pure':return '对'+t+'造成'+v+'点直接伤害';
  case 'heal':return '回复'+t+v+'点体力';
  case 'shield':return t+'获得'+v+'点护盾';
  case 'mp':return '回复'+t+v+'点MP（上限100）';
  case 'drain_mp':return t+'失去'+v+'点MP';
  case 'haste':return t+'疾走'+Math.min(4,v)+'次行动（速度×2）';
  case 'slow':return t+'迟缓'+Math.min(4,v)+'次行动（速度减半）';
  case 'ice':return '对'+t+'施加'+Math.min(4,v)+'次冰冻';
  case 'poison':return '使'+t+'中毒，持续4次行动';
  case 'burn':return '对'+t+'叠加'+Math.min(4,v)+'层燃烧';
  case 'curse':return '诅咒'+t+'，保留原生免疫与叠加';
  case 'berserk':return '使'+t+'狂暴1回合（蓄力可延长）';
  case 'charm':return '魅惑'+t+'，沿用原生命中与持续';
  case 'cleanse':return '清除'+t+'的普通负面状态（不含Boss感染）';
  case 'dispel':return '清除'+t+'的正面状态并按原规则扣MP';
  case 'revive':return '以'+v+'点体力复活'+t+'（无可复活目标则跳过）';
  case 'iron':return t+'获得'+v+'点铁壁减伤，持续2次行动';
  case 'max_hp':return t+'本场最大体力与当前体力增加'+v;
  case 'sacrifice':return '自身受到'+v+'点直接伤害';
  case 'execute':return '削去'+t+'当前体力的'+v+'%';
  case 'covid':return '使'+t+'感染新冠（变异'+Math.min(15,v)+'，原生扩散与肺炎）';
  case 'lazy':return '使'+t+'感染怠惰（速度减半，原生发作）';
  case 'pneumonia':return '使'+t+'立即肺炎发作一次（变异'+Math.min(15,v)+'），自身按原规则吸收体力';
  case 'merge':return '按原生规则吞噬'+t+'（不复活）';
  case 'summon':case 'shadow':case 'zombie':case 'clone':return '召唤一个'+({summon:'使魔',shadow:'幻影',zombie:'亡灵',clone:'分身'}[op.op])+'：体力与七围为本体'+v+'%（速度不变，无技能，同根最多8个）';
  default:{const stat={atk_up:'攻击',def_up:'防御',mag_up:'魔力',res_up:'抗性',agi_up:'敏捷',wis_up:'智慧',speed_up:'速度'}[op.op];if(!stat)throw Error('缺少混沌操作描述');return t+'本场'+stat+'增加'+v;}
 }
}
// 能力卡仍按原技能槽位生效；额外效果倍率只乘数值效果，不改变状态次数或感染机制。
export function chaosBattleProgram(definition,level,abilities=[]){
 const program=chaosProgram(definition,level);
 const power=abilityFor(abilities,definition.id).filter(a=>a.effect.kind==='power').reduce((n,a)=>n*a.value,1);
 const scalable=new Set(['physical','magic','pure','heal','shield','mp','drain_mp','atk_up','def_up','mag_up','res_up','agi_up','wis_up','speed_up','iron','max_hp','saitama']);
 return {...program,ops:program.ops.map(op=>({...op,value:scalable.has(op.op)?Math.max(1,Math.min(10000,Math.round(op.value*power))):op.value}))};
}
export function chaosDescription(definition,level){return chaosProgram(definition,level).ops.map(chaosOperationText).join('。')+'。';}
export function chaosSkill(run,skill){const definition=chaosDefinition(run,skill.id);return definition?{...skill,chaos:definition,name:definition.name,icon:definition.icon,description:chaosDescription(definition,skill.lv)}:skill;}
export function chaosSkills(run,skills){return (skills||[]).map(skill=>chaosSkill(run,skill));}

// 每个角色的随机槽位在首次获得时锁定；删除或转移记录绝不从天然技能重新生成。
export function ensureChaosSkills(state,card,natural=[]){
 if(state.run?.mode!=='chaos')return null;
 state.run.chaosPool||=createChaosPool(state.run.seed);
 if(!card.chaosBase){const rng=rngFor(chaosSeed(state.run.seed+':'+card.id)),ids=[...SKILL_IDS];const count=Math.max(3,natural.length||3);card.chaosBase={};
  for(let i=0;i<Math.min(count,10);i++){const id=ids.splice(Math.floor(rng()*ids.length),1)[0];card.chaosBase[id]=Math.max(1,natural[i]?.lv||8+Math.floor(rng()*18));}
 }
 const levels={...card.chaosBase};
 for(const entry of state.run.forged||[])if(entry.charId===card.id)levels[entry.skillId]=(levels[entry.skillId]||0)+entry.lv;
 for(const [id,training] of Object.entries(card.skillTraining||{}))levels[id]=(levels[id]||0)+(training.gain||0);
 return Object.entries(levels).filter(([id,lv])=>lv>0&&!card.lostSkills?.[id]).map(([id,lv])=>({...chaosSkill(state.run,{id,lv,cat:SKILLS[id]?.cat||'atk',mpMul:card.skillTraining?.[id]?.mpMul||1,forge:card.skillTraining?.[id]?.count||0}),forges:(Object.hasOwn(card.chaosBase,id)?1:0)+(state.run.forged||[]).filter(f=>f.charId===card.id&&f.skillId===id).length,playerShadow:true,playerDisperse:true}));
}
export function moveChaosSkill(state,fromId,skillId,toId=null){
 if(state.run?.mode!=='chaos'||state.run.status!=='active'||state.run.chaosBattleActive)return false;
 const from=state.collection.find(c=>c.id===fromId),to=toId?state.collection.find(c=>c.id===toId):null;
 if(!from||from===to||toId&&!to||state.run.downed?.includes(fromId)||toId&&state.run.downed?.includes(toId))return false;
 const skill=from.skillList.find(s=>s.id===skillId);if(!skill)return false;
 const previous=to?.skillList.find(s=>s.id===skillId),level=Math.max(skill.lv,previous?.lv||0);
 const remove=(card)=>{delete card.chaosBase[skillId];if(card.skillTraining)delete card.skillTraining[skillId];state.run.forged=(state.run.forged||[]).filter(f=>!(f.charId===card.id&&f.skillId===skillId));card.skillList=card.skillList.filter(s=>s.id!==skillId);};
 remove(from);if(to){to.chaosBase||={};remove(to);delete (to.lostSkills||{})[skillId];to.chaosBase[skillId]=level;to.skillList=ensureChaosSkills(state,to,[]);}
 return true;
}
