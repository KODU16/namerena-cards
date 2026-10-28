// 入口：加载数据 / 引擎 / 天梯，串起首页 → 开局 → 备战 → 战斗 → 奖励 → 结算。
import { loadEngine, makeCard, hydrateCard, buildLine, applyTactics, applyRunBuff, runMultiplier, engineWasm, iconFor } from './engine.js';
import { Duel, DuelView } from './duel.js';
import * as G from './game.js';
import * as Tracking from './player-data.js';
import * as Saves from './saves.js';
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
  // 药水只在战斗里显示
  const dock = document.getElementById('potion-dock');
  if (dock) dock.style.display = screen === 'battle' ? 'flex' : 'none';
  UI.renderScoreBadge(state, screen === 'map' || screen === 'battle');
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
    onCodex: codex,
    onLog: downloadLog,
  }));
}

function codex() {
  sheet(UI.codexSheet(state));
  document.querySelector('.sheet')?.classList.add('sheet--full');
}

function help() {
  sheet(
    el('h2', {}, '玩法'),
    el('ul', { class: 'help-list' },
      el('li', {}, el('b', {}, '名字即卡牌。'), ' 卡面上的八围、技能与头像全部由 tswn_core 从名字算出；同名同战队永远得到同一张卡。'),
      el('li', {}, el('b', {}, '开局。'), ' 你只决定战队名（不能含 !）；自身名字随机，属性、技能和熟练度都是抽出来的。'),
      el('li', {}, el('b', {}, '每回合。'), ' 从技能组里抽 3 张技能卡和一份能量；主动技点选打出，能量不足的牌会变灰。普通攻击 0 能量、永远可用。'),
      el('li', {}, el('b', {}, '被动自动。'), ' 反击、反弹、护身符不占手牌，满足条件时自行发动；蓄盾则在每回合开始时按熟练度自动累积。'),
      el('li', {}, el('b', {}, '行动节奏。'), ' 每打出一次，对手会立刻应手一次；你也可以点「结束回合」提前收手。双方每回合的行动次数相同。'),
      el('li', {}, el('b', {}, '对手。'), ' 开战前从天梯 1A 抓取：取最底下第一个正分成员作为第一位对手，之后沿排名向上。'),
      el('li', {}, el('b', {}, '地图。'), ' 每层是一张随机有向图：只能往前走，所有路都汇聚到该层名次最高的天梯选手；赢下终点进入下一层，共 10 层。'),
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

// 地图副标题也用一句 Say（复用同一个缓存，1 分钟内不重复请求）
async function loadSayInto(node) {
  if (!node) return;
  if (sayCache.text) node.textContent = sayCache.text;
  if (sayCache.text && Date.now() - sayCache.at < SAY_TTL) return;
  if (sayFetching) return;
  sayFetching = true;
  try {
    const res = await fetch(SAY_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const text = cleanSay(data?.say);
    if (!text) return;
    sayCache = { text, at: Date.now() };
    node.textContent = text;
  } catch { /* 失败就保留现有文案 */ }
  finally { sayFetching = false; }
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

// ————————————————————— 存档槽位（每账号 10 个，优先存服务器）

function runSummary(st) {
  const run = st?.run;
  if (!run || run.status !== 'active') return '';
  const team = (st.collection || []).filter((c) => (run.teamIds || []).includes(c.id)).map((c) => c.name).join('/');
  return `第 ${run.layer || 1} 层 · ${run.index || 0} 战 · ${team || '无队伍'}`;
}

async function openSaves() {
  const paint = async () => {
    const info = await Saves.list();
    const slots = [];
    const bySlot = new Map((info.slots || []).map((s) => [s.slot, s]));
    for (let i = 1; i <= (info.maxSlots || 10); i++) slots.push({ slot: i, entry: bySlot.get(i) || null });
    const hasRun = state.run && state.run.status === 'active';
    const body = el('div', { class: 'save-list' },
      el('p', { class: 'muted small' }, (info.source === 'server'
        ? (info.loggedIn ? '存档保存在账号里，换设备也能读。' : '未登录：临时存在本机浏览器。')
        : '本机存档（服务器存档未启用）。') + ' 每账号最多 ' + (info.maxSlots || 10) + ' 个。'),
      el('div', { class: 'muted small' }, hasRun ? '当前：' + runSummary(state) : '当前没有进行中的局'),
      ...slots.map(({ slot, entry }) => el('div', { class: 'save-row' + (entry ? '' : ' is-empty') },
        el('span', { class: 'save-slot' }, '槽位 ' + slot),
        el('div', { class: 'save-info' },
          el('b', {}, entry ? entry.summary || '（无描述）' : '空'),
          entry ? el('small', {}, new Date(entry.updated_at).toLocaleString()) : null),
        el('div', { class: 'save-ops' },
          entry ? el('button', { class: 'ghost', type: 'button', onclick: async () => {
            const got = await Saves.load(slot);
            if (!got || !G.restoreSnapshot(state, got.payload)) return toast('读档失败', 2000);
            closeSheet();
            toast('已读取槽位 ' + slot, 2000);
            if (state.run && state.run.status === 'active') mapScreen(); else home();
          } }, '读取') : null,
          hasRun ? el('button', { class: 'ghost', type: 'button', onclick: async () => {
            const res = await Saves.save(slot, G.snapshot(state), runSummary(state));
            if (res.source === 'error') return toast(res.message || '存档失败', 2200);
            toast('已存入槽位 ' + slot + (res.source === 'server' ? '（账号）' : '（本机）'), 2000);
            paint();
          } }, '存档') : null,
          entry ? el('button', { class: 'ghost ghost--del', type: 'button', onclick: async () => {
            await Saves.remove(slot);
            paint();
          } }, '删除') : null)),
      ),
    );
    sheet(el('div', {}, el('h2', {}, '存档'), body,
      el('div', { class: 'result__actions' }, el('button', { class: 'primary', type: 'button', onclick: closeSheet }, '关闭'))));
  };
  await paint();
}
function home() {
  duelView = null;
  nav('home', () => UI.renderHome(root, state, {
    versions: { wasm: state.wasm || '0.5.6', core: state.core || '0.7.0' },
    onNewRun: newRunSetup,
    onSaves: openSaves,
    onContinue: () => (state.run?.selectedId ? prep() : mapScreen()),
    onForge: forgeScreen,
  }));
  // 每次回到首页都换一句随机 Say
  loadSayTitle();
}

function safeCard(name, clan) {
  try { return makeCard(name, clan); } catch (e) { console.error(e); return null; }
}

function teamSizeOf(lane) { return Number(String(lane)[0]) || 1; }

function syncDraft() {
  if (!draft) return;
  const size = teamSizeOf(draft.lane);
  draft.names = draft.names || [];
  while (draft.names.length < size) draft.names.push(G.randomName());
  draft.names.length = size;
  const played = (state.records || []).length;
  draft.cards = draft.names.map((n) => {
    const card = n ? safeCard(n, draft.clan || '无名') : null;
    return card ? G.withRunBuff(card, played) : null;
  }).filter(Boolean);
}

function newRunSetup() {
  if (!draft) draft = { clan: '青', lane: '1A', names: [], rerolls: 3 };
  syncDraft();
  nav('newrun', () => UI.renderNewRun(root, state, {
    draft,
    cardBonus: (card) => G.cardBonus(state, card),
    onHome: () => { draft = null; home(); },
    onChangeLane: (lane) => {
      draft.lane = lane;
      syncDraft();
      newRunSetup();
    },
    onChangeClan: (clan) => {
      const raw = String(clan || '').trim().slice(0, 18);
      // 「!」在 tswn 里是测试标记（@!），玩家不能用它当战队名
      const clean = raw.replace(/[!！]/g, '');
      if (clean !== raw) toast('战队名不能包含 !（那是引擎的测试标记）');
      draft.clan = clean;
      syncDraft();
      newRunSetup();
    },
    onRerollRow: (i) => {
      if (draft.rerolls <= 0) return;
      draft.rerolls -= 1;
      draft.names[i] = G.randomName();
      syncDraft();
      newRunSetup();
    },
    onRemoveName: (i) => {
      draft.names[i] = '';
      syncDraft();
      newRunSetup();
    },
    onRefillName: (i) => {
      draft.names[i] = G.randomName();
      syncDraft();
      newRunSetup();
    },
    onRerollAll: () => {
      if (draft.rerolls <= 0) return;
      draft.rerolls -= 1;
      draft.names = draft.names.map(() => G.randomName());
      syncDraft();
      newRunSetup();
    },
    onStart: async () => {
      if (!draft.cards || draft.cards.length < teamSizeOf(draft.lane)) return toast('还有空位，先填满名字');
      await G.startRun(state, {
        seed: Date.now() >>> 0,
        lane: draft.lane || '1A',
        clan: draft.clan || '无名',
        ladder: state.ladder,
        starters: draft.cards,
      });
      draft = null;
      mapScreen();
      toast('新的一局：先选一条路');
      Tracking.startRun(state);
    },
  }));
}
// ————————————————————— 备战

function prep() {
  nav('prep', () => UI.renderPrep(root, state, {
    tacticsByIds: (s, ids) => G.tacticsByIds(s, ids),
    bonusOf: (card) => G.cardBonus(state, card),
    cardBonus: (card) => G.cardBonus(state, card),
    ownedTacticObjects: (s) => G.ownedTacticObjects(s),
    forgeSelected: forgeSel,
    onPickSkillCard: (uid) => { forgeSel = forgeSel === uid ? null : uid; prep(); },
    onBack: () => {
      state.run.selectedId = null;
      G.persist(state);
      mapScreen();
    },
    onEquipWeapon: (weaponId, charId) => {
      const w = G.equipWeapon(state, weaponId, charId);
      if (w) toast('已装备 ' + w.name, 1500);
      prep();
    },
    onUnequip: (charId) => {
      const w = G.unequipWeapon(state, charId);
      if (w) toast('已卸下 ' + w, 1500);
      prep();
    },
    onToggleTeam: (id) => {
      if ((state.run.downed || []).includes(id)) return toast('这名角色已经倒下，本局不能再出战');
      const picked = (state.collection || []).find((c) => c.id === id);
      if (picked && state.run.clan && picked.clan !== state.run.clan) return toast('战队不同：本局只能用 @' + state.run.clan + ' 的角色', 2200);
      const ids = state.run.teamIds;
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else if (ids.length < state.run.teamSize) ids.push(id);
      else return toast('出战人数已满');
      G.persist(state);
      prep();
    },
    onForgeHover: (id, ev) => {
      if (!forgeSel) return;
      const card = (state.run.skillCards || []).find((s) => s.uid === forgeSel);
      const p = G.forgeChance(state, id, card);
      const tone = p <= 0 ? 'red' : p < 0.33 ? 'red' : p <= 0.66 ? 'yellow' : 'green';
      UI.showCursorTip(p > 0 ? '锻造成功率 ' + Math.round(p * 100) + '%' : '已到上限，不能再锻', ev.clientX, ev.clientY, tone);
    },
    onForgeLeave: () => UI.hideTip(),
    onPickChampion: (id) => {
      if (forgeSel) {
        const res = G.forgeSkill(state, forgeSel, id);
        forgeSel = null;
        UI.hideTip();
        toast(res.chance <= 0
          ? '已达上限，不能再锻'
          : res.ok
            ? `锻造成功（${Math.round(res.chance * 100)}%）`
            : `锻造失败（成功率 ${Math.round(res.chance * 100)}%）`);
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
  const opp = G.currentOpponent(state);
  const team = (run.teamIds || []).map((id) => state.collection.find((c) => c.id === id)).filter(Boolean);
  // 对手缺失属于节点数据异常，不能误报为玩家队伍不满。
  if (!team.length) return toast('请选择出战角色');
  if (!opp?.cards?.length) {
    const node = G.currentNode(state);
    logEvent('fight.blocked', { reason: 'missing_opponent', nodeId: node?.id, kind: node?.kind });
    return toast('当前节点没有可用的对手，请返回地图重试');
  }
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
  // 玩家永远是输入里的第一组（input_team_index === 0）；不能拿 initial_states[0] 猜，
  // 引擎可能把 team1 排在前面，猜错就会把「对面赢」当成自己赢。
  const me = initial.initial_states.find((s) => s.input_team_index === 0 && s.owner_id == null)
    || initial.initial_states.find((s) => s.input_team_index === 0)
    || initial.initial_states.find((s) => names.has(s.id_name))
    || initial.initial_states[0];
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
      startHpPct: run.restBuff ? 1.25 : 0,
      onFinish: ({ won, replay }) => finishDuel(won, replay),
    });
  });
  if (run.restBuff) { run.restBuff = false; G.persist(state); }
  duelView.start();
  UI.renderPotionDock(state, usePotion);
}
function potionCode(id) {
  const meta = G.potionById(id);
  return meta ? meta.field + 1 : 0;
}

function usePotion(id) {
  const run = state.run;
  if (!run || !duelView || duelView.done) return;
  const item = (run.potions || []).find((p) => p.id === id && p.n > 0);
  if (!item) return;
  if (duelView.pendingPotion) return toast('这回合已经喝过药水了');
  item.n -= 1;
  duelView.duel.pendingPotion = potionCode(id);
  // 立刻在界面上结算（血条/蓝条），引擎会在这一手出牌时应用同一数值
  const metaNow = G.potionById(id);
  if (metaNow) duelView.previewPotion(metaNow, duelView.waitingState);
  duelView.pendingPotion = potionCode(id);
  G.persist(state);
  UI.renderPotionDock(state, usePotion);
  const meta = G.potionById(id);
  const what = meta && meta.id === 'hp' ? '回复体力' : '提升' + String(meta?.name || '').replace('药水', '');
  toast('喝下' + (meta?.name || '药水') + '：这一手' + what + '（不消耗回合）', 2000);
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
    const lostScore = G.loseScore(state);
    const run = state.run;
    // 这一场出战的人全部倒下，本局不能再上
    run.downed = [...new Set([...(run.downed || []), ...(run.teamIds || [])])];
    run.teamIds = [];
    G.persist(state);
    const usable = state.collection.filter((c) => !run.downed.includes(c.id));
    if (usable.length >= (run.teamSize || 1)) {
      toast((dropped ? '战败：掉落 ' + dropped + ' 项锻造，' : '战败：') + '扣 ' + lostScore + ' 分，换人重试', 2600);
      return prep();
    }
    G.advanceRun(state, false);
    Tracking.finishRun(state, false);
    return nav('end', () => UI.renderEnd(root, state, { onNewRun: newRunSetup, onHome: home }));
  }
  // 赢下这个节点：位置推进过去
  const node = G.clearNode(state);
  if (node && node.kind === 'ladder') {
    const gain = G.addScore(state, node.payload?.score);
    if (gain) toast('天梯 +' + gain + ' 分', 1800);
  }
  if (node) {
    const dropRng = G.mulberry32((state.run.seed ^ (state.run.index * 7919)) >>> 0);
    const dropped = G.maybeDropWeapon(state, node, dropRng);
    if (dropped) toast('掉落武器「' + dropped.name + '」，已放进物品栏', 2400);
  }
  if (node && node.kind === 'end') {
    const finished = G.advanceLayer(state);
    if (finished) {
      Tracking.finishRun(state, true);
      return nav('end', () => UI.renderEnd(root, state, { onNewRun: newRunSetup, onHome: home }));
    }
    toast(`第 ${state.run.layer - 1} 层通过，进入第 ${state.run.layer} 层`, 2600);
    return mapScreen();
  }
  const offers = G.rollRewards(state, (state.run.seed + state.run.index * 7919) >>> 0, node?.kind === 'elite');
  nav('reward', () => UI.renderReward(root, state, offers, {
    onPickOffer: (o) => { G.applyReward(state, o); mapScreen(); },
  }));
}

// ————————————————————— 地图

function openInventory() {
  const reopen = () => {
    sheet(UI.inventorySheet(state, {
      cardBonus: (cc) => G.cardBonus(state, cc),
      onDestroy: (kind, id, label) => {
        const ok = G.destroyItem(state, kind, id);
        toast(ok ? '已销毁 ' + (label || '') : '不能销毁（出战中的角色/无效对象）', 1800);
        return ok;
      },
      onEquipWeapon: (weaponId, charId) => {
        const w = G.equipWeapon(state, weaponId, charId);
        toast(w ? '已装备 ' + w.name : '装备失败', 1600);
        render();
      },
      onUnequip: (charId) => {
        const w = G.unequipWeapon(state, charId);
        toast(w ? '已卸下 ' + w : '没有武器', 1600);
        render();
      },
    }));
    document.querySelector('.sheet')?.classList.add('sheet--full');
  };
  const render = () => {
    const inv = UI.inventorySheet(state, {
      cardBonus: (cc) => G.cardBonus(state, cc),
      onDestroy: (kind, id, label) => {
        const ok = G.destroyItem(state, kind, id);
        toast(ok ? '已销毁 ' + (label || '') : '不能销毁（出战中的角色/无效对象）', 1800);
        return ok;
      },
      onEquipWeapon: (weaponId, charId) => {
        const w = G.equipWeapon(state, weaponId, charId);
        toast(w ? '已装备 ' + w.name : '装备失败', 1600);
        reopen();
      },
      onUnequip: (charId) => {
        const w = G.unequipWeapon(state, charId);
        toast(w ? '已卸下 ' + w : '没有武器', 1600);
        reopen();
      },
    });
    overlay.replaceChildren(el('div', { class: 'sheet sheet--full' }, inv));
    overlay.classList.remove('hidden');
  };
  reopen();
}

// 篝火锻造：先选角色，再选技能
const FORGE_STATS = [['hp', '体力'], ['atk', '攻'], ['def', '防'], ['spd', '速'], ['agi', '敏'], ['mag', '魔'], ['res', '抗'], ['wis', '智']];

function forgeAtCamp() {
  const pick = (charId) => {
    const card = state.collection.find((c) => c.id === charId);
    sheet(el('div', {}, el('h2', {}, '锻造 ' + (card?.name || '')), el('div', { class: 'inv__grid' }, FORGE_STATS.map(([key, label]) => el('button', {
      class: 'ghost inv__item',
      type: 'button',
      onclick: () => {
        const res = G.campForgeStat(state, charId, key);
        closeSheet();
        toast(res ? label + ' ' + res.from + ' → ' + res.to + '（×1.1 基础值）' : '锻造失败', 2400);
        mapScreen();
      },
    }, el('b', {}, label), el('small', {}, '基础 ' + (card?.stats?.[key] ?? '?'))))), el('h2', {}, '或者锻造一个技能'),
      el('div', { class: 'inv__grid' }, (card?.skillList || []).map((s) => el('button', {
        class: 'ghost inv__item',
        type: 'button',
        onclick: () => {
          const res = G.campForge(state, charId, s.id);
          closeSheet();
          toast(res ? (skillMetaName(s.id) + ' 锻造完成：熟练度 ' + res.lv + '，消耗 ×' + res.mpMul.toFixed(2)) : '锻造失败', 2400);
          mapScreen();
        },
      }, el('b', {}, skillMetaName(s.id)), el('small', {}, '熟练度 ' + s.lv + (s.forge ? (' · 已锻 ' + s.forge + ' 次') : ''))))),
    ));
  };
  sheet(el('div', {}, el('h2', {}, '选一个角色锻造'),
    el('div', { class: 'inv__grid' }, state.collection.map((card) => el('button', {
      class: 'ghost inv__item',
      type: 'button',
      onclick: () => pick(card.id),
    }, el('b', {}, card.name + '@' + card.clan), el('small', {}, (card.skillList || []).length + ' 个技能'))))));
}

function skillMetaName(id) { return skillMeta(id).name; }

function mapScreen() {
  const run = state.run;
  if (!run?.graph) return nav('end', () => UI.renderEnd(root, state, { onNewRun: newRunSetup, onHome: home }));
  nav('map', () => UI.renderMap(root, state, {
    onHome: home,
    say: sayCache.text,
    onInventory: openInventory,
    onPick: (nodeId) => {
      const node = state.run.graph.byId.get(nodeId);
      if (node?.kind === 'cpu') {
        G.enterCamp(state, nodeId);
        const cpu = node.payload;
        const openCpu = () => {
          const prefixInput = el('input', { id: 'cpu-prefix', placeholder: '输入前缀，例如 123', maxlength: '8', autocomplete: 'off' });
          const out = el('div', { class: 'cpu-result' });
          const run = () => {
            const prefix = prefixInput.value.trim();
            if (!prefix || /\s/.test(prefix)) { toast('前缀不能为空，也不能带空格', 1600); return; }
            const startAt = 1000 + Math.floor(Math.random() * 9000);
            out.replaceChildren(el('div', { class: 'muted' }, '正在测号…'));
            setTimeout(() => {
              const res = G.cpuScan(prefix, startAt, cpu, state.run.clan || '无名');
              if (!res) { out.replaceChildren(el('div', { class: 'error' }, '没有扫到可用名字')); return; }
              if (!state.collection.some((c) => c.name === res.card.name)) G.grantCard(state, res.card);
              out.replaceChildren(
                el('div', { class: 'muted small' }, '扫描 ' + res.scanned + ' 个名字（' + prefix + startAt + ' ~ ' + prefix + (startAt + cpu.speed) + '）'),
                UI.charRowEl(res.card),
                el('div', { class: 'muted small' }, '已加入角色库：' + res.name + '（八围 ' + res.sum + '）'));
              toast('测号完成：' + res.name, 2000);
            }, 30);
          };
          const sheetNode = el('div', {},
            el('h2', {}, 'CPU：' + cpu.name + '-' + cpu.speed),
            el('div', { class: 'cpu-form' }, prefixInput,
              el('button', { class: 'primary', type: 'button', onclick: run }, '测号')),
            out,
            el('div', { class: 'result__actions' }, el('button', { class: 'ghost', type: 'button', onclick: () => { closeSheet(); mapScreen(); } }, '离开')));
          sheet(sheetNode);
        };
        openCpu();
        return;
      }
      if (node?.kind === 'shop') {
        const openShop = () => {
          const items = G.rollShop(state, (state.run.seed ^ (state.run.layer * 2654435761) ^ 0x51ed270b) >>> 0, state.run.layer);
          const body = el('div', { class: 'inv__grid' }, items.map((it) => el('div', { class: 'inv__item' },
            el('b', {}, it.kind === 'skill' ? '技能卡 ' + skillMeta(it.skill.id).name
              : it.kind === 'card' ? '角色 ' + it.card.name + '@' + it.card.clan
                : it.kind === 'weapon' ? '武器 ⚔ ' + it.weapon.name
                  : it.kind === 'potion' ? '药水 ' + (G.potionById(it.potion.id) || {}).name
                    : '战术 ' + (it.tactic?.name || '')),
            el('small', {}, it.price + ' 分'),
            el('button', {
              class: 'ghost', type: 'button', disabled: (state.run.score || 0) < it.price,
              onclick: () => {
                if (G.buyShopItem(state, it)) { toast('购买成功：' + it.price + ' 分', 1600); openShop(); }
                else toast('分数不够', 1400);
              },
            }, '购买'))));
          sheet(el('div', {}, el('h2', {}, '商店'), el('p', { class: 'muted' }, '当前分数 ' + Math.round(state.run.score || 0)), body,
            el('div', { class: 'result__actions' }, el('button', { class: 'primary', type: 'button', onclick: () => { closeSheet(); mapScreen(); } }, '离开'))));
        };
        G.enterCamp(state, nodeId);
        openShop();
        return;
      }
      if (node?.kind === 'camp') {
        sheet(el('div', { class: 'result result--win' },
          el('div', { class: 'result__kicker' }, 'CAMP'),
          el('h2', {}, '篝火'),
          el('p', { class: 'muted' }, '坐下来做点什么？')),
          el('div', { class: 'result__actions' },
            el('button', { class: 'primary', type: 'button', onclick: () => {
              closeSheet();
              G.enterCamp(state, nodeId);
              G.campRest(state);
              toast('休息好了：下一场以 125% 体力开场', 2400);
              mapScreen();
            } }, '休息'),
            el('button', { class: 'secondary', type: 'button', onclick: () => {
              closeSheet();
              G.enterCamp(state, nodeId);
              forgeAtCamp();
            } }, '锻造'),
          ),
        );
        return;
      }
      if (node?.kind === 'event') {
        const res = G.enterEvent(state, nodeId);
        if (!res) return;
        sheet(
          el('div', { class: 'result result--win' },
            el('div', { class: 'result__kicker' }, 'EVENT'),
            el('h2', {}, '发现补给'),
            el('p', { class: 'muted' }, `获得 ${res.label}（自动生效，无需选择）`),
          ),
          el('div', { class: 'result__actions' },
            el('button', { class: 'primary', type: 'button', onclick: () => { closeSheet(); mapScreen(); } }, '继续前进'),
          ),
        );
        return;
      }
      if (!G.selectNode(state, nodeId)) return;
      prep();
    },
  }));
  loadSayInto(document.getElementById('map-say'));
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
      UI.charRowEl(card),
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
  Tracking.init(state);
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
