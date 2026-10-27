// 入口：加载数据 / 引擎 / 天梯，串起首页 → 开局 → 备战 → 战斗 → 奖励 → 结算。
import { loadEngine, makeCard, hydrateCard, buildLine, applyTactics, applyRunBuff, runMultiplier, engineWasm, iconFor } from './engine.js';
import { Duel, DuelView } from './duel.js';
import * as G from './game.js';
import * as UI from './ui.js';
import { el, cardEl, renderBattleShell, sleep, statLine } from './ui.js';
import { skillMeta } from './skills.js';

const LOG = [];
function logEvent(kind, data) {
  try {
    LOG.push({ t: new Date().toISOString(), kind, data });
    if (LOG.length > 3000) LOG.shift();
  } catch { /* ignore */ }
}
window.__ncLog = LOG;

function downloadLog() {
  const text = LOG.map((e) => '[' + e.t + '] ' + e.kind + ' ' + JSON.stringify(e.data)).join('\n');
  const blob = new Blob([text || '(empty)'], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'namerena-log-' + Date.now() + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

const state = G.createState();
let current = 'home';
let duelView = null;
let forgeSel = null;
let draft = null;

const root = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const toastEl = document.getElementById('toast');

function toast(msg, ms = 1900) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('is-on'), ms);
}

function nav(screen, render) {
  current = screen;
  document.body.dataset.screen = screen;
  render();
  paintTopbar();
}

function sheet(...kids) {
  overlay.replaceChildren(el('div', { class: 'sheet' }, ...kids));
  overlay.classList.remove('hidden');
}

function closeSheet() {
  overlay.classList.add('hidden');
  overlay.replaceChildren();
}

overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });

// ————————————————————— 页头

function paintTopbar() {
  const slot = document.getElementById('topbar-slot');
  if (!slot) return;
  slot.replaceChildren(UI.topbar(state, {
    screen: current,
    onHome: () => { if (!duelView) home(); },
    onHelp: help,
    onLog: downloadLog,
  }));
}

function help() {
  sheet(
    el('h2', {}, '玩法'),
    el('ul', { class: 'help-list' },
      el('li', {}, el('b', {}, '名字即卡牌。'), ' 卡面上的八围、技能与头像全部由 tswn_core 从名字算出；同名同战队永远得到同一张卡。'),
      el('li', {}, el('b', {}, '开局。'), ' 你只决定战队名；自身名字随机，因此属性、技能和熟练度都是抽出来的。'),
      el('li', {}, el('b', {}, '每回合。'), ' 从技能组里抽 3 张技能卡和一份能量；主动技点选打出，能量不足的牌会变灰。普通攻击 0 能量、永远可用。'),
      el('li', {}, el('b', {}, '被动自动。'), ' 反击、反弹、护身符不占手牌，满足条件时自行发动；蓄盾则在每回合开始时按熟练度自动累积。'),
      el('li', {}, el('b', {}, '行动节奏。'), ' 每打出一次，对手会立刻应手一次；你也可以点「结束回合」提前收手。双方每回合的行动次数相同。'),
      el('li', {}, el('b', {}, '对手。'), ' 开战前从天梯 1A 抓取：取最底下第一个正分成员作为第一位对手，之后沿排名向上。'),
      el('li', {}, el('b', {}, '胜负。'), ' 一方角色被击倒即结束。赢满 8 场通关，每胜一场三选一补强卡组。'),
    ),
    el('p', { class: 'muted small' }, `引擎 tswn_core ${state.core || '0.7.0'} / wasm ${state.wasm || '0.5.6'} · 战斗规则为本作实现的回合制，八围与技能来自引擎构建结果。`),
    el('button', { class: 'primary', type: 'button', onclick: closeSheet }, '知道了'),
  );
}

// ————————————————————— 首页 / 开局

// 首页标题：抽一句 tswn 的「随机 Say」（接口 no-store、允许跨域）
const SAY_URL = 'https://shenjack.top:10007/api/say/random';

function cleanSay(raw) {
  return String(raw || '')
    // QQ 表情三种写法 + 全角括号，统一去掉
    .replace(/[[［]表情[:：]\d+[\]］]/g, '')
    .replace(/[[［]face[:：]\d+[\]］]/gi, '')
    .replace(/[[［]CQ:face,id=\d+[\]］]/gi, '')
    .replace(/[[［]图片[\]］]/g, '[图]')
    .replace(/\s+/g, ' ')
    .trim();
}

// 一分钟只抽一次：缓存最近一次 Say，过期才重新请求
const SAY_TTL = 60 * 1000;
let sayCache = { text: '', at: 0 };
let sayFetching = false;

function applySay(node, text) {
  if (!node) return;
  if (text.length > 34) text = text.slice(0, 34) + '…';
  node.textContent = text;
  node.classList.toggle('home__title--say', text.length > 14);
}

async function loadSayTitle() {
  const node = document.getElementById('home-title');
  if (!node) return;                      // 不在首页就不抽
  if (sayCache.text && Date.now() - sayCache.at < SAY_TTL) {
    applySay(node, sayCache.text);        // 一分钟内复用
    return;
  }
  if (sayFetching) return;
  sayFetching = true;
  try {
    const res = await fetch(SAY_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || data.ok === false) return;
    const text = cleanSay(data.say);
    if (!text) return;
    sayCache = { text, at: Date.now() };
    applySay(node, text);
  } catch { /* 抽不到就保留当前标题 */ }
  finally { sayFetching = false; }
}

// 首页停留期间每分钟自动换一句（每 10 秒检查一次是否过期）
setInterval(() => { loadSayTitle(); }, 10 * 1000);

function home() {
  duelView = null;
  nav('home', () => UI.renderHome(root, state, {
    versions: { wasm: state.wasm || '0.5.6', core: state.core || '0.7.0' },
    onNewRun: newRunSetup,
    onContinue: () => prep(),
    onForge: forgeScreen,
  }));
  // 每次回到首页都换一句随机 Say
  loadSayTitle();
}

function safeCard(name, clan) {
  try { return makeCard(name, clan); } catch (e) { console.error(e); return null; }
}

function newRunSetup() {
  if (!draft) draft = { clan: '青', name: G.randomName(), rerolls: 2, card: null, lane: '1A' };
  if (!draft.card || draft.card.name !== draft.name || draft.card.clan !== draft.clan) {
    draft.card = safeCard(draft.name, draft.clan);
  }
  nav('newrun', () => UI.renderNewRun(root, state, {
    draft,
    onHome: () => { draft = null; home(); },
    onChangeLane: (lane) => { draft.lane = lane; newRunSetup(); },
    onChangeClan: (clan) => {
      draft.clan = String(clan || '').trim().slice(0, 18);
      draft.card = safeCard(draft.name, draft.clan || '无名');
      newRunSetup();
    },
    onReroll: () => {
      if (draft.rerolls <= 0) return;
      draft.rerolls -= 1;
      draft.name = G.randomName();
      draft.card = safeCard(draft.name, draft.clan || '无名');
      newRunSetup();
    },
    onStart: async () => {
      if (!draft.card) return toast('这个名字无法构建，先重抽一个');
      await G.startRun(state, {
        seed: Date.now() >>> 0,
        lane: draft.lane || '1A',
        clan: draft.clan || '无名',
        ladder: state.ladder,
        starters: draft.card ? [draft.card] : [],
      });
      draft = null;
      prep();
      toast('新的一局，从天梯最底下开始');
    },
  }));
}

// ————————————————————— 备战

function prep() {
  nav('prep', () => UI.renderPrep(root, state, {
    tacticsByIds: (s, ids) => G.tacticsByIds(s, ids),
    ownedTacticObjects: (s) => G.ownedTacticObjects(s),
    forgeSelected: forgeSel,
    onPickSkillCard: (uid) => { forgeSel = forgeSel === uid ? null : uid; prep(); },
    onToggleTeam: (id) => {
      const ids = state.run.teamIds;
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else if (ids.length < state.run.teamSize) ids.push(id);
      else return toast('出战人数已满');
      G.persist(state);
      prep();
    },
    onPickChampion: (id) => {
      if (forgeSel) {
        const ok = G.forgeSkill(state, forgeSel, id);
        forgeSel = null;
        toast(ok ? '锻造完成' : '锻造失败');
        prep();
        return;
      }
      state.run.championId = id;
      G.persist(state);
      prep();
    },
    onToggleTactic: (id) => {
      const ids = state.run.tacticIds;
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else if (ids.length < 2) ids.push(id);
      else return toast('最多挂 2 张战术卡');
      G.persist(state); prep();
    },
    onFight: fight,
  }));
}

// ————————————————————— 战斗

async function fight() {
  const run = state.run;
  const opp = run.opponents[run.index];
  const team = (run.teamIds || []).map((id) => state.collection.find((c) => c.id === id)).filter(Boolean);
  if (!team.length || !opp) return toast('队伍还没满');
  const tactics = G.tacticsByIds(state, run.tacticIds);
  const mult = runMultiplier(run.index);
  // 每场都换种子：同一关重试、同一队伍再打，对手的行动序列也不会固定
  G.rollBattleSeed(run);
  G.persist(state);
  logEvent('fight.seed', { seed: G.battleSeed(run), index: run.index, lane: run.lane });
  const lines = team.map((c) => buildLine(applyRunBuff(applyTactics(c, tactics), mult)));
  const oppLines = (opp.cards || []).map((c) => buildLine(c));
  const input = [...lines, '', ...oppLines, `seed:${G.battleSeed(run)}@!`].join('\n');
  const wasm = engineWasm();
  let initial;
  try {
    initial = wasm.battle_replay_forced(input, [], { include_icons: false, max_rounds: 20000 });
  } catch (e) {
    console.error(e);
    return toast(`这场对局无法开始：${e.message || e}`);
  }
  const names = new Set(team.map((c) => c.name));
  const me = initial.initial_states.find((s) => names.has(s.id_name)) || initial.initial_states[0];
  logEvent('fight.initial', { playerTeam: me?.team_index, states: initial.initial_states.map((s) => ({ id: s.id, name: s.id_name, team: s.team_index, hp: s.max_hp, skills: s.skills })) });
  logEvent('fight.initial', {
    playerTeam: me?.team_index,
    teamNames: team.map((c) => c.name),
    states: initial.initial_states.map((s) => ({ id: s.id, name: s.id_name, team: s.team_index, hp: s.max_hp, skills: s.skills })),
  });
  const duel = new Duel({ wasm, iconFor }, { input, playerTeam: me.team_index, champion: team[0], team });
  nav('battle', () => {
    renderBattleShell(root, state, null, {
      onSpeed: (x) => {
        if (duelView) {
          if (x === 'manual') duelView.manual = true;
          else { duelView.manual = false; duelView.speed = x; }
        }
        document.querySelectorAll('.speed').forEach((b) => b.classList.toggle('is-active', b.dataset.speed === String(x)));
      },
      onSkip: () => { if (duelView) duelView.skip = true; },
    });
    duelView = new DuelView(root, duel, {
      seed: G.battleSeed(run),
      onFinish: ({ won, replay }) => finishDuel(won, replay),
    });
  });
  duelView.start();
}
function showSettleBar(won) {
  let bar = document.getElementById('settle-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'settle-bar';
    bar.className = 'settle-bar';
    document.getElementById('app').append(bar);
  }
  bar.replaceChildren(el('button', { class: 'primary', type: 'button', onclick: () => { bar.remove(); afterBattle(won); } }, '结算'));
}

async function finishDuel(won, replay) {
  const me = replay.final_states.find((s) => s.team_index === duelView.duel.playerTeam);
  const foe = replay.final_states.find((s) => s.team_index !== duelView.duel.playerTeam);
  await sleep(500);
  sheet(
    el('div', { class: `result ${won ? 'result--win' : 'result--lose'}` },
      el('div', { class: 'result__kicker' }, won ? 'VICTORY' : 'DEFEAT'),
      el('h2', {}, won ? '击倒对手' : '你被击倒'),
      el('p', { class: 'muted' }, won
        ? `共 ${replay.frames.length} 帧 · 你剩余 ${Math.max(0, Math.round(me?.hp ?? 0))} 体力`
        : `共 ${replay.frames.length} 帧 · 对手剩余 ${Math.max(0, Math.round(foe?.hp ?? 0))} 体力`),
    ),
    el('div', { class: 'result__actions' },
      el('button', { class: 'secondary', type: 'button', onclick: () => { closeSheet(); showSettleBar(won); } }, '浏览战斗数据'),
      el('button', { class: 'primary', type: 'button', onclick: () => { closeSheet(); afterBattle(won); } }, won ? '直接结算' : '看看结果'),
    ),
  );
}
function afterBattle(won) {
  duelView = null;
  if (!won) {
    const dropped = G.dropForged(state);
    const run = state.run;
    if (state.collection.length >= (run?.teamSize || 1)) {
      toast(dropped ? `战败：掉落 ${dropped} 项锻造，换人重试` : '战败：换人重试', 2600);
      G.persist(state);
      return prep();
    }
    G.advanceRun(state, false);
    return nav('end', () => UI.renderEnd(root, state, { onNewRun: newRunSetup, onHome: home }));
  }
  G.advanceRun(state, true);
  if (state.run.status === 'won') {
    return nav('end', () => UI.renderEnd(root, state, { onNewRun: newRunSetup, onHome: home }));
  }
  const offers = G.rollRewards(state, (state.run.seed + state.run.index * 7919) >>> 0);
  nav('reward', () => UI.renderReward(root, state, offers, {
    onPickOffer: (o) => { G.applyReward(state, o); prep(); },
  }));
}
// ————————————————————— 工坊

function forgeScreen() {
  nav('forge', () => UI.renderForge(root, state, {
    onHome: home,
    onForgeBuild: buildForgeCard,
  }));
}

function buildForgeCard() {
  const nameEl = document.getElementById('forge-name');
  const clanEl = document.getElementById('forge-clan');
  const box = document.getElementById('forge-result');
  const name = nameEl.value.trim();
  const clan = clanEl.value.trim() || '无名';
  if (!name) return toast('先写一个名字');
  try {
    const card = makeCard(name, clan);
    box.replaceChildren(
      cardEl(card, { size: 'big' }),
      el('div', { class: 'forge__meta' },
        el('div', { class: 'muted' }, statLine(card)),
        el('div', { class: 'skills-full' }, (card.skillList || []).map((s) =>
          el('span', { class: `skill-tag cat-${s.cat}`, title: skillMeta(s.id).desc }, `${skillMeta(s.id).name} ${s.lv}`))),
        el('button', { class: 'primary', type: 'button', onclick: () => {
          const ok = G.addCustomCard(state, card);
          toast(ok ? '已加入卡组' : '卡组里已经有它了');
        } }, '加入卡组'),
      ),
    );
  } catch (e) {
    box.replaceChildren(el('p', { class: 'error' }, `这个名字没能成型：${e.message || e}`));
  }
}

// ————————————————————— 启动

async function boot() {
  document.getElementById('app').classList.add('is-loading');
  try {
    // 卡池已改为按名字现算，不再下载 cards.json；天梯快照也改成按需下载
    const tacticsRes = await fetch('data/tactics.json', { cache: 'no-cache' }).then((r) => r.json());
    state.tacticsPool = tacticsRes.tactics;
    const v = await loadEngine();
    state.wasm = v.wasm; state.core = v.core;
    G.loadSave(state);
    state.ladder = null;
    state.ladderSource = 'live';
    home();
    loadSayTitle();
  } catch (e) {
    console.error(e);
    root.replaceChildren(el('div', { class: 'boot-error' },
      el('h1', {}, '加载失败'),
      el('p', {}, String(e && e.message || e)),
      el('p', { class: 'muted' }, '页面需要通过 http(s) 打开（GitHub Pages 或本地静态服务器）。直接双击 file:// 会因浏览器限制读不到 wasm。'),
    ));
  } finally {
    document.getElementById('app').classList.remove('is-loading');
    window.__namerenaBooted = true;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closeSheet();
  if (current !== 'battle' || !duelView?.interactive) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    const buttons = [...document.querySelectorAll('#battle-hand .hcard')].filter((b) => !b.disabled);
    const target = buttons[n - 1];
    if (target) target.click();
  }
});

window.__nc = { state, get duel() { return duelView?.duel; }, get view() { return duelView; }, G, engineWasm, buildLine, applyTactics, drawHand: (s, r, n, e) => import('./duel.js').then((m) => m.drawHand(s, r, n, e)) };

boot();
