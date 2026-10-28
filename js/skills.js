// 技能元数据：名称/分类/一句话说明。数值实现见 combat.js。
// 技能 id 与 tswn_core 的 ol overlay 完全一致（0..34）。

export const CAT = {
  atk: { key: 'atk', name: '攻击', color: '#ff7a5c' },
  magic: { key: 'magic', name: '法术', color: '#7aa2ff' },
  ctrl: { key: 'ctrl', name: '控制', color: '#c58bff' },
  heal: { key: 'heal', name: '回复', color: '#63d68b' },
  def: { key: 'def', name: '守御', color: '#e2c06a' },
  summon: { key: 'summon', name: '召唤', color: '#5fd3c8' },
};

export const SKILLS = {
  sklfire: { name: '火球术', cat: 'magic', glyph: '火', desc: '造成法术伤害，并附加 3 回合灼烧。' },
  sklice: { name: '冰冻术', cat: 'magic', glyph: '冰', desc: '造成法术伤害，并让目标冻结、跳过下一次行动。' },
  sklthunder: { name: '雷击术', cat: 'magic', glyph: '雷', desc: '高倍率雷击，但有几率被闪避。' },
  sklquake: { name: '地裂术', cat: 'atk', glyph: '裂', desc: '对敌方全体造成物理伤害。' },
  sklabsorb: { name: '吸血', cat: 'atk', glyph: '吸', desc: '造成物理伤害，并回复其中 60% 的体力。' },
  sklpoison: { name: '投毒', cat: 'ctrl', glyph: '毒', desc: '造成少量伤害，并叠加持续掉血的中毒。' },
  sklrapid: { name: '连击', cat: 'atk', glyph: '连', desc: '连续攻击 2~3 次，单次伤害较低。' },
  sklcritical: { name: '会心一击', cat: 'atk', glyph: '会', desc: '高倍率一击，暴击率更高。' },
  sklhalf: { name: '瘟疫', cat: 'ctrl', glyph: '疫', desc: '直接削减目标当前体力的一部分。' },
  sklexchange: { name: '生命之轮', cat: 'ctrl', glyph: '轮', desc: '与目标交换体力百分比（每场一次）。' },
  sklberserk: { name: '狂暴术', cat: 'atk', glyph: '狂', desc: '攻击目标；命中后使其陷入狂暴：之后每个行动只能打出 1.2 倍普通攻击，持续 1 回合（自身在蓄力时 +1）。' },
  sklcharm: { name: '魅惑', cat: 'ctrl', glyph: '魅', desc: '让目标转而攻击自己，持续 1 回合。' },
  sklhaste: { name: '加速术', cat: 'def', glyph: '速', desc: '速度上升，更容易抢到先手。' },
  sklslow: { name: '减速术', cat: 'ctrl', glyph: '缓', desc: '降低目标速度。' },
  sklcurse: { name: '诅咒', cat: 'ctrl', glyph: '咒', desc: '目标受到的伤害提高 25%。' },
  sklheal: { name: '治愈魔法', cat: 'heal', glyph: '愈', desc: '回复体力，等级越高回复越多。' },
  sklrevive: { name: '苏生术', cat: 'heal', glyph: '生', desc: '预设苏生：3 回合内阵亡时以 40% 体力复活。' },
  skldisperse: { name: '净化', cat: 'heal', glyph: '净', desc: '清除自身负面状态并回复少量体力。' },
  skliron: { name: '铁壁', cat: 'def', glyph: '壁', desc: '防御大幅上升，持续 2 回合。' },
  sklcharge: { name: '蓄力', cat: 'atk', glyph: '蓄', desc: '蓄力：下一次攻击伤害翻倍以上。' },
  sklaccumulate: { name: '聚气', cat: 'atk', glyph: '聚', desc: '每次使用永久提高自身攻击。' },
  sklassassinate: { name: '背刺', cat: 'ctrl', glyph: '背', desc: '先后进入潜行再伺机背刺：潜行提高闪避，背刺造成高额伤害；也可能被识破。' },
  sklsummon: { name: '血祭', cat: 'summon', glyph: '祭', desc: '召唤一只使魔，替你攻击。' },
  sklclone: { name: '分身', cat: 'summon', glyph: '分', desc: '制造一个分身，拥有本体五成属性。' },
  sklshadow: { name: '幻术', cat: 'summon', glyph: '幻', desc: '召唤幻影，属性较低但会吸引火力。' },
  skldefend: { name: '防御', cat: 'def', glyph: '防', desc: '进入防御姿态，本回合大幅减伤。' },
  sklprotect: { name: '守护', cat: 'def', glyph: '护', desc: '展开守护，2 回合内受到的伤害降低。' },
  sklreflect: { name: '伤害反弹', cat: 'def', glyph: '反', desc: '2 回合内将受到伤害的一部分反弹回去。' },
  sklreraise: { name: '护身符', cat: 'def', glyph: '符', desc: '抵挡一次致命伤害，保留 1 点体力。' },
  sklshield: { name: '蓄盾', cat: 'def', glyph: '盾', desc: '获得一层可吸收伤害的护盾。' },
  sklcounter: { name: '反击', cat: 'def', glyph: '击', desc: '受到攻击时反击对手，持续 2 回合。' },
  sklmerge: { name: '吞噬', cat: 'atk', glyph: '吞', desc: '重击目标；若因此击杀则永久提升属性。' },
  sklzombie: { name: '召唤亡灵', cat: 'summon', glyph: '尸', desc: '召唤一只丧尸，攻击力尚可但很脆。' },
  sklupgrade: { name: '垂死抗争', cat: 'atk', glyph: '垂', desc: '体力低于 30% 时全属性上升，持续 2 回合。' },
  sklhide: { name: '隐匿', cat: 'ctrl', glyph: '隐', desc: '闪避大幅上升，持续 2 回合。' },
  sklexplode: { name: '自爆', cat: 'atk', glyph: '爆', desc: '牺牲自身对敌方造成大范围伤害。' },
  sklpossess: { name: '附体', cat: 'ctrl', glyph: '附', desc: '附身目标，扰乱其行动。' },
};

export const SKILL_IDS = Object.keys(SKILLS);

// 兼容引擎写法：core.skill.assassinate / sklassassinate / Assassinate → sklassassinate
export function normalizeSkillId(id) {
  if (!id) return '';
  let key = String(id).trim();
  if (key.toLowerCase().startsWith('core.skill.')) key = 'skl' + key.slice('core.skill.'.length);
  key = key.toLowerCase();
  if (SKILLS[key]) return key;
  if (!key.startsWith('skl')) key = 'skl' + key;
  if (SKILLS[key]) return key;
  return key;
}

export function skillMeta(id) {
  const key = normalizeSkillId(id);
  return SKILLS[key] || { name: key.replace(/^skl/, ''), cat: 'atk', glyph: '?', desc: '' };
}

// 把 ol overlay 里的技能值转成生效等级："40+30" → 70，"2*46" → 92
export function levelOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.includes('*')) { const [a, b] = v.split('*').map(Number); return a * b; }
  if (typeof v === 'string' && v.includes('+')) { const [a, b] = v.split('+').map(Number); return a + b; }
  return Number(v) || 0;
}
