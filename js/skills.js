// 技能说明以 deepmess 技能页为统一表述口径；净化按尖塔指定说明，额外技能参照 tswn 实现。
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
  sklfire: { name: '火球术', cat: 'magic', glyph: '火', desc: "造成137%魔法攻击；同一目标每再次受到火系伤害，伤害增加25%。" },
  sklice: { name: '冰冻术', cat: 'magic', glyph: '冰', desc: "造成70%魔法攻击，命中后冰冻目标半回合。" },
  sklthunder: { name: '雷击术', cat: 'magic', glyph: '雷', desc: "对同一目标连续进行3至6次魔法攻击，每次为35%魔攻。" },
  sklquake: { name: '地裂术', cat: 'atk', glyph: '裂', desc: "对1至5个目标造成合计140%至200%魔法攻击；目标越多，单体伤害越低、总伤害越高。" },
  sklabsorb: { name: '吸血', cat: 'atk', glyph: '吸', desc: "造成115%魔法攻击，命中后回复自身相当于所造成伤害一半的体力。" },
  sklpoison: { name: '投毒', cat: 'ctrl', glyph: '毒', desc: "造成90%魔法攻击，命中后使目标中毒，之后每回合损失体力。" },
  sklrapid: { name: '连击', cat: 'atk', glyph: '连', desc: "连续攻击2至3次，第一次为75%物攻，对同一目标的后续攻击每次降低15个百分点。" },
  sklcritical: { name: '会心一击', cat: 'atk', glyph: '会', desc: "造成145%物理攻击，伤害随机性较低，输出更稳定。" },
  sklhalf: { name: '瘟疫', cat: 'ctrl', glyph: '疫', desc: "按比例削减目标当前体力，减少50%至99%。" },
  sklexchange: { name: '生命之轮', cat: 'ctrl', glyph: '轮', desc: "与目标交换当前体力值。" },
  sklberserk: { name: '狂暴术', cat: 'atk', glyph: '狂', desc: "造成80%魔法攻击，命中后使目标狂暴，下回合只能进行不分敌我的狂暴攻击。" },
  sklcharm: { name: '魅惑', cat: 'ctrl', glyph: '魅', desc: "命中后魅惑目标，使其下回合行动将施法者视为队友。" },
  sklhaste: { name: '加速术', cat: 'def', glyph: '速', desc: "使自己或一名队友速度加倍，持续3回合。" },
  sklslow: { name: '减速术', cat: 'ctrl', glyph: '缓', desc: "使目标速度减半，持续2回合。" },
  sklcurse: { name: '诅咒', cat: 'ctrl', glyph: '咒', desc: "造成100%魔法攻击，命中后诅咒目标，使其之后受到攻击时有概率承受双倍伤害。" },
  sklheal: { name: '治愈魔法', cat: 'heal', glyph: '愈', desc: "回复自己或一名队友的体力，并去除其异常状态。" },
  sklrevive: { name: '苏生术', cat: 'heal', glyph: '生', desc: "复活一名被击倒的队友。" },
  skldisperse: { name: '净化', cat: 'heal', glyph: '净', desc: "必定命中，造成100%魔法攻击，命中后对方MP−64，同时去除目标身上所有有益效果，对召唤兽伤害加倍。" },
  skliron: { name: '铁壁', cat: 'def', glyph: '壁', desc: "使自身防御大幅提高，持续2回合。" },
  sklcharge: { name: '蓄力', cat: 'atk', glyph: '蓄', desc: "进入蓄力，下回合结束前伤害提升至300%，同时强化各种主动技能的特殊效果。" },
  sklaccumulate: { name: '聚气', cat: 'atk', glyph: '聚', desc: "使自身攻击力提高60%。" },
  sklassassinate: { name: '背刺', cat: 'ctrl', glyph: '背', desc: "耗费2回合：第一回合潜行，第二回合背刺，造成500%魔法攻击；中途受伤会打断潜行。" },
  sklsummon: { name: '血祭', cat: 'summon', glyph: '祭', desc: "召唤使魔为自己战斗；使魔受到伤害时，施法者连带受到50%的伤害。" },
  sklclone: { name: '分身', cat: 'summon', glyph: '分', desc: "将自身分成2人；分身后属性下降，技能保持不变。" },
  sklshadow: { name: '幻术', cat: 'summon', glyph: '幻', desc: "召唤体力较低的幻影，幻影在2回合后开始行动。" },
  skldefend: { name: '防御', cat: 'def', glyph: '防', desc: "受到伤害时有概率发动防御，使本次伤害减半，不占用行动回合。" },
  sklprotect: { name: '守护', cat: 'def', glyph: '护', desc: "队友受到攻击时有概率发动守护，代替队友承受伤害，并使伤害减半，不占用行动回合。" },
  sklreflect: { name: '伤害反弹', cat: 'def', glyph: '反', desc: "受到攻击时有概率发动，将伤害反弹给施法者，不占用行动回合。" },
  sklreraise: { name: '护身符', cat: 'def', glyph: '符', desc: "被击倒时有概率复活自己，并恢复少量体力，不占用行动回合。" },
  sklshield: { name: '蓄盾', cat: 'def', glyph: '盾', desc: "每回合恢复少量护盾，护盾在受到伤害时抵消一部分伤害。" },
  sklcounter: { name: '反击', cat: 'def', glyph: '击', desc: "受到伤害时有概率发动反击，在回合结束后向攻击者进行物理攻击。" },
  sklmerge: { name: '吞噬', cat: 'def', glyph: '吞', desc: "击倒目标时有概率吞噬其尸体，提高自身属性，并获得目标的技能。" },
  sklzombie: { name: '召唤亡灵', cat: 'summon', glyph: '尸', desc: "击倒目标时有概率将其尸体变为丧尸，为自己战斗。" },
  sklupgrade: { name: '垂死抗争', cat: 'atk', glyph: '垂', desc: "受到伤害且剩余体力极少时发动，使所有属性上升。" },
  sklhide: { name: '隐匿', cat: 'ctrl', glyph: '隐', desc: "被动降低自身被选为攻击目标的概率；熟练度超过63时额外提高敏捷、防御和抗性。" },
  sklexplode: { name: '自爆', cat: 'atk', glyph: '爆', desc: "牺牲自身，对目标造成魔法伤害，并触发火系伤害的附带效果。" },
  sklpossess: { name: '附体', cat: 'ctrl', glyph: '附', desc: "牺牲自身附体目标，命中后使其进入狂暴状态。" },
};

export const SKILL_IDS = Object.keys(SKILLS);

// 原始熟练度可继续叠加并存档；只在展示、概率和战斗计算边界取有效值。
export const EFFECTIVE_SKILL_LIMIT = 106;
export function effectiveSkillLevel(value) {
  const level = Number(value);
  return Number.isFinite(level) ? Math.max(0, Math.min(EFFECTIVE_SKILL_LIMIT, Math.round(level))) : 0;
}

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
