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
  sklfire: { name: '火球术', cat: 'magic', glyph: '火', desc: '造成 1.5 倍于魔力的法术伤害（目标身上每层灼烧再抬高这个倍率），并附加 3 回合灼烧。' },
  sklice: { name: '冰冻术', cat: 'magic', glyph: '冰', desc: '造成 0.7 倍于魔力的法术伤害，并让目标冻结、跳过下一次行动。' },
  sklthunder: { name: '雷击术', cat: 'magic', glyph: '雷', desc: '连打 3~5 段，每段 0.36 倍于魔力的法术伤害；每段都可能被闪避，命中率逐段下降。' },
  sklquake: { name: '地裂术', cat: 'atk', glyph: '裂', desc: '打 4~5 个敌人，倍率随人数摊薄：约为攻击力口径除以（目标数 + 0.6）的物理伤害。' },
  sklabsorb: { name: '吸血', cat: 'atk', glyph: '吸', desc: '造成 1.3 倍于魔力的法术伤害，并把伤害的一部分吸回自身体力。' },
  sklpoison: { name: '投毒', cat: 'ctrl', glyph: '毒', desc: '造成 1 倍于魔力的法术伤害，并让目标中毒、持续掉血。' },
  sklrapid: { name: '连击', cat: 'atk', glyph: '连', desc: '连打 2~3 段，每段依次是 0.75、0.6、0.45 倍于攻击力的物理伤害。' },
  sklcritical: { name: '会心一击', cat: 'atk', glyph: '会', desc: '掷三段 1.15 / 1.2 / 1.25 倍于攻击力的物理伤害，取最高的一段结算。' },
  sklhalf: { name: '瘟疫', cat: 'ctrl', glyph: '疫', desc: '按比例直接削减目标当前体力，比例由双方魔力与抗性决定。' },
  sklexchange: { name: '生命之轮', cat: 'ctrl', glyph: '轮', desc: '与目标交换体力百分比（每场一次）。' },
  sklberserk: { name: '狂暴术', cat: 'atk', glyph: '狂', desc: '造成 1 倍于魔力的法术伤害；命中后目标进入狂暴，之后每次行动只能打出 1.2 倍普攻，持续 1 回合（自身蓄力时 +1）。' },
  sklcharm: { name: '魅惑', cat: 'ctrl', glyph: '魅', desc: '让目标转而攻击自己人，持续 1 回合。' },
  sklhaste: { name: '加速术', cat: 'def', glyph: '速', desc: '自身行动条直接加上一份速度，目标获得疾走：速度提高、更容易抢到先手。' },
  sklslow: { name: '减速术', cat: 'ctrl', glyph: '缓', desc: '降低目标速度，让它更晚行动。' },
  sklcurse: { name: '诅咒', cat: 'ctrl', glyph: '咒', desc: '造成 1 倍于魔力的法术伤害，并让目标受到的伤害提高 25%。' },
  sklheal: { name: '治愈魔法', cat: 'heal', glyph: '愈', desc: '回复体力，量约等于同魔力普攻的两倍，不看对方防御，等级越高越多。' },
  sklrevive: { name: '苏生术', cat: 'heal', glyph: '生', desc: '预设苏生：阵亡时立刻复活，体力约为治愈量的八成。' },
  skldisperse: { name: '净化', cat: 'heal', glyph: '净', desc: '打掉目标身上的增益并造成伤害，清除自身负面。' },
  skliron: { name: '铁壁', cat: 'def', glyph: '壁', desc: '获得 110 + 魔力 的减伤值，持续 3 回合；自身在蓄力时改为 240 + 4×魔力。' },
  sklcharge: { name: '蓄力', cat: 'atk', glyph: '蓄', desc: '进入蓄力：下一次攻击按 3 倍结算，同时回复 32 点 MP。' },
  sklaccumulate: { name: '聚气', cat: 'atk', glyph: '聚', desc: '永久提高自身攻击力，每次使用都会再涨一截。' },
  sklassassinate: { name: '背刺', cat: 'ctrl', glyph: '背', desc: '潜行后绕到目标身后发动背刺，造成高倍率物理伤害；潜行也可能被识破。' },
  sklsummon: { name: '血祭', cat: 'summon', glyph: '祭', desc: '召唤一只使魔，替你攻击；每个角色只能有 1 只。' },
  sklclone: { name: '分身', cat: 'summon', glyph: '分', desc: '制造一个分身，属性按本体折算，可以替你出手。' },
  sklshadow: { name: '幻术', cat: 'summon', glyph: '幻', desc: '召唤一个幻影，属性偏低，但会替你吸引火力。' },
  skldefend: { name: '防御', cat: 'def', glyph: '防', desc: '进入防御姿态，本回合大幅减伤。' },
  sklprotect: { name: '守护', cat: 'def', glyph: '护', desc: '守护一名队友，替他分担受到的伤害，持续 2 回合。' },
  sklreflect: { name: '伤害反弹', cat: 'def', glyph: '反', desc: '2 回合内把受到伤害的一部分反弹给攻击者。' },
  sklreraise: { name: '护身符', cat: 'def', glyph: '符', desc: '抵挡一次致命伤害，保留 1 点体力。' },
  sklshield: { name: '蓄盾', cat: 'def', glyph: '盾', desc: '获得一层吸收伤害的护盾，护盾量随熟练度增长。' },
  sklcounter: { name: '反击', cat: 'def', glyph: '击', desc: '受到攻击时按智慧判定是否反击，持续 2 回合。' },
  sklmerge: { name: '吞噬', cat: 'def', glyph: '吞', desc: '被动：自己击杀目标时吞噬它，按固定槽位继承对方的属性与技能等级。' },
  sklzombie: { name: '召唤亡灵', cat: 'summon', glyph: '尸', desc: '召唤一只丧尸替你攻击，攻击力尚可但很脆。' },
  sklupgrade: { name: '垂死抗争', cat: 'atk', glyph: '垂', desc: '受重创时全属性上升一截，持续 2 回合。' },
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
