// 局内状态、爬塔流程与存档。
import { makeCard, iconFor } from './engine.js';
import { buildLayerGraph, LAYER_COUNT } from './map.js';
import { SKILLS, SKILL_IDS, skillMeta } from './skills.js';

export const POTIONS = [
  { id: 'atk', name: '力量药水', field: 0, color: '#d94b3a' },
  { id: 'def', name: '铁壁药水', field: 1, color: '#3b6fd9' },
  { id: 'spd', name: '疾风药水', field: 2, color: '#2fa36b' },
  { id: 'agi', name: '灵巧药水', field: 3, color: '#d9a13a' },
  { id: 'mag', name: '魔力药水', field: 4, color: '#8a5cd9' },
  { id: 'res', name: '抗性药水', field: 5, color: '#3aa8a3' },
  { id: 'wis', name: '智慧药水', field: 6, color: '#d97b3a' },
  { id: 'hp', name: '生命药水', field: 8, color: '#c0353a' },
];

export function potionById(id) { return POTIONS.find((p) => p.id === id) || null; }

const SAVE_KEY = 'namerena-cards/v1';
const MAX_ENCOUNTERS = 8;

const mulberry32 = (a) => () => {
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
    state.customCards = (s.customCards || []).map((c) => hydrateSaved(c)).filter(Boolean);
    if (s.run && s.run.status === 'active') {
      if (!s.run.graph) s.run.status = 'lost'; // 旧存档没有地图，直接结束这一局
      s.run.tacticIds = s.run.tacticIds || [];
      state.run = s.run;
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
    ...c,
    icon: c.icon || iconFor(c.name, c.clan),
    skillList: (c.skillList || []).map((s) => ({ ...s, cat: s.cat || SKILLS[s.id]?.cat || 'atk' })),
  };
}

export function persist(state) {
  try {
    const slim = (c) => ({ id: c.id, name: c.name, clan: c.clan, stats: c.stats, skillList: c.skillList, icon: c.icon, cost: c.cost, tier: c.tier, winrate: c.winrate, flavor: c.flavor, custom: c.custom });
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      best: state.best,
      records: state.records || [],
      collection: state.collection.map(slim),
      ownedTactics: state.ownedTactics,
      tacticPower: state.tacticPower || {},
      customCards: state.customCards.map(slim),
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
    layer: 1,
    status: 'active',
    createdAt: Date.now(),
    teamIds: [],
    downed: [],
    tacticIds: [],
    potions: [],
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
    collection.push({ ...card });
  }
  state.collection = collection;
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
  });
  run.nodeId = run.graph.startId;
  run.selectedId = null;
  run.cleared = [];
  return run.graph;
}

// 随机 @! 队名的填充队伍（TestEx），人数 = 出战人数
export function makeFiller(teamSize, rng) {
  const cards = [];
  for (let i = 0; i < Math.max(1, teamSize); i++) {
    try {
      cards.push(makeCard(randomName(rng), '!'));
    } catch {
      cards.push(statlessCard(randomName(rng) + '@!'));
    }
  }
  return cards;
}

function statlessCard(line) {
  return { id: line, name: line, clan: '', stats: { hp: 200, atk: 20, def: 20, spd: 100, agi: 20, mag: 20, res: 20, wis: 20 }, skillList: [], icon: '' };
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
  const node = currentNode(state);
  if (!node) return null;
  if (node.kind === 'ladder') return node.payload;
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
  if (node && (node.kind === 'ladder' || node.kind === 'filler')) run.wins += 1;
  persist(state);
  return node;
}

// 事件节点（?）：不战斗，随机拿一张战术/名字/技能卡，自动生效
export function enterEvent(state, nodeId) {
  const run = state.run;
  if (!run?.graph) return null;
  const from = run.graph.byId.get(run.nodeId);
  if (!from?.next.includes(nodeId)) return null;
  run.selectedId = nodeId;
  clearNode(state);
  const r = mulberry32((run.seed ^ (run.index * 40503) ^ 0x5f3759df) >>> 0);
  const offers = rollRewards(state, (run.seed ^ (run.index * 2654435761)) >>> 0);
  const pick = offers[Math.floor(r() * offers.length)];
  applyReward(state, pick);
  // 结果文案
  let label = '一件补给';
  if (pick.kind === 'skill') label = '技能卡「' + skillMeta(pick.skill.id).name + '」熟练度' + pick.skill.lv;
  else if (pick.kind === 'tactic') label = '战术卡「' + pick.tactic.name + '」';
  else if (pick.card) label = '角色卡「' + pick.card.name + '@' + pick.card.clan + '」';
  persist(state);
  return { kind: pick.kind, label };
}

// 终点打完 → 进入下一层；返回 true 表示整座塔通关
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
  return { ...t, power: p, apply: { ...t.apply, attrs, skills } };
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

// —— 奖励：两张卡二选一 —— 随机技能卡（进锻造）或随机角色
export function rollRewards(state, seed) {
  const r = mulberry32(seed);
  const run = state.run;
  const progress = Math.min(1, Math.max(0, ((run.layer || 1) - 1) / Math.max(1, LAYER_COUNT - 1)));
  // 角色：必须是本战队（开局选的战队名）
  let card = null;
  for (let i = 0; i < 20; i++) {
    const candidate = makeCard(randomName(r), run.clan || '青');
    if (!state.collection.some((c) => c.id === candidate.id)) { card = candidate; break; }
  }
  // 技能卡：净化是敌人专属；排名越靠上，熟练度越高
  const skills = SKILL_IDS.filter((id) => id !== 'skldisperse');
  const skillId = skills[Math.floor(r() * skills.length)];
  const lv = Math.round(10 + progress * 55 + r() * 25);
  const power = Math.round((1 + progress * 0.9 + r() * 0.25) * 10) / 10;
  const tacticPool = (state.tacticsPool || []).filter(
    (t) => !(state.ownedTactics || []).includes(t.id) || (state.tacticPower?.[t.id] || 1) < power,
  );
  const tactic = tacticPool.length ? tacticPool[Math.floor(r() * tacticPool.length)] : null;
  const offers = [
    { kind: 'skill', skill: { id: skillId, lv, uid: `sk-${seed}-${Math.floor(r() * 1e9)}` } },
  ];
  if (tactic) offers.push({ kind: 'tactic', tactic, power });
  offers.push({ kind: 'card', card });
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
  } else if (offer.card && !state.collection.some((c) => c.id === offer.card.id)) {
    state.collection.push({ ...offer.card });
  }
  persist(state);
}

// 锻造：把一张技能卡加到某个角色身上，加完消耗
// 锻造成功率：技能数 a 越多、这个技能已锻次数 b 越多，越容易失败
// p = 0.95 - 0.05a - 0.15b，夹在 [0.15, 0.95]；触到硬上限（10 技能 / 单项 3 锻）时为 0
export function forgeChance(state, characterId, skillCard) {
  const target = state.collection.find((c) => c.id === characterId);
  if (!target || !skillCard) return 0;
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
      target.skillList.push({ id: card.id, lv: card.lv, cat: SKILLS[card.id]?.cat, forges: 1 });
    }
    run.forged = run.forged || [];
    run.forged.push({ charId: target.id, skillId: card.id, lv: card.lv });
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
  const slim = {
    v: 1,
    records: state.records || [],
    collection: state.collection.map((c) => ({ id: c.id, name: c.name, clan: c.clan, stats: c.stats, skillList: c.skillList, icon: c.icon, cost: c.cost, custom: c.custom })),
    customCards: (state.customCards || []).map((c) => ({ id: c.id, name: c.name, clan: c.clan, stats: c.stats, skillList: c.skillList, icon: c.icon, custom: true })),
    ownedTactics: state.ownedTactics,
    run: state.run,
  };
  return `NAMERENA-SAVE-1\n${toB64(xorText(JSON.stringify(slim), SAVE_SECRET))}\n`;
}

export function importSaveText(text, state) {
  const body = text.split('\n').filter((l) => l && !l.startsWith('NAMERENA-SAVE')).join('');
  const data = JSON.parse(xorText(fromB64(body), SAVE_SECRET));
  if (!data || data.v !== 1) throw new Error('存档格式不对');
  state.records = data.records || [];
  state.collection = (data.collection || []).map(hydrateSaved).filter(Boolean);
  state.customCards = (data.customCards || []).map(hydrateSaved).filter(Boolean);
  state.ownedTactics = data.ownedTactics || [];
  state.run = data.run || null;
  persist(state);
  return true;
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