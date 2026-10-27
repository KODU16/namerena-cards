// 卡池生成器：用官方 tswn_wasm 把「名字」编译成卡牌，并跑 1v1 循环赛给费用分档。
// 用法：node tools/build-cards.mjs [wasmPkgDir]
// 输出：data/cards.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'vendor', 'tswn_wasm');

const mod = await import(pathToFileURL(path.join(pkgDir, 'tswn_wasm.js')).href);
mod.initSync({ module: readFileSync(path.join(pkgDir, 'tswn_wasm_bg.wasm')) });
console.log('wasm', mod.version(), 'core', mod.core_version());

// 角色名 + 阵营 + 一句风味文案。名字决定一切数值，阵营只做展示与羁绊。
const ROSTER = [
  ['一剑霜寒', '赤', '剑未出鞘，霜已满襟。'],
  ['火中取栗', '赤', '手快有，手慢烫。'],
  ['铁马冰河', '赤', '梦里也是冲锋号。'],
  ['半城烟沙', '赤', '兵临城下，先点一支。'],
  ['打工人', '赤', '工位即战场，咖啡即军粮。'],
  ['甲方爸爸', '赤', '这个需求很简单。'],
  ['熬夜冠军', '赤', '见过凌晨四点的服务器。'],
  ['frank', '赤', '老实人发起火来。'],
  ['dave', '赤', '稳，但只稳三秒。'],
  ['烈焰红唇', '赤', '一吻灼心。'],

  ['林深见鹿', '青', '雾里有鹿，也有坑。'],
  ['白露为霜', '青', '蒹葭苍苍，伤害凉凉。'],
  ['青灯古佛', '青', '念经也是输出。'],
  ['明月几时有', '青', '举杯问天，天不应。'],
  ['赛博佛祖', '青', '电子功德，实时结算。'],
  ['电子木鱼', '青', '敲一下，加一点。'],
  ['咕咕咕', '青', '说好今天，就是不说哪天。'],
  ['alice', '青', '标准测试角色，别小看。'],
  ['grace', '青', '优雅地把你送走。'],
  ['heidi', '青', '山里来的，不讲道理。'],

  ['孤舟蓑笠翁', '玄', '独钓一江寒雪。'],
  ['长夜未央', '玄', '夜还长，慢慢玩。'],
  ['大雪满弓刀', '玄', '弓拉满，雪也满。'],
  ['神秘代码', '玄', '能跑就别动。'],
  ['退堂鼓手', '玄', '开打前先撤。'],
  ['摸鱼大师', '玄', '上班摸鱼，摸出境界。'],
  ['复读机', '玄', '你说什么，我说什么。'],
  ['mallory', '玄', '专业捣乱二十年。'],
  ['oscar', '玄', '奖杯自己带。'],
  ['sybil', '玄', '她有很多个她。'],

  ['星垂平野', '白', '原野尽头是星星。'],
  ['春风不度', '白', '玉门关外，风也懒。'],
  ['山河故人', '白', '山河还在，故人已老。'],
  ['落霞孤鹜', '白', '一起飞，一起落。'],
  ['早八人', '白', '早八，是一种信仰。'],
  ['柠檬精', '白', '酸，但强。'],
  ['ivan', '白', '看起来很能打。'],
  ['judy', '白', '温柔一刀。'],
  ['peggy', '白', '账都记着呢。'],
  ['trent', '白', '新来的，狠角色。'],
];

const SKILL_NAMES = {
  sklfire: '火球术', sklice: '冰冻术', sklthunder: '雷击术', sklquake: '地裂术',
  sklabsorb: '吸血', sklpoison: '投毒', sklrapid: '连击', sklcritical: '会心一击',
  sklhalf: '瘟疫', sklexchange: '生命之轮', sklberserk: '狂暴术', sklcharm: '魅惑',
  sklhaste: '加速术', sklslow: '减速术', sklcurse: '诅咒', sklheal: '治愈魔法',
  sklrevive: '苏生术', skldisperse: '净化', skliron: '铁壁', sklcharge: '蓄力',
  sklaccumulate: '聚气', sklassassinate: '潜行', sklsummon: '血祭', sklclone: '分身',
  sklshadow: '幻术', skldefend: '防御', sklprotect: '守护', sklreflect: '伤害反弹',
  sklreraise: '护身符', sklshield: '蓄盾', sklcounter: '反击', sklmerge: '吞噬',
  sklzombie: '召唤亡灵', sklupgrade: '垂死抗争', sklhide: '隐匿',
};

// 技能生效等级："40+30" = 70；"2*46" = 92
function levelOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.includes('*')) { const [a, b] = v.split('*').map(Number); return a * b; }
  if (typeof v === 'string' && v.includes('+')) { const [a, b] = v.split('+').map(Number); return a + b; }
  return Number(v) || 0;
}

function cardLine(name, clan, ol) {
  const clone = { ...ol, name_factor_enabled: false };
  return `${name}@${clan}+ol:` + JSON.stringify(clone);
}

function decode(attrs) {
  // 前七围文本编码为「内部值 + 36」；速度另有 160 的基础值，这里以实测值为准，仅作兜底。
  return {
    atk: Math.max(0, attrs[0] - 36), def: Math.max(0, attrs[1] - 36),
    spd: Math.max(0, attrs[2] + 124), agi: Math.max(0, attrs[3] - 36),
    mag: Math.max(0, attrs[4] - 36), res: Math.max(0, attrs[5] - 36),
    wis: Math.max(0, attrs[6] - 36), hp: attrs[7],
  };
}

const cards = [];
for (const [name, clan, flavor] of ROSTER) {
  const diy = mod.to_diy(`${name}@${clan}`);
  const ol = JSON.parse(diy.slice(diy.indexOf('ol:') + 3));
  const line = cardLine(name, clan, ol);
  const rep = mod.battle_replay(line + '\n木桩@test', { max_rounds: 20000 });
  const st = rep.initial_states.find(s => s.id_name === name) || rep.initial_states[0];
  const dec = decode(ol.attrs);
  if (dec.hp !== st.max_hp || dec.spd !== st.speed) throw new Error(`stat mismatch ${name}: ${JSON.stringify(dec)} vs ${st.speed}`);
  cards.push({
    id: name, name, clan, flavor,
    attrs: ol.attrs,
    stats: {
      atk: st.attack, def: st.defense, spd: st.speed, agi: st.agility,
      mag: st.magic, res: st.resistance, wis: st.wisdom, hp: st.max_hp,
    },
    skills: ol.skills || {},
    icon: mod.name_to_png_base64(`${name}@${clan}`),
    line,
  });
}
console.log('cards built', cards.length);

// —— 循环赛：每对打两局（换边），固定 seed，统计 1v1 胜率
const wins = new Map(cards.map(c => [c.id, 0]));
const games = new Map(cards.map(c => [c.id, 0]));
const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
for (let i = 0; i < cards.length; i++) {
  for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    for (const [x, y] of [[a, b], [b, a]]) {
      const rep = mod.battle_replay(`${x.line}\n${y.line}\nseed:rr-${x.id}-${y.id}@!`, { max_rounds: 20000 });
      const teamOf = new Map(rep.initial_states.map(s => [s.id, s.team_index]));
      const xTeam = rep.initial_states.find(s => s.id_name === x.name)?.team_index;
      const draw = rep.winner_ids.length === 0 || rep.stop_reason !== 'winner';
      const xWon = !draw && rep.winner_ids.some(id => teamOf.get(id) === xTeam);
      add(games, x.id, 1); add(games, y.id, 1);
      add(wins, x.id, draw ? 0.5 : (xWon ? 1 : 0));
      add(wins, y.id, draw ? 0.5 : (xWon ? 0 : 1));
    }
  }
}
for (const c of cards) c.winrate = wins.get(c.id) / games.get(c.id);

// —— 费用分档：按胜率排序，五档
const sorted = [...cards].sort((a, b) => b.winrate - a.winrate);
sorted.forEach((c, idx) => {
  const bucket = Math.min(4, Math.floor(idx / (sorted.length / 5))); // 0 = 最强
  c.cost = 5 - bucket;
  c.tier = 'SABCD'[bucket];
});

// —— 展示用技能列表
for (const c of cards) {
  const entries = Object.entries(c.skills)
    .map(([k, v]) => ({ id: k, name: SKILL_NAMES[k] || k, lv: levelOf(v) }))
    .filter(e => e.lv > 0)
    .sort((a, b) => b.lv - a.lv);
  c.skillList = entries;
  delete c.skills;
  delete c.line;
}

const out = {
  meta: {
    engine: { wasm: mod.version(), core: mod.core_version() },
    generatedAt: new Date().toISOString(),
    method: '名字经 to_diy 导出 ol 覆盖，name_factor_enabled=false 固定数值；费用由全卡池 1v1 循环赛胜率五等分。',
    matchCount: cards.length * (cards.length - 1),
  },
  cards: cards.sort((a, b) => a.cost - b.cost || b.winrate - a.winrate),
};
mkdirSync(path.join(root, 'data'), { recursive: true });
writeFileSync(path.join(root, 'data', 'cards.json'), JSON.stringify(out, null, 1));

console.log('\ncost | winrate | name');
for (const c of out.cards) {
  console.log(`${c.cost} ${c.tier}  ${(c.winrate * 100).toFixed(0).padStart(3)}%  ${c.name.padEnd(12)} hp${c.stats.hp} atk${c.stats.atk} mag${c.stats.mag} spd${c.stats.spd} | ${c.skillList.slice(0, 3).map(s => `${s.name}${s.lv}`).join(' ')}`);
}
const dist = {};
for (const c of cards) dist[c.cost] = (dist[c.cost] || 0) + 1;
console.log('cost dist', dist);
