// 局内状态、爬塔流程与存档。
import { makeCard, hydrateCard, iconFor, statsWithWeapon, buildWithWeapon, applyRunBuff, runMultiplier } from './engine.js';
import { buildLayerGraph, LAYER_COUNT } from './map.js';

// 给一张卡套上开局保底倍率，并把倍率记在卡上供界面显示加成
export function withRunBuff(card, nodeCount) {
  const mult = runMultiplier(nodeCount || 0);
  // 幂等：记住第一次套保底前的数值，之后无论套多少次都从这份底值重算，绝不会叠乘
  const base = card.statsBase || { ...card.stats };
  const scaled = applyRunBuff({ ...card, stats: base }, mult);
  return { ...scaled, statsBase: base, runMult: mult };
}
import { SKILLS, SKILL_IDS, skillMeta } from './skills.js';
// 每个地图节点后从天然构建重算倍率，武器随构建变化，永久锻造最后叠加。
export function refreshRunBuff(state) {
  if (!state.run) return;
  const mult = runMultiplier(state.run.index || 0);
  for (const card of state.collection || []) {
    const natural = card.weapon ? buildWithWeapon(card.name, card.clan, card.weapon)?.stats : makeCard(card.name, card.clan)?.stats;
    if (!natural) continue;
    card.statsBase = { ...natural };
    card.runMult = mult;
    card.stats = finalStats(card, natural);
  }
}

export const POTIONS = [
  { id: 'atk', name: '力量药水', field: 0, stat: '攻击', color: '#d94b3a' },
  { id: 'def', name: '铁壁药水', field: 1, stat: '防御', color: '#3b6fd9' },
  { id: 'spd', name: '疾风药水', field: 2, stat: '速度', color: '#2fa36b' },
  { id: 'agi', name: '灵巧药水', field: 3, stat: '敏捷', color: '#d9a13a' },
  { id: 'mag', name: '魔力药水', field: 4, stat: '魔力', color: '#8a5cd9' },
  { id: 'res', name: '抗性药水', field: 5, stat: '抗性', color: '#3aa8a3' },
  { id: 'wis', name: '智慧药水', field: 6, stat: '智慧', color: '#d97b3a' },
  { id: 'hp', name: '生命药水', field: 8, stat: '体力', color: '#c0353a' },
  { id: 'mp', name: '能量药水', field: 9, stat: '魔力', color: '#3a7bd5' },
];

// 试炼敌人可能携带的武器：随机字符串，掉落进物品栏后可装备
const WEAPON_CHARS = '试作残章旧梦远山寒潭星屑铁锈月影风铃霜刃木纹砂砾'.split('');
export function randomWeapon(rng) {
  const len = 2 + Math.floor(rng() * 3);
  let s = '';
  for (let i = 0; i < len; i++) s += WEAPON_CHARS[Math.floor(rng() * WEAPON_CHARS.length)];
  return s;
}

// 描述与实际 tswn 药水槽位一致；“魔力”属性和施法能量 MP 分开说明。
export function potionDescription(meta) {
  if (!meta) return '';
  const timing = '作用于当前行动角色，不额外占用行动；选择后随本次出牌结算。';
  if (meta.id === 'mp') return meta.name + '：回复 40 点 MP，上限 100；不是提高魔力属性。' + timing;
  if (meta.id === 'hp') return meta.name + '：回复最大体力的 25%（向下取整，至少 10 点），不超过最大体力。' + timing;
  const label = meta.id === 'mag' ? '魔力属性（法术强度，不是 MP）' : meta.stat;
  return meta.name + '：' + label + '临时增加当前战斗内部值的 25%（向下取整，至少 8 点），持续本次行动，下一次行动开始前还原。' + timing;
}

// 与引擎相同的整数口径，供血条/蓝条和属性预览复用。
export function potionPreview(meta, state) {
  if (!meta || !state) return state;
  const next = { ...state };
  if (meta.id === 'hp') next.hp = Math.min(state.max_hp, state.hp + Math.max(10, Math.floor(state.max_hp / 4)));
  else if (meta.id === 'mp') next.magic_point = Math.min(100, (state.magic_point || 0) + 40);
  else {
    const field = ['attack', 'defense', 'speed', 'agility', 'magic', 'resistance', 'wisdom'][meta.field];
    if (field) next[field] = state[field] + Math.max(8, Math.trunc(state[field] / 4));
  }
  return next;
}

// 插入玩家后统一排序并重算名次，支持榜首、榜尾和同分并列。
export function ladderStandings(run) {
  const score = Number(run?.score) || 0;
  const rows = (run?.entries || []).filter((e) => Number.isFinite(Number(e?.score)))
    .map((entry) => ({ entry, score: Number(entry.score), me: false }));
  rows.push({ entry: null, score, me: true });
  rows.sort((a, b) => b.score - a.score || Number(a.me) - Number(b.me));
  let rank = 1;
  return rows.map((row, i) => {
    if (i && row.score !== rows[i - 1].score) rank = i + 1;
    return { ...row, pos: rank };
  });
}
export function potionById(id) { return POTIONS.find((p) => p.id === id) || null; }

const SAVE_KEY = 'namerena-cards/v1';
const MAX_ENCOUNTERS = 8;

export const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shuffle = (arr, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const MAX_WINS = MAX_ENCOUNTERS;

export function createState() {
  return {
    pool: [],
    tacticsPool: [],
    ladder: null,
    ladderSource: 'snapshot',
    collection: [],
    ownedTactics: [],
    run: null,
    best: 0,
    customCards: [],
  };
}

export function loadSave(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return;
    state.records = s.records || [];
    if (Array.isArray(s.best)) state.best = s.best;
    state.collection = (s.collection || []).map((c) => hydrateSaved(c)).filter(Boolean);
    state.ownedTactics = (s.ownedTactics || []);
    state.tacticPower = s.tacticPower || {};
    state.weapons = Array.isArray(s.weapons) ? s.weapons : [];
    state.customCards = (s.customCards || []).map((c) => hydrateSaved(c)).filter(Boolean);
    if (s.run && s.run.status === 'active') {
      if (!s.run.graph) s.run.status = 'lost'; // 旧存档没有地图，直接结束这一局
      // 存档里 graph.byId 会变成普通对象，读回来必须重建 Map
      if (s.run.graph && !(s.run.graph.byId instanceof Map)) {
        const g = s.run.graph;
        g.byId = new Map((g.nodes || []).map((n) => [n.id, n]));
      }
      s.run.tacticIds = s.run.tacticIds || [];
      state.run = s.run;
      refreshRunBuff(state);
    }
  } catch { /* 忽略损坏存档 */ }
}

// 对手是 { rank, score, cards[] } 的包装；旧存档里可能是裸卡，这里兼容两种
function hydrateOpponent(o) {
  if (!o) return null;
  if (Array.isArray(o.cards)) {
    const cards = o.cards.map(hydrateSaved).filter(Boolean);
    if (!cards.length) return null;
    return { ...o, cards, teamSize: cards.length };
  }
  const card = hydrateSaved(o);
  return card ? { rank: null, score: 0, name: card.name, cards: [card], teamSize: 1 } : null;
}

function hydrateSaved(c) {
  if (!c || !c.stats) return null;
  return {
    // 带原始 attrs 的旧卡池/存档也通过同一外显属性入口恢复。
    ...hydrateCard(c),
    icon: c.icon || iconFor(c.name, c.clan),
    skillList: (c.skillList || []).map((s) => ({ ...s, cat: s.cat || SKILLS[s.id]?.cat || 'atk' })),
  };
}

// 整局快照（给存档槽位用）：与 localStorage 相同的瘦身格式
export function snapshot(state) {
  const slim = (c) => ({
    id: c.id, name: c.name, clan: c.clan, stats: c.stats, skillList: c.skillList, icon: c.icon,
    cost: c.cost, tier: c.tier, winrate: c.winrate, flavor: c.flavor, custom: c.custom,
    weapon: c.weapon || '', weaponInfo: c.weaponInfo || null, weaponItem: c.weaponItem || null, forge: c.forge || null,
    skillTraining: c.skillTraining || null, curseStats: c.curseStats || null, lostSkills: c.lostSkills || null,
    runMult: c.runMult || 1, maxMp: c.maxMp, shield: c.shield,
  });
  return {
    v: 1,
    best: state.best,
    records: state.records || [],
    collection: (state.collection || []).map(slim),
    ownedTactics: state.ownedTactics,
    tacticPower: state.tacticPower || {},
    customCards: (state.customCards || []).map(slim),
    weapons: state.weapons || [],
    run: state.run,
  };
}

export function restoreSnapshot(state, data) {
  if (!data || data.v !== 1) return false;
  state.records = data.records || [];
  if (Array.isArray(data.best)) state.best = data.best;
  state.collection = (data.collection || []).map((c) => hydrateSaved(c)).filter(Boolean);
  state.ownedTactics = data.ownedTactics || [];
  state.tacticPower = data.tacticPower || {};
  state.customCards = (data.customCards || []).map((c) => hydrateSaved(c)).filter(Boolean);
  state.weapons = Array.isArray(data.weapons) ? data.weapons : [];
  const run = data.run || null;
  if (run && run.graph && !(run.graph.byId instanceof Map)) {
    run.graph.byId = new Map((run.graph.nodes || []).map((n) => [n.id, n]));
  }
  state.run = run;
  refreshRunBuff(state);
  persist(state);
  return true;
}

export function persist(state) {
  try {
    const slim = (c) => ({
      id: c.id, name: c.name, clan: c.clan, stats: c.stats, skillList: c.skillList, icon: c.icon,
      cost: c.cost, tier: c.tier, winrate: c.winrate, flavor: c.flavor, custom: c.custom,
      // 装备与武器信息也要存，否则刷新后武器就「消失」了
      weapon: c.weapon || '', weaponInfo: c.weaponInfo || null, weaponItem: c.weaponItem || null, forge: c.forge || null, skillTraining: c.skillTraining || null, curseStats: c.curseStats || null, lostSkills: c.lostSkills || null, runMult: c.runMult || 1, maxMp: c.maxMp, shield: c.shield,
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      best: state.best,
      records: state.records || [],
      collection: state.collection.map(slim),
      ownedTactics: state.ownedTactics,
      tacticPower: state.tacticPower || {},
      customCards: state.customCards.map(slim),
      weapons: state.weapons || [],
      run: state.run,
    }));
  } catch { /* 存储满时静默失败 */ }
}

// 没有随机开局角色时的兜底：每个费用档各一张
export function starterCards(pool, seed) {
  const r = mulberry32(seed);
  const chosen = [];
  for (const cost of [1, 2, 3, 4, 5]) {
    const tier = pool.filter((c) => c.cost === cost);
    if (tier.length) chosen.push(tier[Math.floor(r() * tier.length)]);
  }
  const rest = pool.filter((c) => !chosen.includes(c));
  if (rest.length) chosen.push(rest[Math.floor(r() * rest.length)]);
  return chosen.filter(Boolean);
}

// —— 初始卡组：玩家自选战队名，名字字符串随机，属性/技能/熟练度因此随机
const CJK_BANK = '风云雷电山海星河月露霜雪烟雨雾岚林森鹿鹤剑琴书墨白青玄赤朱碧金银玉石花叶秋春江川原野孤舟长夜明灯古城沙烽火铁马冰河落霞鹜松竹梅兰菊泉石涧崖岸潮汐';
const LATIN = ['ka', 'ro', 'mi', 'sha', 'vel', 'dor', 'lin', 'ael', 'thra', 'nyx', 'sol', 'vex', 'zan', 'mir', 'cal', 'orin', 'fen', 'lys'];

export function randomName(rng) {
  const r = rng || Math.random;
  if (r() < 0.62) {
    const n = 2 + Math.floor(r() * 3); // 2~4 个汉字
    let out = '';
    for (let i = 0; i < n; i++) out += CJK_BANK[Math.floor(r() * CJK_BANK.length)];
    return out;
  }
  const n = 2 + Math.floor(r() * 2);
  let out = '';
  for (let i = 0; i < n; i++) out += LATIN[Math.floor(r() * LATIN.length)];
  if (r() < 0.5) out += ' ' + String(Math.floor(r() * 9000) + 1000);
  return out;
}

// 开局：选一条天梯线，队伍人数 = 线号（1A→1，3A→3）
export async function startRun(state, { seed = Date.now(), lane = '1A', clan = '青', ladder = null, starters = null } = {}) {
  const r = mulberry32(seed);
  const teamSize = Number(lane[0]) || 1;
  // 开局读一次实时天梯，本次爬塔的顺序就按这一份来；拿不到就用上次缓存，再退到仓库里的快照
  let liveEntries = null;
  let source = 'snapshot';
  try {
    liveEntries = await fetchLaneEntries(lane);
    if (liveEntries && liveEntries.length) {
      cacheLaneEntries(lane, liveEntries);
      source = 'live';
    }
  } catch {
    liveEntries = null;
  }
  if (!liveEntries || !liveEntries.length) {
    const cached = loadCachedLaneEntries(lane);
    if (cached) {
      liveEntries = cached.entries;
      source = 'cache';
    }
  }
  let laneData = ladder?.lanes?.[lane];
  if ((!liveEntries || !liveEntries.length) && !laneData) {
    try {
      laneData = (await loadLadder()).lanes?.[lane];
    } catch {
      laneData = null;
    }
  }
  const queue = liveEntries && liveEntries.length ? liveEntries : (laneData?.queue || []);
  state.run = {
    seed,
    lane,
    clan: clan || '青',
    teamSize,
    index: 0,
    wins: 0,
    score: 0,
    layer: 1,
    status: 'active',
    createdAt: Date.now(),
    teamIds: [],
    downed: [],
    tacticIds: [],
    potions: [],
    weapons: [],
    skillCards: [],
    graph: null,
    nodeId: null,
    selectedId: null,
    cleared: [],
    entries: [],
    ladderSource: liveEntries && liveEntries.length ? source : (ladder?.source || 'snapshot'),
  };
  // 整条天梯（按名次），只保留前 100 名
  state.run.entries = queue
    .filter((e) => e && Number.isFinite(e.rank) && e.rank >= 1 && e.rank <= 100)
    .map((entry) => opponentFromEntry(entry, teamSize));
  if (!state.run.entries.length) {
    // 兜底：没有名次的队伍就按顺序补
    state.run.entries = queue.slice(0, 100).map((entry) => opponentFromEntry(entry, teamSize));
  }
  // 开局角色：人数 = 线号
  const base = starters && starters.length ? starters : [];
  const collection = [...(state.customCards || [])];
  const used = new Set(collection.map((c) => c.id));
  for (let i = 0; i < teamSize; i++) {
    let card = base[i];
    if (!card) {
      const clan = ['青', '赤', '玄', '白'][Math.floor(r() * 4)];
      card = makeCard(randomName(r), clan);
    }
    if (used.has(card.id)) card = makeCard(randomName(r), ['青', '赤', '玄', '白'][Math.floor(r() * 4)]);
    used.add(card.id);
    // 新一局从零节点重新计算，随后统一重建天然属性，避免沿用旧局倍率。
    collection.push(withRunBuff(card, 0));
  }
  state.collection = collection;
  refreshRunBuff(state);
  state.run.teamIds = collection.slice(0, teamSize).map((c) => c.id);
  state.ownedTactics = shuffle(state.tacticsPool, r).slice(0, 3).map((t) => t.id);
  state.run.potions = shuffle(POTIONS, r).slice(0, 3).map((p) => ({ id: p.id, n: 1 }));
  buildGraphForLayer(state);
  persist(state);
  return state.run;
}

// 生成第 n 层的地图（n 从 run.layer 取）
export function buildGraphForLayer(state) {
  const run = state.run;
  if (!run) return null;
  const r = mulberry32((run.seed ^ (run.layer * 2654435761)) >>> 0);
  run.graph = buildLayerGraph({
    entries: run.entries || [],
    layer: run.layer,
    teamSize: run.teamSize,
    rng: r,
    makeFiller: (teamSize, rr) => makeFiller(teamSize, rr),
    makeElite: (teamSize, rr) => makeElite(teamSize, rr, run.layer),
    makeCpu: (rr) => makeCpu(rr),
  });
  run.nodeId = run.graph.startId;
  run.selectedId = null;
  run.cleared = [];
  return run.graph;
}

// 前两层只出现 1.2/1.5 倍数值精英，第三层起才开放双倍人数或双倍属性。
export function makeElite(teamSize, rng, layer = 1) {
  const swarm = layer >= 3 && rng() < 0.5;
  const mult = layer === 1 ? 1.2 : layer === 2 ? 1.5 : 2;
  const count = swarm ? Math.max(2, teamSize * 2) : Math.max(1, teamSize);
  const cards = [];
  for (let i = 0; i < count; i++) {
    try {
      const card = makeCard(randomName(rng), '!');
      if (!swarm) {
        const s = card.stats;
        for (const k of Object.keys(s)) s[k] = Math.round(s[k] * mult);
        card.eliteMult = mult;
      }
      cards.push(card);
    } catch {
      cards.push(statlessCard(randomName(rng) + '@!'));
    }
  }
  return { cards, mode: swarm ? 'swarm' : 'heavy', mult: swarm ? 1 : mult };
}

// 随机 @! 队名的填充队伍（TestEx），人数 = 出战人数
export function makeFiller(teamSize, rng) {
  const cards = [];
  for (let i = 0; i < Math.max(1, teamSize); i++) {
    try {
      const card = makeCard(randomName(rng), '!');
      // 试炼敌人 50% 概率带武器：整条构建换成「名字+武器」，并记录差值供卡面显示
      if (rng() < 0.5) {
        const weapon = randomWeapon(rng);
        const built = buildWithWeapon(card.name, card.clan, weapon);
        if (built) {
          const before = { ...card.stats };
          const beforeSkills = new Map((card.skillList || []).map((s) => [s.id, s.lv]));
          card.weapon = weapon;
          card.stats = built.stats;
          card.skillList = built.skills.map((s) => ({
            id: s.id,
            lv: s.id === 'skldisperse' ? Math.min(1, s.lv) : s.lv,
            cat: SKILLS[s.id]?.cat || 'atk',
            fromWeapon: true,
          }));
          const deltas = [];
          for (const [key, label] of STAT_LABELS) {
            const d = Math.round((built.stats[key] || 0) - (before[key] || 0));
            if (d) deltas.push({ label, delta: d });
          }
          card.weaponInfo = {
            weapon,
            deltas,
            added: card.skillList.filter((s) => !beforeSkills.has(s.id)).map((s) => ({ id: s.id, lv: s.lv })),
            removed: [...beforeSkills.keys()].filter((id) => !card.skillList.some((s) => s.id === id)).map((id) => ({ id, lv: beforeSkills.get(id) })),
          };
        }
      }
      cards.push(card);
    } catch {
      cards.push(statlessCard(randomName(rng) + '@!'));
    }
  }
  return cards;
}

function statlessCard(line) {
return { id: line, name: line, clan: '', stats: { hp: 200, atk: 20, def: 20, spd: 100, agi: 20, mag: 20, res: 20, wis: 20 }, skillList: [], icon: iconFor(line, '') };
}

// 当前正在准备/进行的战斗节点
export function currentNode(state) {
  const run = state.run;
  if (!run?.graph) return null;
  const id = run.selectedId || run.nodeId;
  return run.graph.byId.get(id) || null;
}

// 战斗节点对应的对手（含 cards）
export function currentOpponent(state) {
  const run = state.run;
  const node = currentNode(state);
  if (!node) return null;
  // 旧存档中的试炼头像也按名字修复，不沿用「!」生成的缓存头像。
  const cards = Array.isArray(node.payload) ? node.payload : (node.payload?.cards || []);
  for (const card of cards) if (card.clan === '!' || card.name?.endsWith('@!')) card.icon = iconFor(card.name, card.clan);
  // 层级终点与普通天梯节点共用对手结构，必须一起进入战斗。
  if (node.kind === 'ladder' || node.kind === 'end') return node.payload;
  if (node.kind === 'elite') {
    // 继续旧存档时也采用新曲线，沿用原名字，仅调整尚未交战的精英倍率/人数。
    const layer = run.layer || 1, mult = layer === 1 ? 1.2 : layer === 2 ? 1.5 : 2;
    const payload = node.payload;
    if (layer < 3 && payload.mode === 'swarm') {
      payload.mode = 'heavy'; payload.cards = payload.cards.slice(0, Math.max(1, run.teamSize));
    }
    if (payload.mode === 'heavy' && payload.mult !== mult) {
      for (const card of payload.cards) {
        const natural = makeCard(card.name, card.clan).stats;
        card.stats = Object.fromEntries(Object.entries(natural).map(([key, value]) => [key, Math.round(value * mult)]));
        card.eliteMult = mult;
      }
      payload.mult = mult;
    }
    return { rank: null, score: 0, name: '精英试炼', cards: payload.cards, teamSize: payload.cards.length, elite: true };
  }
  if (node.kind === 'filler') return { rank: null, score: 0, name: node.payload[0]?.name || '试炼对手', cards: node.payload, teamSize: node.payload.length };
  return null;
}

// 选择一个节点（只能从当前位置的 next 里选）
export function selectNode(state, nodeId) {
  const run = state.run;
  if (!run?.graph) return false;
  const from = run.graph.byId.get(run.nodeId);
  if (!from?.next.includes(nodeId)) return false;
  run.selectedId = nodeId;
  persist(state);
  return true;
}

// 打完这个节点：把当前位置推进过去
export function clearNode(state) {
  const run = state.run;
  if (!run?.selectedId) return null;
  const node = run.graph.byId.get(run.selectedId);
  run.nodeId = run.selectedId;
  run.cleared.push(run.selectedId);
  run.selectedId = null;
  run.index += 1;
  refreshRunBuff(state);
  // 所有战斗节点都计入胜场；事件和篝火不计入。
  if (node && ['ladder', 'filler', 'elite', 'end'].includes(node.kind)) run.wins += 1;
  persist(state);
  return node;
}

// 奖励摘要覆盖完整奖池，供补给和宝箱回执显示真实所得与存放位置。
export function rewardSummary(offer) {
  if (offer.kind === 'skill') return { label: '技能卡「' + skillMeta(offer.skill.id).name + '」', detail: '熟练度 ' + offer.skill.lv, destination: '已放入技能卡栏，可在锻造时使用。' };
  if (offer.kind === 'tactic') return { label: '战术卡「' + offer.tactic.name + '」', detail: scaleTactic(offer.tactic, offer.power || 1).desc, destination: '已加入战术卡栏，同名保留更强的一张。' };
  if (offer.kind === 'potion') return { label: (potionById(offer.potion.id)?.name || '药水') + ' ×' + (offer.potion.n || 1), detail: potionDescription(potionById(offer.potion.id)), destination: '已放入物品栏，可在战斗中使用。' };
  if (offer.kind === 'weapon') return { label: '武器「' + offer.weapon.name + '」', detail: '装备后重新计算角色属性和技能。', destination: '已放入物品栏。' };
  if (offer.kind === 'score') return { label: '天梯分数 +' + offer.points, detail: '分数已计入本局天梯排名。', destination: '已到账。' };
  return { label: '角色卡「' + offer.card.name + '@' + offer.card.clan + '」', detail: '获得一名可出战角色。', destination: '已加入角色库。' };
}

// 事件和宝箱仅允许从相邻未通关节点领取，防止重复开箱或跨节点领取。
export function enterEvent(state, nodeId) {
  const run = state.run;
  if (!run?.graph) return null;
  const from = run.graph.byId.get(run.nodeId);
  const node = run.graph.byId.get(nodeId);
  if (!from?.next.includes(nodeId) || !['event', 'chest'].includes(node?.kind) || run.cleared.includes(nodeId)) return null;
  run.selectedId = nodeId;
  clearNode(state);
  const r = mulberry32((run.seed ^ (run.index * 40503) ^ 0x5f3759df) >>> 0);
  const offers = rollRewards(state, (run.seed ^ (run.index * 2654435761)) >>> 0);
  // 宝箱物品不含分数，也不抽取未生成成功的角色卡；额外分数独立结算。
  const pool = offers.filter((offer) => (offer.kind !== 'card' || offer.card) && (node.kind !== 'chest' || offer.kind !== 'score'));
  const pick = pool[Math.floor(r() * pool.length)];
  applyReward(state, pick);
  const points = node.kind === 'chest' ? addScorePoints(state, rollRewardPoints(run, r)) : 0;
  persist(state);
  return { kind: pick.kind, label: rewardSummary(pick).label, reward: pick, points };
}

// 打赢带武器的试炼 → 50% 掉落一把武器
export function maybeDropWeapon(state, node, rng) {
  if (!node || node.kind !== 'filler') return null;
  const armed = (node.payload || []).filter((c) => c && c.weapon);
  if (!armed.length || rng() >= 0.5) return null;
  const pick = armed[Math.floor(rng() * armed.length)];
  state.weapons = state.weapons || [];
  const item = { id: 'w-' + Date.now().toString(36) + '-' + Math.floor(rng() * 1e6).toString(36), name: pick.weapon };
  state.weapons.push(item);
  persist(state);
  return item;
}

// 旧存档/旧敌人卡只有武器名、没有差值：按「名字+武器」重建一次补上，保证加成有数可显示
export function ensureWeaponInfo(card) {
  if (!card || !card.weapon || card.weaponInfo) return card;
  const base = makeCard(card.name, card.clan);
  const built = buildWithWeapon(card.name, card.clan, card.weapon);
  if (!base || !built) return card;
  const deltas = [];
  for (const [key, label] of STAT_LABELS) {
    const d = Math.round((built.stats[key] || 0) - (base.stats[key] || 0));
    if (d) deltas.push({ label, delta: d });
  }
  card.weaponInfo = { weapon: card.weapon, deltas, added: [], removed: [] };
  return card;
}

// 获得角色也使用当前节点进度的保底倍率。
export function grantCard(state, card) {
  if (!card) return null;
  const ready = withRunBuff(card, state.run?.index || 0);
  state.collection.push(ready);
  refreshRunBuff(state);
  persist(state);
  return ready;
}

// 角色当前的净加成（武器重建差 + 战术卡），用于界面上蓝/红字
export function cardBonus(state, card) {
  const bonus = {};
  const ids = state?.run?.tacticIds || [];
  for (const t of tacticsByIds(state, ids)) {
    for (const eff of t.effects || []) {
      if (eff.stat) bonus[eff.stat] = (bonus[eff.stat] || 0) + eff.value;
    }
  }
  ensureWeaponInfo(card);
  const LABEL_KEY = { 体力: 'hp', 攻: 'atk', 防: 'def', 速: 'spd', 敏: 'agi', 魔: 'mag', 抗: 'res', 智: 'wis' };
  const mult = card?.runMult || 1;
  for (const d of card?.weaponInfo?.deltas || []) {
    const key = LABEL_KEY[d.label];
    // 武器差值在武器构建里，所以也要跟着倍率放大
    if (key) bonus[key] = (bonus[key] || 0) + Math.round(d.delta * mult);
  }
  if (card && mult > 1) {
    const base = makeCard(card.name, card.clan);
    if (base) {
      for (const [k, v] of Object.entries(base.stats)) {
        const extra = Math.round(((v || 0) - (card.curseStats?.[k] || 0)) * (mult - 1));
        if (extra) bonus[k] = (bonus[k] || 0) + extra;
      }
    }
  }
  return bonus;
}

// 技能锻造独立于武器构建保存，换装仅替换天然技能，随后重叠永久增量。
function rememberSkillTraining(state, card) {
  if (card.skillTraining) return;
  card.skillTraining = {};
  const oldBuild = card.weapon ? buildWithWeapon(card.name, card.clan, card.weapon)?.skills : makeCard(card.name, card.clan)?.skillList;
  for (const skill of card.skillList || []) {
    if (!skill.forge) continue;
    const natural = oldBuild?.find((s) => s.id === skill.id)?.lv || 0;
    const forged = (state.run?.forged || []).filter((f) => f.charId === card.id && f.skillId === skill.id).reduce((sum, f) => sum + f.lv, 0);
    card.skillTraining[skill.id] = { gain: Math.max(0, skill.lv - natural - forged), count: skill.forge, mpMul: skill.mpMul || 1 };
  }
}

function skillsForBuild(state, card, natural) {
  // 诅咒只移除本体技能，武器重建仍保留超过本体天然熟练度的独立贡献。
  const native = card.weapon && Object.keys(card.lostSkills || {}).length ? makeCard(card.name, card.clan).skillList : [];
  const list = new Map((natural || []).map((s) => {
    const lv = card.lostSkills?.[s.id] ? (card.weapon ? Math.max(0, s.lv - (native.find((v) => v.id === s.id)?.lv || 0)) : 0) : s.lv;
    return [s.id, { ...s, cat: s.cat || SKILLS[s.id]?.cat || 'atk',
      lv: card.weapon && s.id === 'skldisperse' ? Math.min(1, lv) : lv, fromWeapon: !!card.weapon }];
  }));
  const get = (id) => {
    if (!list.has(id)) list.set(id, { id, lv: 0, cat: SKILLS[id]?.cat || 'atk' });
    return list.get(id);
  };
  for (const f of state.run?.forged || []) {
    if (f.charId !== card.id) continue;
    const skill = get(f.skillId);
    skill.lv += f.lv;
    if (f.playerDisperse) skill.playerDisperse = true;
    skill.forges = (skill.forges || ((natural || []).some((s) => s.id === skill.id) ? 1 : 0)) + 1;
  }
  for (const [id, training] of Object.entries(card.skillTraining || {})) {
    const skill = get(id);
    skill.lv += training.gain;
    skill.forge = training.count;
    skill.mpMul = training.mpMul;
  }
  return [...list.values()].filter((s) => s.lv > 0);
}

// 技能代价使用卸下武器后的本体与锻造熟练度，计算过程不改动现有装备。
export function curseBaseSkills(state, card) {
  rememberSkillTraining(state, card);
  return skillsForBuild(state, { ...card, weapon: '' }, makeCard(card.name, card.clan).skillList);
}

// 开战前也恢复旧存档里被换武器覆盖、但仍有锻造记录的技能。
export function prepareBattleCard(state, card) {
  refreshRunBuff(state);
  rememberSkillTraining(state, card);
  const hasForge = (state.run?.forged || []).some((f) => f.charId === card.id);
  if (hasForge || Object.keys(card.skillTraining).length || Object.keys(card.lostSkills || {}).length) {
    const natural = card.weapon ? buildWithWeapon(card.name, card.clan, card.weapon)?.skills : makeCard(card.name, card.clan)?.skillList;
    if (natural) card.skillList = skillsForBuild(state, card, natural);
  }
  return card;
}

// 构建结果再叠锻造、再套开局保底（保持与装备前一致）
function finalStats(card, stats) {
  const mult = card.runMult || 1;
  // 诅咒降低基础值：武器差值不变，开局倍率作用于降低后的基础，锻造独立叠回。
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => {
    const factor = key === 'hp' ? 1 : mult;
    const shown = Math.round((value - (card.curseStats?.[key] || 0)) * factor) + (card.forge?.[key] || 0);
    return [key, Math.max(key === 'hp' ? 1 : 0, shown)];
  }));
}

// 黑字基础只含本体、永久锻造和诅咒；交易生成和扣款都使用同一口径。
export function curseBaseStats(card) {
  return applyCurses(applyForge(makeCard(card.name, card.clan).stats, card.forge), card.curseStats);
}

// 编码下限为 HP 1、其余 0；用于基础值及黑字属性的显示。
export function applyCurses(stats, curseStats) {
  const out = { ...stats };
  for (const [key, loss] of Object.entries(curseStats || {})) out[key] = Math.max(key === 'hp' ? 1 : 0, Math.round((out[key] || 0) - loss));
  return out;
}

// 锻造增量叠加在任何构建结果之上（锻造只锻基础值，不进蓝字加成）
export function applyForge(stats, forge) {
  if (!stats) return stats;
  const f = forge || {};
  const out = { ...stats };
  for (const k of Object.keys(f)) out[k] = Math.round((out[k] || 0) + f[k]);
  return out;
}

// 装备武器：用引擎重算该角色的属性线
const STAT_LABELS = [['hp', '体力'], ['atk', '攻'], ['def', '防'], ['spd', '速'], ['agi', '敏'], ['mag', '魔'], ['res', '抗'], ['wis', '智']];

// 装备武器：用引擎重算属性线，并记录这件武器加了哪些属性 / 新技能
export function equipWeapon(state, weaponId, charId) {
  const list = state.weapons || [];
  const idx = list.findIndex((w) => w.id === weaponId);
  if (idx < 0) return null;
  const card = (state.collection || []).find((c) => c.id === charId);
  if (!card) return null;
  const weapon = list[idx];
  const built = buildWithWeapon(card.name, card.clan, weapon.name);
  if (!built) return null;
  const plain = makeCard(card.name, card.clan);
  const before = { ...(plain ? plain.stats : card.stats) };
  const beforeSkills = new Map((card.skillList || []).map((s) => [s.id, s.lv]));

  if (card.weapon) {
    // 装卸保留同一物品身份及重铸次数，防止换装重置商人费用。
    list.push(card.weaponItem || { id: 'w-' + Date.now().toString(36) + '-old', name: card.weapon });
  }
  rememberSkillTraining(state, card);
  card.weapon = weapon.name;
  card.weaponItem = { ...weapon };
  // 天然构建替换为名字+武器，属性锻造与技能锻造作为独立增量叠回。
  card.stats = finalStats(card, built.stats);
  card.skillList = skillsForBuild(state, card, built.skills);

  const deltas = [];
  for (const [key, label] of STAT_LABELS) {
    const d = Math.round((built.stats[key] || 0) - (before[key] || 0));
    if (d) deltas.push({ label, delta: d });
  }
  const added = card.skillList.filter((s) => !beforeSkills.has(s.id) || (beforeSkills.get(s.id) || 0) < s.lv)
    .map((s) => ({ id: s.id, lv: s.lv }));
  const removed = [...beforeSkills.keys()].filter((id) => !card.skillList.some((s) => s.id === id))
    .map((id) => ({ id, lv: beforeSkills.get(id) }));
  card.weaponInfo = { weapon: weapon.name, deltas, added, removed };
  list.splice(idx, 1);
  persist(state);
  return { ...weapon, deltas, added };
}export function unequipWeapon(state, charId) {
  const card = (state.collection || []).find((c) => c.id === charId);
  if (!card || !card.weapon) return null;
  state.weapons = state.weapons || [];
  const weapon = card.weapon;
  state.weapons.push(card.weaponItem || { id: 'w-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36), name: weapon });
  rememberSkillTraining(state, card);
  card.weapon = '';
  card.weaponItem = null;
  // 卸下后恢复本体天然构建，再叠回独立保存的锻造加成。
  const base = makeCard(card.name, card.clan);
  card.stats = finalStats(card, base.stats);
  card.skillList = skillsForBuild(state, card, base.skillList);
  card.weaponInfo = null;
  persist(state);
  return weapon;
}

// 物品栏销毁
export function destroyItem(state, kind, id) {
  if (kind === 'card') {
    if ((state.run?.teamIds || []).includes(id)) return false;
    const before = state.collection.length;
    state.collection = state.collection.filter((c) => c.id !== id);
    if (state.collection.length === before) return false;
  } else if (kind === 'tactic') {
    state.ownedTactics = (state.ownedTactics || []).filter((t) => t !== id);
    if (state.tacticPower) delete state.tacticPower[id];
    if (state.run) state.run.tacticIds = (state.run.tacticIds || []).filter((t) => t !== id);
  } else if (kind === 'forge') {
    if (!state.run) return false;
    const before = state.run.skillCards.length;
    state.run.skillCards = state.run.skillCards.filter((s) => s.uid !== id);
    if (state.run.skillCards.length === before) return false;
  } else if (kind === 'weapon') {
    state.weapons = (state.weapons || []).filter((w) => w.id !== id);
  } else {
    return false;
  }
  persist(state);
  return true;
}

// 终点打完 → 进入下一层；返回 true 表示整座塔通关
// 分数：Elo 口径（K=32），对手分数取天梯榜上的 score
// 天梯官方口径（Namer-Ladder/app/utils/ladder/new_update.js）：
//   期望 E = 1 / (1 + 10^(-(我方分 - 对方分) / 50600))
//   单场变动 = K × (1 - E)，K = 80
// 站点一轮里每个号会打好几十场，我们一场战斗只算一次，所以乘一个局内倍率把量级拉齐
export const LADDER_RULES = { k: 80, scale: 50600, mult: 60 };

export function ladderExpected(me, opp) {
  return 1 / (1 + Math.pow(10, -(me - opp) / LADDER_RULES.scale));
}

export function eloGain(player, opp, k) {
  const s = Number.isFinite(opp) ? opp : player;
  const e = ladderExpected(player, s);
  const base = (k || LADDER_RULES.k) * (1 - e);
  return Math.max(1, Math.round(base * LADDER_RULES.mult));
}

export function addScore(state, oppScore) {
  const run = state.run;
  if (!run) return 0;
  run.score = Number.isFinite(run.score) ? run.score : 0;
  const gain = eloGain(run.score, oppScore);
  run.score += gain;
  persist(state);
  return gain;
}

// 战败扣分：只扣 3%，最多 300
export function loseScore(state) {
  const run = state.run;
  if (!run) return 0;
  const cur = Number.isFinite(run.score) ? run.score : 0;
  const loss = Math.min(300, cur) === 0 ? 0 : Math.min(300, Math.max(10, Math.round(cur * 0.03)));
  run.score = Math.max(0, cur - loss);
  persist(state);
  return loss;
}

export function addScorePoints(state, points) {
  const run = state.run;
  if (!run) return 0;
  run.score = (Number.isFinite(run.score) ? run.score : 0) + Math.round(points);
  persist(state);
  return Math.round(points);
}

// 八围：七围 + 体力，速用引擎内部值（对外展示是 -124 的折合值）
export function eightSum(card) {
  const s = card?.stats;
  if (!s) return 0;
  return Math.round((s.atk || 0) + (s.def || 0) + (s.spd || 0) + (s.agi || 0) + (s.mag || 0) + (s.res || 0) + (s.wis || 0) + (s.hp || 0));
}

// 电脑节点：一台随机 CPU，八围随机（显示名-八围），速度 = 八围 × 10
export function makeCpu(rng) {
  const len = 3 + Math.floor(rng() * 3);
  let name = '';
  for (let i = 0; i < len; i++) name += String.fromCharCode(65 + Math.floor(rng() * 26));
  const attr = 380 + Math.floor(rng() * 220);
  return { name, attr, speed: attr * 10 };
}

// 测号：从「前缀+随机数字」开始，在 speed 个数字内找八围最高的名字
export function cpuScan(prefix, startAt, cpu, clan) {
  // 前缀可以是中文/字母/数字，只去掉空白
  const pre = String(prefix || '').replace(/\s+/g, '');
  if (!pre) return null;
  let best = null;
  let bestSum = -1;
  let bestName = '';
  const range = Math.max(1, Math.round(cpu?.speed || 0));
  for (let i = 0; i <= range; i++) {
    const nm = pre + (startAt + i);
    const card = makeCard(nm, clan || '无名');
    if (!card) continue;
    const sum = eightSum(card);
    if (sum > bestSum) { bestSum = sum; best = card; bestName = nm; }
  }
  return best ? { card: best, sum: bestSum, name: bestName, scanned: range + 1 } : null;
}

// 每个 PC 节点只消耗一次有效测号机会；先落盘再扫描，刷新或连点也不会重复发奖。
export function scanCpuNode(state, nodeId, prefix, startAt) {
  const node = state.run?.graph?.byId?.get(nodeId);
  if (!node || node.kind !== 'cpu' || state.run.nodeId !== nodeId) return { ok: false, reason: 'invalid_node' };
  if (node.cpuScanUsed) return { ok: false, reason: 'used', result: node.cpuScanResult || null };
  if (!String(prefix || '').trim() || /\s/.test(prefix)) return { ok: false, reason: 'invalid_prefix' };
  node.cpuScanUsed = true;
  persist(state);
  try {
    const result = cpuScan(prefix, startAt, node.payload, state.run.clan || '无名');
    node.cpuScanResult = result;
    if (result && !state.collection.some((c) => c.name === result.card.name)) grantCard(state, result.card);
    persist(state);
    return { ok: !!result, reason: result ? '' : 'empty', result };
  } catch {
    persist(state);
    return { ok: false, reason: 'failed' };
  }
}

// 稳定的节点种子让存档、重新打开面板和购买都不刷新库存。
function nodeSeed(run, node, salt = 0) {
  let seed = (run.seed ^ salt) >>> 0;
  for (const char of node.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

// 使用固定名字的 tswn 自然构建作估值基准，七围按 3、体力按 1 折算。
const weaponValueCache = new Map();
export function weaponQuote(weapon, layer = 1) {
  if (!weaponValueCache.has(weapon.name)) {
    const base = makeCard('武器估值', '商人');
    const built = buildWithWeapon(base.name, base.clan, weapon.name);
    if (!built) return null;
    const deltas = STAT_LABELS.map(([key, label]) => ({ label, delta: Math.round(built.stats[key] - base.stats[key]) }));
    const attrs = deltas.reduce((sum, d, i) => sum + d.delta * (i === 0 ? 1 : 3), 0);
    const skills = built.skills.reduce((sum, s) => sum + s.lv, 0) - base.skillList.reduce((sum, s) => sum + s.lv, 0);
    const value = Math.max(400, Math.min(3000, Math.round(400 + attrs * 6 + skills * 10)));
    weaponValueCache.set(weapon.name, { value, attrs, skills, deltas });
  }
  const quote = weaponValueCache.get(weapon.name);
  return { ...quote, buy: Math.ceil(quote.value * 1.6 / 50) * 50,
    sell: Math.floor(quote.value * .5 / 25) * 25,
    // 单次费用高于最高回收价，重铸不能靠卖出刷分；次数随物品保存。
    reforge: 1800 + Math.max(0, layer - 1) * 50 + (weapon.reforges || 0) * 450 };
}

function merchantHere(state) {
  const node = currentNode(state);
  return node?.kind === 'weaponMerchant' && node.id === state.run.nodeId ? node : null;
}

// 商人初次打开刷新三把不同名字的武器，售出后不补货、不重复购买。
export function merchantStock(state) {
  const node = merchantHere(state);
  if (!node) return [];
  if (!node.weaponStock) {
    const rng = mulberry32(nodeSeed(state.run, node, 0x7eaf09));
    const names = new Set();
    node.weaponStock = Array.from({ length: 3 }, (_, i) => {
      let name;
      do { name = randomWeapon(rng); } while (names.has(name));
      names.add(name);
      const weapon = { id: 'merchant-' + node.id + '-' + i, name, reforges: 0 };
      return { weapon, price: weaponQuote(weapon).buy, rarity: 'blue', sold: false };
    });
    persist(state);
  }
  return node.weaponStock;
}

export function buyMerchantWeapon(state, weaponId) {
  const offer = merchantStock(state).find((o) => o.weapon.id === weaponId);
  if (!offer || offer.sold || !Number.isFinite(state.run.score) || state.run.score < offer.price) return false;
  offer.sold = true;
  state.run.score -= offer.price;
  (state.weapons ||= []).push({ ...offer.weapon });
  persist(state);
  return true;
}

// 只处理物品栏武器；已装备的武器先卸下，以保证角色属性同步重算。
export function reforgeWeapon(state, weaponId) {
  const node = merchantHere(state);
  const weapon = (state.weapons || []).find((w) => w.id === weaponId);
  if (!node || !weapon) return null;
  const quote = weaponQuote(weapon, state.run.layer);
  if (!quote || !Number.isFinite(state.run.score) || state.run.score < quote.reforge) return null;
  const rng = mulberry32(nodeSeed(state.run, node, 0x98ae31) ^ nodeSeed(state.run, { id: weapon.id }, weapon.reforges || 0));
  const oldName = weapon.name;
  let name;
  do { name = randomWeapon(rng); } while (name === oldName);
  if (!weaponQuote({ name })) return null;
  state.run.score -= quote.reforge;
  weapon.name = name;
  weapon.reforges = (weapon.reforges || 0) + 1;
  persist(state);
  return { oldName, name, cost: quote.reforge };
}

export function sellWeapon(state, weaponId) {
  if (!merchantHere(state)) return null;
  const index = (state.weapons || []).findIndex((w) => w.id === weaponId);
  if (index < 0) return null;
  const weapon = state.weapons[index], quote = weaponQuote(weapon);
  if (!quote) return null;
  state.weapons.splice(index, 1);
  state.run.score = (Number.isFinite(state.run.score) ? state.run.score : 0) + quote.sell;
  persist(state);
  return { name: weapon.name, points: quote.sell };
}

// 商店默认蓝色品质，8% 概率额外出售一张熟练度 1～2 的金色净化卡。
export function rollShop(state, seed, layer = 1) {
  const r = mulberry32(seed);
  const run = state.run;
  const progress = Math.min(1, Math.max(0, ((layer || 1) - 1) / Math.max(1, LAYER_COUNT - 1)));
  const items = [];
  // 物价：约等于每层收入的三分之一到一半，买一两件不影响登顶
  const priceOf = (base) => Math.round((base * (1 + progress * 0.5)) / 50) * 50;
  // 技能卡
  const skills = SKILL_IDS.filter((id) => id !== 'skldisperse');
  const sid = skills[Math.floor(r() * skills.length)];
  items.push({ kind: 'skill', price: priceOf(1100), skill: { id: sid, lv: Math.round(20 + progress * 50), uid: 'shop-' + seed + '-' + Math.floor(r() * 1e6) } });
  // 角色卡
  const card = makeCard(randomName(r), run.clan || '青');
  items.push({ kind: 'card', price: priceOf(1800), card });
  // 武器
  const weapon = { id: 'w-shop-' + Math.floor(r() * 1e9).toString(36), name: randomWeapon(r) };
  items.push({ kind: 'weapon', price: priceOf(weaponQuote(weapon).buy), weapon });
  // 药水
  const pm = POTIONS[Math.floor(r() * POTIONS.length)];
  items.push({ kind: 'potion', price: priceOf(500), potion: { id: pm.id, n: 2 } });
  // 战术
  const pool = (state.tacticsPool || []).filter((t) => !(state.ownedTactics || []).includes(t.id));
  const tactic = pool.length ? pool[Math.floor(r() * pool.length)] : null;
  if (tactic) items.push({ kind: 'tactic', price: priceOf(1500), tactic, power: Math.round((1 + progress) * 10) / 10 });
  if (r() < .08) items.push({ kind: 'skill', rarity: 'gold', price: priceOf(4500),
    skill: { id: 'skldisperse', lv: 1 + Math.floor(r() * 2), uid: 'shop-purify-' + seed, playerDisperse: true } });
  return items.map((item, i) => ({ ...item, id: 'shop-' + seed + '-' + i, rarity: item.rarity || 'blue' }));
}

export function shopStock(state) {
  const node = currentNode(state);
  if (node?.kind !== 'shop' || node.id !== state.run.nodeId) return [];
  if (!node.shopItems) {
    node.shopItems = rollShop(state, nodeSeed(state.run, node, 0x51ed270b), state.run.layer);
    persist(state);
  }
  return node.shopItems;
}

// 代价固定在第一次看到库存时；切换人物只读取该人物自己的已存库存。
export const CURSE_STATS = [['hp', 'HP'], ['atk', '攻击'], ['def', '防御'], ['spd', '速度'], ['agi', '敏捷'], ['mag', '魔力'], ['res', '抗性']];
const highestSkill = (state, card) => card ? curseBaseSkills(state, card).sort((a, b) => b.lv - a.lv || a.id.localeCompare(b.id))[0] : null;
function curseHere(state) {
  const node = currentNode(state);
  return node?.kind === 'curseMerchant' && node.id === state.run.nodeId ? node : null;
}

// 以损失 20 点单项属性或熟练度 40 的技能为标准强度，物品随代价增强。
function curseReward(item, units, rng) {
  const strength = Math.max(.1, Math.min(4, units / 20));
  const reward = structuredClone(item);
  delete reward.price;
  if (reward.skill) reward.skill.lv = reward.rarity === 'gold' ? Math.min(2, Math.max(1, Math.round(strength))) : Math.max(1, Math.round(reward.skill.lv * strength));
  if (reward.potion) reward.potion.n = Math.max(1, Math.round(2 * strength));
  if (reward.tactic) reward.power = Math.round((1 + strength) * 10) / 10;
  if (reward.card) {
    // 新角色的额外强度写入永久锻造，避免领取后的保底重算将它覆盖。
    reward.card.forge = Object.fromEntries(STAT_LABELS.map(([key]) => [key, Math.round(units * (key === 'hp' ? 1.5 : .5))]));
    reward.card.stats = applyForge(reward.card.stats, reward.card.forge);
  }
  if (reward.weapon) {
    const target = Math.min(3000, 400 + units * 65);
    const names = [reward.weapon.name, ...Array.from({ length: 24 }, () => randomWeapon(rng))];
    reward.weapon.name = names.sort((a, b) => Math.abs(weaponQuote({ name: a }).value - target) - Math.abs(weaponQuote({ name: b }).value - target))[0];
  }
  return reward;
}

export function curseStock(state, charId) {
  const node = curseHere(state), card = state.collection.find((c) => c.id === charId);
  if (!node || !card) return [];
  refreshRunBuff(state);
  node.curseStocks ||= {};
  if (!node.curseStocks[charId]) {
    const seed = nodeSeed(state.run, { id: node.id + ':' + charId }, 0xc075e);
    const rng = mulberry32(seed), top = highestSkill(state, card);
    const costs = CURSE_STATS.map(([key, label]) => {
      const factor = key === 'hp' ? 3 : 1, floor = key === 'hp' ? 1 : 0;
      // 随机数严格小于所有角色可承受值的最小值，保留至少一个单位的余量。
      const max = Math.min(40, ...state.collection.map((c) => Math.ceil(((curseBaseStats(c)[key] || 0) - floor) / factor) - 1));
      return { type: 'stat', key, label, factor, max };
    }).filter((cost) => cost.max >= 1);
    node.curseStocks[charId] = rollShop(state, seed, state.run.layer).map((item, i) => {
      let cost;
      if (top && (i % 2 === 1 || !costs.length)) cost = { type: 'skill', charId, charName: card.name, skillId: top.id, lv: top.lv, units: Math.max(1, top.lv / 2) };
      else if (costs.length) {
        const base = costs[Math.floor(rng() * costs.length)];
        const units = 1 + Math.floor(rng() * base.max);
        cost = { type: 'stat', key: base.key, label: base.label, amount: units * base.factor, units };
      } else return null;
      return { ...curseReward(item, cost.units, rng), id: 'curse-' + seed + '-' + i, cost, sold: false };
    }).filter(Boolean);
    persist(state);
  }
  return node.curseStocks[charId];
}

// 同时校验所有角色，绝不让部分角色先扣款；技能报价必须仍为该人物的最高技能。
export function canBuyCurse(state, offer) {
  if (!curseHere(state) || !offer || offer.sold) return false;
  const cost = offer.cost;
  if (offer.card && state.collection.some((c) => c.id === offer.card.id)) return false;
  if (cost.type === 'stat') return state.collection.length > 0 && state.collection.every((c) => curseBaseStats(c)[cost.key] - cost.amount > (cost.key === 'hp' ? 1 : 0));
  const top = highestSkill(state, state.collection.find((c) => c.id === cost.charId));
  return !!top && top.id === cost.skillId && top.lv === cost.lv;
}

export function buyCurseItem(state, charId, offerId) {
  const offer = curseStock(state, charId).find((o) => o.id === offerId);
  if (!canBuyCurse(state, offer)) return null;
  const cost = offer.cost;
  if (cost.type === 'stat') {
    for (const card of state.collection) {
      card.curseStats ||= {};
      card.curseStats[cost.key] = (card.curseStats[cost.key] || 0) + cost.amount;
    }
    refreshRunBuff(state);
  } else {
    const card = state.collection.find((c) => c.id === cost.charId);
    card.lostSkills ||= {};
    card.lostSkills[cost.skillId] = true;
    if (card.skillTraining) delete card.skillTraining[cost.skillId];
    state.run.forged = (state.run.forged || []).filter((f) => f.charId !== card.id || f.skillId !== cost.skillId);
    const natural = card.weapon ? buildWithWeapon(card.name, card.clan, card.weapon).skills : makeCard(card.name, card.clan).skillList;
    card.skillList = skillsForBuild(state, card, natural);
  }
  offer.sold = true;
  applyReward(state, offer);
  persist(state);
  return offer;
}

export function buyShopItem(state, item) {
  const run = state.run;
  if (!run || !item) return false;
  item = shopStock(state).find((offer) => offer.id === item.id);
  if (!item || item.sold) return false;
  const score = Number.isFinite(run.score) ? run.score : 0;
  if (score < item.price) return false;
  run.score = score - item.price;
  item.sold = true;
  applyReward(state, item);
  persist(state);
  return true;
}

// 篝火：休息 → 下一场以 125% 体力开场；锻造 → 给某个角色的一个技能加工
export function enterCamp(state, nodeId) {
  const run = state.run;
  if (!run?.graph) return false;
  const from = run.graph.byId.get(run.nodeId);
  if (!from?.next.includes(nodeId)) return false;
  run.selectedId = nodeId;
  clearNode(state);
  persist(state);
  return true;
}

export function campRest(state) {
  const run = state.run;
  if (!run) return false;
  run.restBuff = true;
  persist(state);
  return true;
}

export function campForgeStat(state, charId, key) {
  const card = (state.collection || []).find((c) => c.id === charId);
  if (!card || !card.stats || !(key in card.stats)) return null;
  // 锻造加在基础值上：先得到当前构建（本体或本体+武器），再叠加已记录的 forge 增量
  const build = card.weapon ? buildWithWeapon(card.name, card.clan, card.weapon) : makeCard(card.name, card.clan);
  const buildStats = build ? build.stats : card.stats;
  card.forge = card.forge || {};
  const cur = (buildStats[key] || 0) + (card.forge[key] || 0);
  const gain = Math.max(1, Math.round(cur * 0.1));
  card.forge[key] = (card.forge[key] || 0) + gain;
  card.stats = finalStats(card, buildStats);
  persist(state);
  const fold = (v) => Math.round(v);
  return { key, from: fold(cur), to: fold(card.stats[key]), raw: [cur, card.stats[key]] };
}

export function campForge(state, charId, skillId) {
  const card = (state.collection || []).find((c) => c.id === charId);
  const skill = card?.skillList?.find((s) => s.id === skillId);
  if (!skill) return null;
  // 武器仍可发动被献祭的同名技能，但不能借训练将本体部分恢复。
  if (card.lostSkills?.[skillId]) return null;
  rememberSkillTraining(state, card);
  const gain = Math.max(1, Math.round(skill.lv * 0.05));
  const training = card.skillTraining[skillId] || { gain: 0, count: 0, mpMul: 1 };
  training.gain += gain;
  training.count += 1;
  training.mpMul *= 0.95;
  card.skillTraining[skillId] = training;
  skill.forge = training.count;
  skill.lv += gain;
  skill.mpMul = training.mpMul;
  persist(state);
  return skill;
}
export function advanceLayer(state) {
  const run = state.run;
  if (!run) return false;
  if (run.layer >= LAYER_COUNT) {
    run.status = 'won';
    recordRun(state, run, true);
    persist(state);
    return true;
  }
  run.layer += 1;
  buildGraphForLayer(state);
  persist(state);
  return false;
}


export function scaleTactic(t, power) {
  const p = power || 1;
  if (p === 1) return t;
  const attrs = {};
  for (const [k, v] of Object.entries(t.apply?.attrs || {})) attrs[k] = Math.round(v * p);
  const skills = {};
  for (const [k, v] of Object.entries(t.apply?.skills || {})) skills[k] = Math.round(v * p);
  // 卡面描述与实际应用共用已缩放、已取整的数值，不再并列显示基础值与倍率。
  const labels = { hp: '体力上限', atk: '攻击', def: '防御', spd: '速度', agi: '敏捷', mag: '魔力', res: '抗性', wis: '智慧' };
  const signed = (v) => (v >= 0 ? '+' : '') + v;
  const desc = [...Object.entries(attrs).map(([key, value]) => (labels[key] || key) + ' ' + signed(value)),
    ...Object.entries(skills).map(([id, value]) => skillMeta(id).name + ' ' + signed(value) + ' 级')].join('，') || t.desc;
  return { ...t, power: p, desc, apply: { ...t.apply, attrs, skills } };
}

export function tacticsByIds(state, ids) {
  return ids
    .map((id) => state.tacticsPool.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => scaleTactic(t, state.tacticPower?.[t.id] || 1));
}

export function ownedTacticObjects(state) {
  return state.ownedTactics
    .map((id) => state.tacticsPool.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => scaleTactic(t, state.tacticPower?.[t.id] || 1));
}

// 每场战斗开打时都重新掷一个种子，避免同一关重试时对手出招顺序完全一样
export function rollBattleSeed(run) {
  run.battleSeed = (Math.random() * 0xffffffff) >>> 0;
  return run.battleSeed;
}

export function battleSeed(run) {
  if (run && Number.isFinite(run.battleSeed)) return run.battleSeed >>> 0;
  let h = 2166136261;
  const s = `${run?.seed ?? 0}-${run?.index ?? 0}-${(run?.teamIds || []).join('|')}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 宝箱与试炼使用相同的分数奖励范围：每层递增，普通奖励约 300～1000 分。
function rollRewardPoints(run, rng, elite = false) {
  const progress = Math.min(1, Math.max(0, ((run.layer || 1) - 1) / Math.max(1, LAYER_COUNT - 1)));
  return Math.round((300 + progress * 500 + rng() * 200) * (elite ? 1.5 : 1));
}

// 战斗奖励从完整奖池抽取三项供玩家选择。
export function rollRewards(state, seed, elite = false) {
  const r = mulberry32(seed);
  const run = state.run;
  const progress = Math.min(1, Math.max(0, ((run.layer || 1) - 1) / Math.max(1, LAYER_COUNT - 1)));
  // 角色：必须是本战队
  let card = null;
  for (let i = 0; i < 20; i++) {
    const candidate = makeCard(randomName(r), run.clan || '青');
    if (!state.collection.some((c) => c.id === candidate.id)) { card = candidate; break; }
  }
  const skills = SKILL_IDS.filter((id) => id !== 'skldisperse');
  const skillId = skills[Math.floor(r() * skills.length)];
  const lv = Math.round((10 + progress * 55 + r() * 25) * (elite ? 1.5 : 1));
  const power = Math.round((1 + progress * 0.9 + r() * 0.25) * (elite ? 1.5 : 1) * 10) / 10;
  const tacticPool = (state.tacticsPool || []).filter(
    (t) => !(state.ownedTactics || []).includes(t.id) || (state.tacticPower?.[t.id] || 1) < power,
  );
  const tactic = tacticPool.length ? tacticPool[Math.floor(r() * tacticPool.length)] : null;
  if (elite && card) {
    const s0 = { ...card.stats };
    for (const k of Object.keys(s0)) s0[k] = Math.round(s0[k] * 1.5);
    card = { ...card, stats: s0 };
  }
  const potionMeta = POTIONS[Math.floor(r() * POTIONS.length)];
  const scorePoints = rollRewardPoints(run, r, elite);
  // 全类型奖池，洗匀后抽 3 个
  const pool = [
    { kind: 'skill', skill: { id: skillId, lv, uid: `sk-${seed}-${Math.floor(r() * 1e9)}` } },
    { kind: 'card', card },
    { kind: 'potion', potion: { id: potionMeta.id, n: elite ? 3 : 1 } },
    { kind: 'weapon', weapon: { id: 'w-rw-' + Math.floor(r() * 1e9).toString(36), name: randomWeapon(r) } },
    { kind: 'score', points: scorePoints },
  ];
  if (tactic) pool.push({ kind: 'tactic', tactic, power });
  if (elite) {
    pool.push({ kind: 'weapon', weapon: { id: 'w-rw-' + Math.floor(r() * 1e9).toString(36), name: randomWeapon(r) } });
    pool.push({ kind: 'score', points: Math.round(scorePoints * 0.6) });
  }
  const offers = shuffle(pool, r).slice(0, 3);
  return offers;
}
export function applyReward(state, offer) {
  if (!state.run) return;
  if (offer.kind === 'skill') {
    state.run.skillCards = state.run.skillCards || [];
    state.run.skillCards.push(offer.skill);
  } else if (offer.kind === 'tactic' && offer.tactic) {
    const id = offer.tactic.id;
    state.tacticPower = state.tacticPower || {};
    const cur = state.tacticPower[id] || ((state.ownedTactics || []).includes(id) ? 1 : 0);
    if ((offer.power || 1) > cur) {
      state.tacticPower[id] = offer.power || 1;
      if (!(state.ownedTactics || []).includes(id)) state.ownedTactics.push(id);
    }
  } else if (offer.kind === 'score' && offer.points) {
    addScorePoints(state, offer.points);
  } else if (offer.kind === 'potion' && offer.potion) {
    state.run.potions = state.run.potions || [];
    const hit = state.run.potions.find((p) => p.id === offer.potion.id);
    if (hit) hit.n += offer.potion.n || 1;
    else state.run.potions.push({ id: offer.potion.id, n: offer.potion.n || 1 });
  } else if (offer.kind === 'weapon' && offer.weapon) {
    state.weapons = state.weapons || [];
    state.weapons.push(offer.weapon);
  } else if (offer.card && !state.collection.some((c) => c.id === offer.card.id)) {
    grantCard(state, offer.card);
  }
  persist(state);
}

// 锻造：把一张技能卡加到某个角色身上，加完消耗
// 锻造成功率：技能数 a 越多、这个技能已锻次数 b 越多，越容易失败
// p = 0.95 - 0.05a - 0.15b，夹在 [0.15, 0.95]；触到硬上限（10 技能 / 单项 3 锻）时为 0
export function forgeChance(state, characterId, skillCard) {
  const target = state.collection.find((c) => c.id === characterId);
  if (!target || !skillCard) return 0;
  // 已支付给诅咒商人的技能永久归零，不允许再次锻造恢复。
  if (target.lostSkills?.[skillCard.id]) return 0;
  const list = target.skillList || [];
  const existing = list.find((s) => s.id === skillCard.id);
  const a = list.length;
  const b = existing ? (existing.forges || 1) : 0;
  if (!existing && a >= 10) return 0;
  if (existing && b >= 3) return 0;
  const p = 0.95 - 0.05 * a - 0.15 * b;
  return Math.max(0.15, Math.min(0.95, p));
}

// 锻造：消耗技能卡，按成功率判定；失败则卡片消失、不涨熟练度
export function forgeSkill(state, uid, characterId) {
  const run = state.run;
  if (!run) return { ok: false, chance: 0 };
  const idx = (run.skillCards || []).findIndex((s) => s.uid === uid);
  if (idx < 0) return { ok: false, chance: 0 };
  const card = run.skillCards[idx];
  const chance = forgeChance(state, characterId, card);
  if (chance <= 0) return { ok: false, chance: 0 };
  const target = state.collection.find((c) => c.id === characterId);
  target.skillList = target.skillList || [];
  const existing = target.skillList.find((s) => s.id === card.id);
  const success = Math.random() < chance;
  if (success) {
    if (existing) {
      existing.lv += card.lv;
      existing.forges = (existing.forges || 1) + 1;
    } else {
      target.skillList.push({ id: card.id, lv: card.lv, cat: SKILLS[card.id]?.cat, forges: 1, playerDisperse: !!card.playerDisperse });
    }
    if (card.playerDisperse) target.skillList.find((s) => s.id === card.id).playerDisperse = true;
    run.forged = run.forged || [];
    run.forged.push({ charId: target.id, skillId: card.id, lv: card.lv, playerDisperse: !!card.playerDisperse });
  }
  run.skillCards.splice(idx, 1);
  persist(state);
  return { ok: success, chance };
}
export function advanceRun(state, won) {
  const run = state.run;
  if (!run) return;
  if (!won) {
    run.status = 'lost';
    recordRun(state, run, false);
    persist(state);
    return;
  }
  run.wins += 1;
  run.index += 1;
  persist(state);
}

function recordRun(state, run, won) {
  state.records = state.records || [];
  state.records.unshift({
    lane: run.lane || '1A',
    wins: run.wins,
    total: LAYER_COUNT * 7,
    won,
    at: Date.now(),
  });
  state.records = state.records.slice(0, 20);
}
export function addCustomCard(state, card) {
  if (state.collection.some((c) => c.id === card.id)) return false;
  state.collection.push(card);
  if (!state.customCards.some((c) => c.id === card.id)) state.customCards.push(card);
  persist(state);
  return true;
}

// —— 天梯：优先实时抓取，跨域失败时退回快照
// 只在实时接口失败时才下载这份快照（约 90KB），平时不占流量
let ladderSnapshotCache = null;
export async function loadLadder() {
  if (!ladderSnapshotCache) {
    ladderSnapshotCache = await fetchJson('data/ladder.json');
  }
  return { lanes: ladderSnapshotCache.lanes, source: 'snapshot', meta: ladderSnapshotCache.meta };
}
function parseLadderHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table.rankings-table');
  if (!table) throw new Error('未找到排名表');
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const lane = headers.indexOf('1A');
  const rows = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const cells = tr.querySelectorAll('td.member-score');
    const cell = cells[lane - 1] || cells[0];
    if (!cell) continue;
    const a = cell.querySelector('a.team-name');
    const scoreEl = cell.querySelector('a.score');
    if (!a || !scoreEl) continue;
    const lineup = (a.getAttribute('title') || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (!lineup.length) continue;
    const line = lineup[0];
    const at = line.lastIndexOf('@');
    rows.push({
      name: at >= 0 ? line.slice(0, at).trim() : line,
      clan: at >= 0 ? line.slice(at + 1).trim() : '无名',
      score: Number(scoreEl.textContent.replace(/[^\d]/g, '')) || 0,
      rank: Number(tr.querySelector('.rank-number')?.textContent.trim()) || null,
      lineup,
    });
  }
  return rows;
}

// 把天梯成员转成真正的卡牌（走引擎构建）
export function ladderToCards(queue) {
  const cards = [];
  for (const q of queue || []) {
    try {
      const c = makeCard(q.name, q.clan);
      cards.push({ ...c, fromLadder: true, score: q.score, rank: q.rank });
    } catch (e) {
      console.warn('无法为天梯成员建卡', q, e);
    }
  }
  return cards;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// —— 存档导出/导入：加密成一段文本，下载成 .txt
const SAVE_SECRET = 'namerena-cards/v1/local-only';

function xorText(text, key) {
  let out = '';
  for (let i = 0; i < text.length; i++) out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return out;
}

function toB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromB64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

export function exportSaveText(state) {
  // 文本导出与槽位存档共用快照，防止导出遗漏永久代价或装备来源。
  const slim = snapshot(state);
  return `NAMERENA-SAVE-1\n${toB64(xorText(JSON.stringify(slim), SAVE_SECRET))}\n`;
}

export function importSaveText(text, state) {
  const body = text.split('\n').filter((l) => l && !l.startsWith('NAMERENA-SAVE')).join('');
  const data = JSON.parse(xorText(fromB64(body), SAVE_SECRET));
  if (!data || data.v !== 1) throw new Error('存档格式不对');
  return restoreSnapshot(state, data);
}
// 战败：随机掉落一半已锻造技能，返还到角色身上（等级回退，归零则移除）
export function dropForged(state) {
  const run = state.run;
  const list = run?.forged || [];
  if (!list.length) return 0;
  const r = mulberry32((run.seed ^ (run.index * 7919)) >>> 0);
  const order = list.map((item, i) => ({ item, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.item);
  const drop = order.slice(0, Math.ceil(list.length / 2));
  for (const f of drop) {
    const ch = state.collection.find((c) => c.id === f.charId);
    const sk = ch && ch.skillList ? ch.skillList.find((s) => s.id === f.skillId) : null;
    if (sk) {
      sk.lv -= f.lv;
      sk.forges = Math.max(0, (sk.forges || 1) - 1);
      if (sk.lv <= 0) ch.skillList = ch.skillList.filter((s) => s !== sk);
    }
  }
  run.forged = list.filter((f) => !drop.includes(f));
  persist(state);
  return drop.length;
}
// —— 实时天梯 API：https://shenjack.top:10007/api/ladder/{lane}
const LADDER_API = 'https://shenjack.top:10007/api/ladder';

// —— 天梯缓存：每次成功抓到的对手列表存进 localStorage，下次抓不到就用它
const LADDER_CACHE_PREFIX = 'namerena-cards/ladder/';

export function cacheLaneEntries(lane, entries) {
  try {
    localStorage.setItem(
      LADDER_CACHE_PREFIX + lane,
      JSON.stringify({ at: Date.now(), entries }),
    );
  } catch { /* 配额满或隐私模式，忽略 */ }
}

export function loadCachedLaneEntries(lane) {
  try {
    const raw = localStorage.getItem(LADDER_CACHE_PREFIX + lane);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries) || !data.entries.length) return null;
    return { at: data.at || 0, entries: data.entries };
  } catch {
    return null;
  }
}

export async function fetchLaneEntries(lane) {
  const res = await fetch(LADDER_API + '/' + String(lane).toLowerCase() + '?active=1&limit=500', { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.ok === false) throw new Error((data && data.error && data.error.message) || 'api error');
  const entries = (data.entries || []).filter((e) => e.active !== false && Number(e.score) > 0);
  entries.sort((a, b) => Number(a.score) - Number(b.score));
  return entries;
}

export function opponentFromEntry(entry, teamSize) {
  const members = String(entry.name || '').split('+').map((s) => s.trim()).filter(Boolean).slice(0, teamSize || 1);
  const cards = members.map((line) => {
    const at = line.lastIndexOf('@');
    const name = at >= 0 ? line.slice(0, at) : line;
    const clan = at >= 0 ? line.slice(at + 1) : (entry.team || '无名');
    try {
      return makeCard(name, clan);
    } catch {
      return statlessCard(line);
    }
  });
  return {
    rank: entry.rank,
    score: Math.round(Number(entry.score) || 0),
    name: members.length ? members[0].split('@')[0] : String(entry.name || ''),
    cards,
    teamSize: cards.length,
  };
}
