// 引擎驱动的对决层：行动顺序、伤害、状态、召唤全部由 tswn Runtime 执行，
// 前端只负责「轮到玩家单位时，从手牌里选一张写进强制队列」。
import { el, sleep, handCardEl } from './ui.js';
import { emojiImg } from './emoji.js';
import { skillMeta } from './skills.js';
import { potionPreview } from './game.js';
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
    .filter((s) => ACTIVE_ID[s.id] != null && (s.id !== 'skldisperse' || s.fromWeapon))
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
    const cost = Math.max(1, Math.round(rollMpCost(rng) * (picked.mpMul || 1)));
    out.push({ id: picked.id, lv: picked.lv, cost });
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
      for (const item of queue) {
        const mp = (item.mp || 0) & 0xff;
        const potion = (item.potion || 0) & 0xff;
        triples.push(unit, item.skill ?? item, mp | (potion << 8));
      }
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
      // 篝火休息：受控队伍以 125% 体力开场（超过 100% 时治疗无效）
      start_hp_pct: this.startHpPct || undefined,
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

  queue(unitId, skillId, mp = 0, potion = null) {
    const code = ((potion == null ? this.pendingPotion : potion) || 0) & 0xff;
    this.pendingPotion = 0;
    const q = this.queues.get(unitId) || [];
    q.push({ skill: skillId, mp, potion: code });
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

// 单位行显示名：
//  - 分身：和本体同名（去掉引擎加的 ?N 后缀），例如 烟山?0@新纪元 → 烟山@新纪元
//  - 召唤物（幻影/使魔/丧尸）：直接显示召唤物名称
//  - 本体：名字@队名
function fullNameOf(s) {
  const kindOf = (k) => (k === 'shadow' ? '幻影' : k === 'summon' ? '使魔' : k === 'zombie' ? '丧尸' : k === 'clone' ? '分身' : '');
  if (isCloneState(s)) {
    const raw = s.id_key_name || '';
    const base = raw.replace(/\?\d+(?=@|$)/, '');
    if (base) return base;
    const name = (s.display_name || s.id_name || '').replace(/\?\d+$/, '');
    const clan = s.clan || s.team_name || '';
    return clan ? name + '@' + clan : name;
  }
  if (s.minion_kind) {
    const label = kindOf(s.minion_kind);
    if (label) return label;
  }
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
        kind && kind !== fullNameOf(s) ? el('span', { class: 'unit-row__tag' }, kind) : null)),
    // 第二行：护盾黄条 + HP 红条（同一根长度，护盾在正上方，左边平齐）
    el('div', { class: 'unit-row__bars' },
      el('div', { class: 'unit-row__shield', title: '护盾' }, el('i', {})),
      el('div', { class: 'unit-row__hp', title: '体力' },
        el('i', { class: 'hp' }),
        el('span', { class: 'hpnum' }))),
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
  constructor(root, duel, { onFinish, seed = 1, startHpPct = 0 }) {
    this.root = root;
    this.duel = duel;
    this.startHpPct = startHpPct;
    this.duel.startHpPct = startHpPct;
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
    const shieldVal = Math.max(0, state.shield || 0);
    const shieldWrap = node.querySelector('.unit-row__shield');
    if (shieldWrap) shieldWrap.style.display = shieldVal > 0 ? 'block' : 'none';
    const shieldFill = node.querySelector('.unit-row__shield i');
    if (shieldFill) {
      const maxHp = state.max_hp || 1;
      shieldFill.style.width = shieldVal > 0 ? Math.min(100, (shieldVal / maxHp) * 100).toFixed(1) + '%' : '0%';
    }
    const num = node.querySelector('.hpnum');
    if (num) {
      // 有盾时显示「血量最大HP/护盾值」，否则只显示最大 HP（当前血量看红条长度）
      num.textContent = shieldVal > 0
        ? '血量' + state.max_hp + '/护盾' + Math.round(shieldVal)
        : String(state.max_hp);
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
      const bars = n.querySelector('.unit-row__bars');
      if (bars) bars.style.width = (12 + 88 * Math.min(1, mh / this.maxHpSeen)).toFixed(1) + '%';
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
      line.style.animationDelay = (ri * 135) + 'ms';
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

      for (const cl of row.clips) {
        if (cl.tone === 'damage' || cl.tone === 'knockout') {
          for (const t of cl.target_ids || []) this.flash(t, 'is-hit');
        }
      }
      this.logEl.append(line);
    });    this.logEl.scrollTop = this.logEl.scrollHeight;
    for (const state of frame.states || []) this.patchUnit(state);
    // 一帧后续状态行可能先提到被动触发者；只高亮主行动行的施法实体。
    for (const node of this.units.values()) node.classList.remove('is-acting');
    const actionRow = rows.find((row) => !row.indent) || rows[0];
    const clip = actionRow?.clips?.find((cl) => cl.caster_ids?.length);
    const actor = clip?.caster_ids[0] ?? actionRow?.clips?.flatMap((cl) => cl.parts).find((pt) => pt.kind === 'player')?.player_id;
    if (actor != null) this.flash(actor, 'is-acting');
    // 回放包含使魔和队友状态；全屏狂暴效果只由当前出牌单位控制。
    this.root.querySelector('.battle')?.classList.remove('is-berserk');
  }

  async play(from, to) {
    const frames = this.current.frames;
    for (let i = from; i < Math.min(to, frames.length); i++) {
      this.renderFrame(frames[i]);
      if (this.manual) await this.waitClick();
      else if (!this.skip) await sleep(1440 / this.speed);
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
      return el('span', { class: 'skill-tag', title: skillMeta(id).desc }, skillMeta(id).name + ' 熟练度' + lv);
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
    // 等待出牌的高亮独占当前实体，清掉上一行动留下的短暂闪光。
    for (const [id, node] of this.units) {
      clearTimeout(node['_t_is-acting']);
      node.classList.remove('is-acting');
      node.classList.toggle('is-waiting', id === uid);
    }
  }

  clearWaiting() {
    for (const node of this.units.values()) node.classList.remove('is-waiting');
    this.root.querySelector('.battle')?.classList.remove('is-berserk');
  }

  playCardEffect(node, card) {
    // 把这张手牌从它自己的位置搬到屏幕中间（用 Web Animations，避免重排导致动画重播）
    const rect = node.getBoundingClientRect();
    const meta = skillMeta(card.id);
    const cat = card.id === 'normal' ? 'atk' : meta.cat;
    node.classList.remove('is-dealt', 'is-discarding', 'is-playing');
    node.classList.add('card-flying', 'fx-' + cat);
    node.style.animation = 'none';
    node.style.left = rect.left + 'px';
    node.style.top = rect.top + 'px';
    node.style.width = rect.width + 'px';
    node.style.height = rect.height + 'px';
    node.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
    document.body.append(node);
    playSkillFX(card.id === 'normal' ? 'normal' : card.id);
    try {
      node.animate([
        { left: rect.left + 'px', top: rect.top + 'px', transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { left: '50%', top: '50%', transform: 'translate(-50%, -50%) scale(1.18) rotate(0deg)', opacity: 0 },
      ], { duration: 520, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'forwards' });
    } catch {
      node.style.left = '50%';
      node.style.top = '50%';
      node.style.transform = 'translate(-50%, -50%) scale(1.18)';
      node.style.opacity = '0';
    }
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

  // 回合横幅：玩家回合蓝色、敌方回合黑色，1 秒后淡出
  turnBanner(side, round) {
    const slot = document.getElementById('battle-turn');
    const node = document.createElement('div');
    node.className = 'turn-banner turn-banner--inline turn-banner--' + side;
    node.innerHTML = '<div class="turn-banner__main">' + (side === 'player' ? '玩家回合' : '敌方回合')
      + '</div><div class="turn-banner__sub">第' + round + '回合</div>';
    if (slot) { slot.replaceChildren(node); } else { document.body.appendChild(node); }
    setTimeout(() => node.remove(), 1000);
  }

  // 这一手打完还有没有后续（被击倒 / 击倒最后一个敌人时不要再报下一回合）
  battleContinues() {
    try {
      const rep = this.duel.simulate();
      return rep.paused_actor != null;
    } catch {
      return true;
    }
  }

  roundOf(decision) {
    const frames = decision?.replay?.frames || [];
    const f = frames[Math.max(0, Math.min(frames.length - 1, (decision.index || 1) - 1))];
    return (f && f.round_index) || 1;
  }

  // 喝药后立刻把界面上的血条/蓝条改掉；引擎会在这一手出牌时结算同样的数值
  previewPotion(meta, state) {
    if (!state || !meta) return null;
    const next = potionPreview(meta, state);
    this.patchUnit(next);
    this.waitingState = next;
    if (meta.id === 'mp' && this.handEl) {
      // 回复 MP 后刷新原手牌的锁定状态，不重抽牌或重新掷费用。
      for (const card of this.handEl.querySelectorAll('.hcard')) {
        const cost = Number(card.dataset.mpCost || 0);
        const locked = cost > next.magic_point;
        card.disabled = locked;
        card.classList.toggle('is-locked', locked);
        card.title = locked ? 'MP 不足（需要 ' + cost + ' MP）' : (skillMeta(card.dataset.cardId)?.desc || '普通攻击');
      }
      this.renderEnergy(next.magic_point);
    }
    return next;
  }

  askCard(decision, state) {
    if (this.berserkTimer) { clearTimeout(this.berserkTimer); this.berserkTimer = null; }
    this.waitingState = state;
    this.turnBanner('player', this.roundOf(decision));
    const mp = Math.max(0, state.magic_point || 0);
    // 狂暴（含被附体）：四张牌全部是「狂暴攻击」，自动随机打出一张，结果交给引擎
    const berserk = (state.status_labels || []).some((l) => l.includes('狂暴'));
    // 分身和多人队友分别判断，只在自己的狂暴出牌期间泛红。
    this.root.querySelector('.battle')?.classList.toggle('is-berserk', berserk);
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
      this.berserkTimer = setTimeout(() => {
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
    // 已有使魔 → 血祭不再进牌池（每个角色只能有 1 只使魔）；蓄力中同理
    const liveStates = (this.current?.frames || []).length
      ? this.current.frames[this.current.frames.length - 1].states
      : (this.current?.initial_states || []);
    const hasSummon = (liveStates || []).some((s) => s.owner_id === state.id && s.minion_kind === 'summon');
    const exclude = new Set();
    if (charging) exclude.add('sklcharge');
    if (hasSummon) exclude.add('sklsummon');
    // 苏生术只能复活「已经倒下的本体/非召唤物」；没有这样的目标时不给这张牌，
    // 否则引擎选不到目标会把它降级成普通攻击
    const canRevive = (liveStates || []).some((s) => s.team_index === this.duel.playerTeam && s.alive === false && s.owner_id == null);
    if (!canRevive) exclude.add('sklrevive');
    const hand = drawHand(skillsOf(state, this.duel.champion), this.rng, 3, exclude.size ? exclude : null);
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
      node.dataset.mpCost = String(card.cost || 0);
    });
    this.handEl.replaceChildren(...cards);
    this.markWaiting(state.id);
    if (!hand.length) {
      // 蓄力把唯一可抽的技能排除掉了：本回合只剩普通攻击，明确提示一下
      const why = hasSummon && !charging ? '已有使魔' : '蓄力中';
      this.logEl.append(el('div', { class: 'log__you' }, '→ ' + why + '：没有可用的技能卡，本回合只能普通攻击'));
    }
    this.interactive = true;
    this.logEl.append(el('div', { class: 'log__you' }, `→ ${state.display_name || '你的单位'} 行动：从手牌里选一张`));
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  choose(decision, card, mp) {
    if (!this.interactive) return;
    // 使用喝药后的 MP，避免点击回调仍捕获喝药前的旧余额。
    mp = this.waitingState?.magic_point ?? mp;
    const id = card.id === 'normal' ? NORMAL_ID : ACTIVE_ID[card.id];
    if (id == null || (card.cost || 0) > mp) return;
    this.clearWaiting();
    this.interactive = false;
    const node = this.handEl.querySelector(`[data-card-id="${card.id}"]`);
    if (node) {
      this.playCardEffect(node, card);
      // 其余手牌向左收拢
      [...this.handEl.children].forEach((el2) => { if (el2 !== node) el2.classList.add('is-discarding'); });
      setTimeout(() => {
        this.duel.queue(decision.unit.id, id, card.cost || 0, this.pendingPotion || 0);
        this.pendingPotion = 0;
        if (this.battleContinues()) this.turnBanner('enemy', this.roundOf(decision));
        this.handEl.replaceChildren();
        this.step();
      }, 300);
    } else {
      this.duel.queue(decision.unit.id, id, card.cost || 0, this.pendingPotion || 0);
      this.pendingPotion = 0;
      if (this.battleContinues()) this.turnBanner('enemy', this.roundOf(decision));
      this.handEl.replaceChildren();
      this.step();
    }
  }
  renderEnergy(energy) {
    if (!this.energyEl) return;
    const pips = [];
    for (let i = 0; i < 4; i++) pips.push(el('i', { class: `pip${i < Math.ceil(energy / 25) ? ' is-on' : ''}` }));
    this.energyEl.replaceChildren(
      el('span', { class: 'energybar__label' }, `MP ${energy} / 100`),
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
    // 判胜：winnerIds 是实体 id，winnerTeams 用的是「输入组」编号（0 = 我方），
    // 两者都不是运行期 team_index，不能拿 state.team_index 去比。
    const mine = (rep.final_states || rep.initial_states || []).filter((s) => s.input_team_index === 0).map((s) => s.id);
    const winnerIds = rep.winner_ids || [];
    const winnerTeams = rep.winner_team_indices || [];
    const won = winnerIds.length
      ? winnerIds.some((id) => mine.includes(id))
      : winnerTeams.includes(0);
    if (window.__ncLog) window.__ncLog.push({ t: new Date().toISOString(), kind: 'duel.judge', data: { mine, winnerIds, winnerTeams, won } });
    this.onFinish({ won, replay: rep });
  }
}
