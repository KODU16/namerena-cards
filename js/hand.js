// 单人对决和服务器大逃杀共用抽牌、费用与合法性，避免超时托管另算一套牌。
import { effectiveSkillLevel } from './skills.js';
import { hasRareSource, playerSkillLevel } from './rare-skills.js';

export const ACTIVE_ID = {
  sklfire:0, sklice:1, sklthunder:2, sklquake:3, sklabsorb:4, sklpoison:5,
  sklrapid:6, sklcritical:7, sklhalf:8, sklexchange:9, sklberserk:10,
  sklcharm:11, sklhaste:12, sklslow:13, sklcurse:14, sklheal:15,
  sklrevive:16, skldisperse:17, skliron:18, sklcharge:19,
  sklaccumulate:20, sklassassinate:21, sklsummon:22, sklclone:23, sklshadow:24,
};
export const NORMAL_ID = 255;
export const rollMpCost = rng => 8 + (Math.floor(rng() * 256) & 15);
export function canPlayHandCard(card, mp) {
  return card.id === 'normal' || (ACTIVE_ID[card.id] != null && Number.isFinite(mp) && (card.cost || 0) <= mp);
}
export function drawHand(skills, rng, count = 3, exclude = null) {
  const pool = (skills || []).filter(s => ACTIVE_ID[s.id] != null && hasRareSource(s))
    .filter(s => !exclude?.has(s.id))
    .map(s => ({...s, weight:1 + effectiveSkillLevel(playerSkillLevel(s)) / 6}));
  const out = [];
  while (out.length < count && pool.length) {
    let x = rng() * pool.reduce((n,s) => n + s.weight, 0), i = 0;
    for (; i < pool.length; i++) { x -= pool[i].weight; if (x <= 0) break; }
    const [s] = pool.splice(Math.min(i, pool.length - 1), 1);
    out.push({id:s.id, lv:playerSkillLevel(s), cost:Math.max(1,Math.round(rollMpCost(rng) * (s.mpMul || 1)))});
  }
  return out;
}
