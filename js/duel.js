// 引擎驱动的对决层：行动顺序、伤害、状态、召唤全部由 tswn Runtime 执行，
// 前端只负责「轮到玩家单位时，从手牌里选一张写进强制队列」。
import { el, sleep, handCardEl } from './ui.js';
import { emojiImg } from './emoji.js';
import { skillMeta } from './skills.js';
import { playSkillFX } from './fx.js';

const ACTIVE_ID = {
  sklfire: 0, sklice: 1, sklthunder: 2, sklquake: 3, sklabsorb: 4, sklpoison: 5, sklrapid: 6,
  sklcritical: 7, sklhalf: 8, sklexchange: 9, sklberserk: 10, sklcharm: 11, sklhaste: 12,
  sklslow: 13, sklcurse: 14, sklheal: 15, sklrevive: 16, skldisperse: 17, skliron: 18,
  sklcharge: 19, sklaccumulate: 20, sklassassinate: 21, sklsummon: 22, sklclone: 23, sklshadow: 24,
};
export const NORMAL_ID = 255;

export const previewCost = (lv) => (lv >= 45 ? 3 : lv >= 15 ? 2 : 1);
const weightOf = (lv) => 1 + lv / 6;

// 引擎 state 里的技能名是 `core.skill.fire` 这种导出名，转成 overlay 的 sklfire
function skillsOf(unit, champion) {
  const raw = unit?.skills;
  if (Array.isArray(raw) && raw.length) {
    const list = raw.map(([name, lv]) => {
      const key = String(name).replace(/^core\.skill\./, '');
      const id = `skl${key}`;
      return ACTIVE_ID[id] != null ? { id, lv } : null;
    }).filter(Boolean);
    if (list.length) return list;
  }
  return champion?.skillList || [];
}

// MP 消耗在“抽到这张牌”的时候就掷好（tswn 原本是行动时现掷），范围 8~23
export const rollMpCost = (rng) => 8 + (Math.floor(rng() * 256) & 15);

export function drawHand(skills, rng, count = 3, exclude = null) {
  // 净化是敌人专属：玩家抽到时直接换成别的技能（熟练度不变）
  const pool = (skills || [])
    .filter((s) => ACTIVE_ID[s.id] != null && s.id !== 'skldisperse')
    .filter((s) => !exclude || !exclude.has(s.id))
    .map((s) => ({ ...s, weight: weightOf(s.lv) }));
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((a, b) => a + b.weight, 0);
    let x = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { x -= pool[idx].weight; if (x <= 0) break; }
    idx = Math.min(idx, pool.length - 1);
    const [picked] = pool.splice(idx, 1);
    out.push({ id: picked.id, lv: picked.lv, cost: rollMpCost(rng) });
  }
  return out;
}

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const isCloneState = (s) => s.minion_kind === 'clone' || s.minion_kind === 'Clone';
const sameRow = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (!sameRow(a[i], b[i])) return i;
  return a.length === b.length ? null : n;
}

export class Duel {
  constructor(engine, { input, playerTeam, champion, team }) {
    this.engine = engine;
    this.baseStats = new Map((team || []).map((c) => [c.name, c.stats]));
    this.wasm = engine.wasm;
    this.input = input;
    this.playerTeam = playerTeam;
    this.champion = champion;
    this.queues = new Map();
  }

  baseFor(state) {
    return this.baseStats ? this.baseStats.get(state.id_name) : null;
  }

  flatPairs(extra = []) {
    const triples = [];
    for (const [unit, queue] of this.queues) {
      for (const item of queue) triples.push(unit, item.skill ?? item, item.mp || 0);
    }
    for (const [unit, skill] of extra) triples.push(unit, skill, 0);
    return triples;
  }

  simulate(extra = []) {
    return this.wasm.battle_replay_forced(this.input, this.flatPairs(extra), {
      include_icons: false,
      max_rounds: 20000,
      // 受控队伍：轮到本体/分身却没指令时，引擎会停下来等玩家
      controlled_team: this.playerTeam,
    });
  }

  // 玩家可操作单位：本体 + 分身；幻影/丧尸/使魔由引擎自行行动
  playerUnits(replay) {
    const seen = new Map();
    const frames = [replay.initial_states, ...replay.frames.map((f) => f.states), replay.final_states];
    for (const states of frames) {
      for (const s of states || []) {
        if (s.team_index !== this.playerTeam) continue;
        const isMinion = s.owner_id != null;
        if (isMinion && !isCloneState(s)) continue;
        if (!seen.has(s.id)) seen.set(s.id, s);
      }
    }
    return [...seen.values()];
  }

  sentinelFor(unit) {
    const usable = skillsOf(unit, this.champion).filter((s) => ACTIVE_ID[s.id] != null);
    return usable.length ? ACTIVE_ID[usable[0].id] : null;
  }

  // 引擎在「受控单位没有指令」时暂停，直接把等待指令的实体告诉我们。
  nextDecision() {
    const replay = this.simulate();
    const frames = replay.frames || [];
    if (replay.paused_actor != null) {
      const states = frames.length ? frames[frames.length - 1].states : replay.initial_states;
      const unit = (states || []).find((s) => s.id === replay.paused_actor)
        || (replay.initial_states || []).find((s) => s.id === replay.paused_actor);
      if (window.__ncLog) {
        window.__ncLog.push({
          t: new Date().toISOString(),
          kind: 'duel.paused',
          data: { frames: frames.length, actor: replay.paused_actor, name: unit?.id_name },
        });
      }
      return { replay, index: frames.length, unit: unit || null };
    }
    if (window.__ncLog) {
      window.__ncLog.push({ t: new Date().toISOString(), kind: 'duel.done', data: { frames: frames.length, winner: replay.winner_team_indices } });
    }
    return { replay, index: frames.length, unit: null };
  }

  queue(unitId, skillId, mp = 0) {
    const q = this.queues.get(unitId) || [];
    q.push({ skill: skillId, mp });
    this.queues.set(unitId, q);
  }
}

// ————————————————————— 面板

function iconForState(engine, state) {
  const key = state.icon_key || state.id_key_name || state.display_name;
  const at = key.lastIndexOf('@');
  return at >= 0 ? engine.iconFor(key.slice(0, at), key.slice(at + 1)) : engine.iconFor(key, '');
}

function clanOf(state) {
  const key = state.id_key_name || state.icon_key || '';
  const at = key.lastIndexOf('@');
  return at >= 0 ? key.slice(at + 1) : '';
}

const STAT_KEYS = [['攻', 'attack', 'atk'], ['防', 'defense', 'def'], ['速', 'speed', 'spd'], ['敏', 'agility', 'agi'], ['魔', 'magic', 'mag'], ['抗', 'resistance', 'res'], ['智', 'wisdom', 'wis']];

// tswn 的八围显示用 overlay 里的原始写法：前七围 +36，速度 -124（引擎内部含 160 基础速度）
const DISPLAY_OFFSET = { attack: 36, defense: 36, speed: -124, agility: 36, magic: 36, resistance: 36, wisdom: 36 };

// 单位行显示全名：名字@队名；召唤物也用它自己的名字，不显示成「幻影」
function fullNameOf(s) {
  const key = s.id_key_name || '';
  if (key.includes('@')) return key;
  const name = s.display_name || s.id_name || '';
  const clan = s.clan || s.team_name || '';
  return clan ? name + '@' + clan : name;
}

function statsLineFor(state, base) {
  return STAT_KEYS.map(([label, field, key]) => {
    const offset = DISPLAY_OFFSET[field] || 0;
    const shown = state[field] + offset;
    const baseShown = base ? base[key] + offset : null;
    const bonus = baseShown != null && shown > baseShown ? shown - baseShown : 0;
    return el('span', { class: 'unit-row__stat' },
      `${label} ${shown}`,
      bonus ? el('em', { class: 'unit-row__buff' }, `+${bonus}`) : null);
  });
}
function panelHtml(state, side, icon, base) {
  const s = state;
  const isMinion = s.owner_id != null;
  const kind = s.minion_kind === 'clone' ? '分身' : s.minion_kind === 'summon' ? '使魔'
    : s.minion_kind === 'shadow' ? '幻影' : s.minion_kind === 'zombie' ? '丧尸' : (isMinion ? '召唤' : '');
  return el('div', { class: `unit-row unit-row--${side}${isMinion ? ' is-minion' : ''}`, 'data-uid': s.id },
    // 第一行：图标 + 名字
    el('div', { class: 'unit-row__head' },
      icon ? el('img', { class: 'unit-row__icon', src: icon, alt: '' }) : el('div', { class: 'unit-row__icon' }),
      el('div', { class: 'unit-row__name' },
        el('b', {}, fullNameOf(s)),
        kind ? el('span', { class: 'unit-row__tag' }, kind) : null)),
    // 第二行：HP 红条（数字是最大 HP）
    el('div', { class: 'unit-row__hp', title: '体力' },
      el('i', { class: 'hp' }),
      el('span', { class: 'hpnum' })),
    // 第三行：MP 蓝条
    el('div', { class: 'unit-row__mp', title: '魔力 MP：放技能会消耗，抽牌时就已定好' },
      el('i', { style: `width:${Math.max(0, Math.min(100, s.magic_point || 0))}%` }),
      el('span', {}, '魔力 ' + (s.magic_point || 0))),
    // 第四行：七围
    el('div', { class: 'unit-row__stats' }, statsLineFor(s, base)),
    el('div', { class: 'statuses' }),
  );
}
// ————————————————————— 视图

export class DuelView {
  constructor(root, duel, { onFinish, seed = 1 }) {
    this.root = root;
    this.duel = duel;
    this.onFinish = onFinish;
    this.rng = mulberry32(seed);
    this.shownFrames = 0;
    this.roundShown = -1;
    this.handEl = root.querySelector('#battle-hand');
    this.logEl = root.querySelector('#battle-log');
    this.roundEl = root.querySelector('#battle-round');
    this.energyEl = root.querySelector('#battle-energy');
    this.units = new Map();
    this.interactive = false;
    this.skip = false;
    this.speed = 1;
    for (const side of ['player', 'enemy']) {
      const wrap = root.querySelector(`#unit-${side}`);
      if (wrap && !wrap.querySelector('.minions')) wrap.append(el('div', { class: 'minions' }));
    }
  }

  ensureUnit(state) {
    const side = state.team_index === this.duel.playerTeam ? 'player' : 'enemy';
    let node = this.units.get(state.id);
    if (node) return node;
    const wrap = this.root.querySelector(`#unit-${side}`);
    if (!wrap) return null;
    node = panelHtml(state, side, iconForState(this.duel.engine, state), this.duel.baseFor(state));
    node.dataset.maxhp = String(state.max_hp || 1);
    node.style.cursor = 'pointer';
    node.title = '点击查看属性与技能';
    node.addEventListener('click', () => this.showDetail(state));
    wrap.append(node);
    this.units.set(state.id, node);
    return node;
  }

  patchUnit(state) {
    const node = this.ensureUnit(state);
    if (!node) return;
    const pct = Math.max(0, Math.min(100, (state.hp / state.max_hp) * 100));
    const hp = node.querySelector('.hp');
    if (hp) hp.style.width = `${pct}%`;
    const num = node.querySelector('.hpnum');
    if (num) {
      const shield = state.shield || 0;
      // 数字显示最大 HP（需求如此），当前血量看红条长度
      num.textContent = String(state.max_hp) + (shield > 0 ? ` 盾${Math.round(shield)}` : '');
    }
    const mpBar = node.querySelector('.unit-row__mp');
    if (mpBar) {
      const fill = mpBar.querySelector('i');
      const num = mpBar.querySelector('span');
      const mp = Math.max(0, Math.min(100, state.magic_point || 0));
      if (fill) fill.style.width = mp + '%';
      if (num) num.textContent = '魔力 ' + (state.magic_point || 0);
    }
    const box = node.querySelector('.statuses');
    if (box) {
      box.replaceChildren(...(state.status_labels || []).map((name) =>
        el('span', { class: `st ${/中毒|诅咒|冰冻|迟缓|魅惑|垂死|灼烧/.test(name) ? 'st--bad' : 'st--good'}` }, name)));
    }
    // 条的总长度跟着数值走：最大 HP 越大，红条越长；MP 以 100 为满格
    this.maxHpSeen = Math.max(this.maxHpSeen || 1, state.max_hp || 1);
    for (const n of this.units.values()) {
      const mh = Number(n.dataset.maxhp) || 1;
      const hpBar = n.querySelector('.unit-row__hp');
      if (hpBar) hpBar.style.width = (12 + 88 * Math.min(1, mh / this.maxHpSeen)).toFixed(1) + '%';
      const mpBar = n.querySelector('.unit-row__mp');
      if (mpBar) {
        const mp = Number(n.querySelector('.unit-row__mp span')?.textContent?.replace(/[^0-9]/g, '') || 0);
        mpBar.style.width = (12 + 88 * Math.min(1, mp / 100)).toFixed(1) + '%';
      }
    }
    if (state.alive === false) node.classList.add('is-dead');
    else node.classList.remove('is-dead');
  }
  renderFrame(frame) {
    if (frame.round_index !== this.roundShown) {
      this.roundShown = frame.round_index;
      this.roundEl.textContent = `第 ${frame.round_index + 1} 回合`;
      this.logEl.append(el('div', { class: 'log__round' }, `— 第 ${frame.round_index + 1} 回合 —`));
    }
    // 每一段（连击 / 雷击术的每一次打击）各自成行，并错开一点点逐条出现
    const rows = frame.rows || [];
    rows.forEach((row, ri) => {
      const line = el('div', { class: 'log__line log__line--step' });
      line.style.animationDelay = (ri * 90) + 'ms';
      row.clips.forEach((clip, ci) => {
        if (ci > 0) line.append(document.createTextNode('，'));
        for (const part of clip.parts) {
          if (!part.text) continue;
          if (part.kind === 'player') {
            const name = el('b', { class: 'log__player' }, part.text);
            if (clip.color) name.style.color = '#' + clip.color;
            line.append(name);
          } else if (part.kind === 'highlight') {
            const hl = el('i', { class: 'log__hl' }, part.text);
            if (clip.color) hl.style.color = '#' + clip.color;
            line.append(hl);
          } else if (part.kind === 'data') line.append(el('span', { class: 'log__data' }, part.text));
          else line.append(document.createTextNode(part.text));
        }
        if (clip.tone === 'damage') line.classList.add('tone-damage');
        else if (clip.tone === 'recover') line.classList.add('tone-recover');
        else if (clip.tone === 'knockout') line.classList.add('tone-knockout');
        else if (clip.tone === 'status_exit') line.classList.add('tone-status_exit');
      });
      const caster = row.clips.flatMap((cl) => cl.parts).find((pt) => pt.kind === 'player');
      if (caster && caster.player_id != null) this.flash(caster.player_id, 'is-acting');
      for (const cl of row.clips) {
        if (cl.tone === 'damage' || cl.tone === 'knockout') {
          for (const t of cl.target_ids || []) this.flash(t, 'is-hit');
        }
      }
      this.logEl.append(line);
    });    this.logEl.scrollTop = this.logEl.scrollHeight;
    for (const state of frame.states || []) this.patchUnit(state);
    // 己方有人进入狂暴（含被附体）：屏幕边缘泛红，提示本回合由引擎接管
    const berserkNow = (frame.states || []).some((st) => st.team_index === this.duel.playerTeam
      && (st.status_labels || []).some((l) => l.includes('狂暴')));
    const battle = this.root.querySelector('.battle');
    if (battle) battle.classList.toggle('is-berserk', berserkNow);
    if (berserkNow && !this.berserkShown) {
      this.berserkShown = true;
      this.logEl.append(el('div', { class: 'log__you' }, '→ 进入狂暴：本回合由引擎接管行动'));
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }
    if (!berserkNow) this.berserkShown = false;
  }

  async play(from, to) {
    const frames = this.current.frames;
    for (let i = from; i < Math.min(to, frames.length); i++) {
      this.renderFrame(frames[i]);
      if (this.manual) await this.waitClick();
      else if (!this.skip) await sleep(960 / this.speed);
    }
    this.shownFrames = Math.max(this.shownFrames, Math.min(to, frames.length));
  }

  showDetail(state) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const stats = ['攻', '防', '速', '敏', '魔', '抗', '智'].map((k, i) => {
      const field = ['attack', 'defense', 'speed', 'agility', 'magic', 'resistance', 'wisdom'][i];
      const off = [36, 36, -124, 36, 36, 36, 36][i];
      return el('div', {}, el('b', {}, k), ' ' + (state[field] + off));
    });
    const skills = (state.skills || []).map(([name, lv]) => {
      const id = 'skl' + String(name).replace(/^core[.]skill[.]/, '');
      return el('span', { class: 'skill-tag' }, id + ' ' + lv);
    });
    overlay.replaceChildren(el('div', { class: 'sheet' },
      el('h2', {}, state.display_name),
      el('div', { class: 'detail-grid' }, stats, el('div', {}, el('b', {}, 'HP'), ' ' + state.max_hp)),
      el('div', { class: 'detail-skills' }, skills.length ? skills : el('span', { class: 'muted' }, '无技能')),
      el('button', { class: 'primary', type: 'button', onclick: () => { overlay.classList.add('hidden'); overlay.replaceChildren(); } }, '关闭'),
    ));
    overlay.classList.remove('hidden');
  }

  // 正在等玩家出牌的单位：常亮高亮，直到选完牌
  markWaiting(uid) {
    for (const [id, node] of this.units) node.classList.toggle('is-waiting', id === uid);
  }

  clearWaiting() {
    for (const node of this.units.values()) node.classList.remove('is-waiting');
  }

  playCardEffect(node, card) {
    // 直接把这张手牌搬到屏幕中间，而不是复制一张新的
    const rect = node.getBoundingClientRect();
    const meta = skillMeta(card.id);
    const cat = card.id === 'normal' ? 'atk' : meta.cat;
    node.classList.add('card-flying', 'fx-' + cat);
    node.style.left = rect.left + 'px';
    node.style.top = rect.top + 'px';
    node.style.width = rect.width + 'px';
    node.style.height = rect.height + 'px';
    document.body.append(node);
    playSkillFX(card.id === 'normal' ? 'normal' : card.id);
    requestAnimationFrame(() => {
      node.style.left = '50%';
      node.style.top = '50%';
      node.style.transform = 'translate(-50%, -50%) scale(1.18) rotate(0deg)';
      node.style.opacity = '0';
    });
    setTimeout(() => { node.remove(); }, 620);
  }
  enemyWiped(frame) {
    const states = frame.states || [];
    const enemies = states.filter((s) => s.team_index !== this.duel.playerTeam);
    if (!enemies.length) return false;
    return enemies.every((s) => s.alive === false);
  }

  flash(uid, cls) {
    const node = this.units.get(uid);
    if (!node) return;
    node.classList.add(cls);
    clearTimeout(node['_t_' + cls]);
    node['_t_' + cls] = setTimeout(() => node.classList.remove(cls), 520);
  }

  waitClick() {
    return new Promise((resolve) => {
      const hint = el('div', { class: 'log__hint' }, '点击战报，继续下一帧');
      this.logEl.append(hint);
      this.logEl.scrollTop = this.logEl.scrollHeight;
      const done = () => {
        this.logEl.removeEventListener('click', done);
        hint.remove();
        resolve();
      };
      this.logEl.addEventListener('click', done);
    });
  }

  async start() {
    this.current = this.duel.simulate();
    for (const s of this.current.initial_states) {
      this.ensureUnit(s);
      this.patchUnit(s);
    }
    await this.step();
  }

  async step() {
    const decision = this.duel.nextDecision();
    this.current = decision.replay;
    await this.play(this.shownFrames, decision.index);
    if (decision.unit) {
      const before = this.unitBefore(decision.index, decision.unit.id) || decision.unit;
      this.askCard(decision, before);
      return;
    }
    // 没有受控单位等待指令 → 战斗已经跑到结果
    return this.finish();
  }

  unitBefore(index, unitId) {
    const states = index > 0 ? this.current.frames[index - 1].states : this.current.initial_states;
    return (states || []).find((s) => s.id === unitId) || null;
  }

  askCard(decision, state) {
    if (this.berserkTimer) { clearTimeout(this.berserkTimer); this.berserkTimer = null; }
    const mp = Math.max(0, state.magic_point || 0);
    // 狂暴（含被附体）：四张牌全部是「狂暴攻击」，自动随机打出一张，结果交给引擎
    const berserk = (state.status_labels || []).some((l) => l.includes('狂暴'));
    if (berserk) {
      this.renderEnergy(mp);
      const cards = [0, 1, 2, 3].map((i) => handCardEl({ id: 'berserk', lv: 0 }, { onPlay: () => {} }));
      cards.forEach((node, i) => {
        node.classList.add('is-dealt');
        node.style.animationDelay = (i * 70) + 'ms';
      });
      this.handEl.replaceChildren(...cards);
      this.markWaiting(state.id);
      this.logEl.append(el('div', { class: 'log__you' }, '→ 狂暴：随机挥出一次狂暴攻击'));
      this.logEl.scrollTop = this.logEl.scrollHeight;
      const delay = 700 + Math.floor(this.rng() * 500);
      this.interactive = false;
      setTimeout(() => {
        if (this.done) return;
        const pick = Math.floor(this.rng() * 4);
        const node = this.handEl.children[pick];
        if (node) this.playCardEffect(node, { id: 'sklberserk' });
        this.clearWaiting();
        this.berserkTimer = null;
        this.duel.queue(decision.unit.id, NORMAL_ID, 0);
        this.handEl.replaceChildren();
        this.step();
      }, delay);
      return;
    }
    // tswn 不允许连续蓄力：已经在蓄力状态时，牌堆里不再出现蓄力术
    const charging = (state.status_labels || []).some((l) => String(l).startsWith('蓄力'));
    const hand = drawHand(skillsOf(state, this.duel.champion), this.rng, 3, charging ? new Set(['sklcharge']) : null);
    this.renderEnergy(mp);
    const cards = [
      handCardEl({ id: 'normal', lv: 0 }, { onPlay: (c) => this.choose(decision, c, mp) }),
      ...hand.map((c) => handCardEl(
        { id: c.id, lv: c.lv, cost: c.cost },
        { onPlay: (x) => this.choose(decision, x, mp), disabled: c.cost > mp, locked: c.cost > mp },
      )),
    ];
    cards.forEach((node, i) => {
      node.classList.add('is-dealt');
      node.style.animationDelay = `${i * 70}ms`;
      const card = i === 0 ? { id: 'normal' } : hand[i - 1];
      node.dataset.cardId = card.id;
    });
    this.handEl.replaceChildren(...cards);
    this.markWaiting(state.id);
    if (!hand.length) {
      // 蓄力把唯一可抽的技能排除掉了：本回合只剩普通攻击，明确提示一下
      this.logEl.append(el('div', { class: 'log__you' }, '→ 蓄力中：没有可用的技能卡，本回合只能普通攻击'));
    }
    this.interactive = true;
    this.logEl.append(el('div', { class: 'log__you' }, `→ ${state.display_name || '你的单位'} 行动：从手牌里选一张`));
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  choose(decision, card, mp) {
    if (!this.interactive) return;
    this.clearWaiting();
    const id = card.id === 'normal' ? NORMAL_ID : ACTIVE_ID[card.id];
    if (id == null || (card.cost || 0) > mp) return;
    this.interactive = false;
    const node = this.handEl.querySelector(`[data-card-id="${card.id}"]`);
    if (node) {
      this.playCardEffect(node, card);
      // 其余手牌向左收拢
      [...this.handEl.children].forEach((el2) => { if (el2 !== node) el2.classList.add('is-discarding'); });
      setTimeout(() => {
        this.duel.queue(decision.unit.id, id, card.cost || 0);
        this.handEl.replaceChildren();
        this.step();
      }, 300);
    } else {
      this.duel.queue(decision.unit.id, id, card.cost || 0);
      this.handEl.replaceChildren();
      this.step();
    }
  }
  renderEnergy(energy) {
    if (!this.energyEl) return;
    const pips = [];
    for (let i = 0; i < 4; i++) pips.push(el('i', { class: `pip${i < energy ? ' is-on' : ''}` }));
    this.energyEl.replaceChildren(
      el('span', { class: 'energybar__label' }, `能量 ${energy} / 4`),
      el('span', { class: 'energybar__pips' }, pips),
    );
  }

  finish() {
    this.done = true;
    if (this.berserkTimer) { clearTimeout(this.berserkTimer); this.berserkTimer = null; }
    this.clearWaiting();
    this.root.querySelector('.battle')?.classList.remove('is-berserk');
    const rep = this.current;
    if (window.__ncLog) window.__ncLog.push({ t: new Date().toISOString(), kind: 'duel.finish', data: { winnerTeams: rep.winner_team_indices, winnerIds: rep.winner_ids, playerTeam: this.duel.playerTeam, frames: rep.frames.length } });
    const champ = (rep.final_states || []).find((s) => s.owner_id == null && s.team_index === this.duel.playerTeam);
    const won = (rep.winner_team_indices || []).includes(this.duel.playerTeam)
      || (champ ? (rep.winner_ids || []).includes(champ.id) : false);
    this.onFinish({ won, replay: rep });
  }
}
