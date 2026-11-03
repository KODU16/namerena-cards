// 玩家稀有技能的获取、武器和展示规则集中维护；天梯敌人的天然技能不受此限制。
import {effectiveSkillLevel} from './skills.js';
export const RARE_SKILLS = {
  skldisperse: {tag:'playerDisperse',weaponLimit:1,offerMax:2,price:4500,curseStat:50,curseSkill:70},
  sklshadow: {tag:'playerShadow',weaponLimit:5,offerMax:5,price:3500,curseStat:50,curseSkill:70},
};
export const isRareSkill = id => !!RARE_SKILLS[id];
export const hasRareSource = skill => !isRareSkill(skill.id)||!!(skill.fromWeapon||skill[RARE_SKILLS[skill.id].tag]);
export const playerSkillLevel = skill => Math.min(effectiveSkillLevel(skill.lv),skill.id==='sklshadow'?5:106);
export const shownSkillLevel = skill => skill.id==='sklshadow'&&(skill.playerRestricted||skill.playerShadow)?playerSkillLevel(skill):effectiveSkillLevel(skill.lv);
export const isTacticEnabled = tactic => !!tactic&&!tactic.disabled&&tactic.id!=='t-shadow'&&!Object.hasOwn(tactic.apply?.skills||{},'sklshadow');
