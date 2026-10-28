// tswn_wasm 的薄封装：名字 → 卡牌（八围 / 技能 / 头像）。
// 所有数值都来自 tswn_core 的构建结果，前端只负责把它们整理成卡面。
import initWasm, * as wasm from '../vendor/tswn_wasm_duel/tswn_wasm.js';
import { levelOf, SKILLS } from './skills.js';

let ready = false;
let versions = { wasm: '?', core: '?' };

export async function loadEngine() {
  if (ready) return versions;
  await initWasm();
  versions = { wasm: wasm.version(), core: wasm.core_version() };
  ready = true;
  return versions;
}

export function engineReady() { return ready; }
export function engineWasm() { return wasm; }
export function engineVersions() { return versions; }

const iconCache = new Map();

export function iconFor(name, clan) {
  const key = `${name}@${clan}`;
  if (iconCache.has(key)) return iconCache.get(key);
  let url = '';
  try { url = wasm.name_to_png_base64(key); } catch { url = ''; }
  iconCache.set(key, url);
  return url;
}

// ol.attrs 的编码：前七围 = 内部值 + 36，速度实际是 attrs[2] + 124（含 160 基础速度），体力原样。
function decodeStats(attrs) {
  return {
    // overlay attrs 就是展示页看到的数值，直接用
    atk: Math.max(0, attrs[0]),
    def: Math.max(0, attrs[1]),
    spd: Math.max(0, attrs[2]),
    agi: Math.max(0, attrs[3]),
    mag: Math.max(0, attrs[4]),
    res: Math.max(0, attrs[5]),
    wis: Math.max(0, attrs[6]),
    hp: Math.max(1, attrs[7]),
  };
}

/**
 * 用名字生成一张卡。
 * @param {string} name 名字本体（不含 @阵营）
 * @param {string} clan 阵营
 */
// 带武器的属性线：用引擎的 name+weapon@clan 构建，只取 attrs
export function statsWithWeapon(name, clan, weapon) {
  if (!ready || !weapon) return null;
  try {
    const diy = wasm.to_diy(name + '+' + weapon + '@' + clan);
    const at = diy.indexOf('ol:');
    if (at < 0) return null;
    const ol = JSON.parse(diy.slice(at + 3));
    return decodeStats(ol.attrs);
  } catch { return null; }
}

// 带武器的完整构建（属性 + 技能）
export function buildWithWeapon(name, clan, weapon) {
  if (!ready || !weapon) return null;
  try {
    const diy = wasm.to_diy(name + '+' + weapon + '@' + clan);
    const at = diy.indexOf('ol:');
    if (at < 0) return null;
    const ol = JSON.parse(diy.slice(at + 3));
    const skills = Object.entries(ol.skills || {})
      .map(([id, v]) => ({ id, lv: Math.round(levelOf(v)) }))
      .filter((s) => SKILLS[s.id] && s.lv > 0);
    return { stats: decodeStats(ol.attrs), skills };
  } catch { return null; }
}

export function makeCard(name, clan = '无名') {
  if (!ready) throw new Error('引擎尚未加载');
  const key = `${name}@${clan}`;
  const diy = wasm.to_diy(key);
  const at = diy.indexOf('ol:');
  const ol = JSON.parse(diy.slice(at + 3));
  const stats = decodeStats(ol.attrs);
  const skillList = Object.entries(ol.skills || {})
    .map(([id, v]) => ({ id, lv: Math.round(levelOf(v)), cat: SKILLS[id]?.cat || 'atk' }))
    .filter((s) => SKILLS[s.id] && s.lv > 0)
    .sort((a, b) => b.lv - a.lv);
  return {
    id: key,
    name,
    clan,
    stats,
    skillList,
    icon: iconFor(name, clan),
    flavor: '',
    custom: true,
  };
}

// 卡池里的卡直接读预生成的 JSON；自定义名字走 makeCard。
export function hydrateCard(raw) {
  return {
    ...raw,
    skillList: (raw.skillList || []).map((s) => ({ ...s, cat: s.cat || SKILLS[s.id]?.cat || 'atk' })),
  };
}

export function buildLine(card) {
  // 仅用于调试/导出：把卡还原成引擎可读的 ol 行
  // 前七围在 overlay 里是 0..255 的写法：超界会被引擎截断/回绕（速度尤其明显），必须夹紧
  const clampAttr = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const attrs = [
    clampAttr(card.stats.atk), clampAttr(card.stats.def), clampAttr(card.stats.spd), clampAttr(card.stats.agi),
    clampAttr(card.stats.mag), clampAttr(card.stats.res), clampAttr(card.stats.wis), Math.max(1, Math.round(card.stats.hp)),
  ];
  const skills = Object.fromEntries(card.skillList.map((s) => [s.id, s.lv]));
  return `${card.name}@${card.clan}+ol:${JSON.stringify({ attrs, skills, name_factor_enabled: false })}`;
}

// 战术卡：直接叠加在引擎给出的属性与技能等级上
export function applyTactics(card, tactics) {
  if (!tactics || !tactics.length) return card;
  const stats = { ...card.stats };
  const skills = new Map((card.skillList || []).map((s) => [s.id, s.lv]));
  for (const t of tactics) {
    for (const [k, v] of Object.entries(t.apply?.attrs || {})) stats[k] = (stats[k] || 0) + v;
    for (const [k, v] of Object.entries(t.apply?.skills || {})) skills.set(k, (skills.get(k) || 0) + v);
  }
  return {
    ...card,
    stats,
    skillList: [...skills.entries()].map(([id, lv]) => ({ id, lv, cat: card.skillList?.find((s) => s.id === id)?.cat })),
  };
}
// 开局保底：全属性 × 倍率（每过一局 -0.1，最低 1.0）
export function applyRunBuff(card, mult) {
  if (!card || Math.abs(mult - 1) < 1e-6) return card;
  const s = card.stats;
  const scale = (v) => Math.max(1, Math.round(v * mult));
  return {
    ...card,
    stats: {
      hp: scale(s.hp), atk: scale(s.atk), def: scale(s.def), spd: scale(s.spd),
      agi: scale(s.agi), mag: scale(s.mag), res: scale(s.res), wis: scale(s.wis),
    },
  };
}

export function runMultiplier(index) {
  return Math.max(1, 2 - 0.1 * index);
}