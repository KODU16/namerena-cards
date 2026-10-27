// 界面渲染与战斗动画。没有框架，全部用原生 DOM。
import { CAT, skillMeta } from './skills.js';
import { emojiImg } from './emoji.js';
// 抽牌概率：被动不进牌堆，权重随熟练度线性增长（原先在 combat.js，那里已废弃）
const PASSIVE_IDS = new Set(['sklcounter', 'sklreflect', 'sklreraise']);
const drawWeight = (lv) => 1 + lv / 6;
function drawChances(skills) {
  const list = (skills || []).filter((s) => !PASSIVE_IDS.has(s.id));
  const total = list.reduce((a, s) => a + drawWeight(s.lv), 0) || 1;
  return new Map(list.map((s) => [s.id, drawWeight(s.lv) / total]));
}

export const app = document.getElementById('app');

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(4)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const STAT_DISP = { atk: 36, def: 36, spd: -124, agi: 36, mag: 36, res: 36, wis: 36 };
const shownStat = (k, v) => v + (STAT_DISP[k] || 0);

const STAT_MAX = { atk: 60, def: 60, spd: 220, agi: 60, mag: 60, res: 60, wis: 60 };
const STAT_LABEL = { atk: '攻', def: '防', spd: '速', agi: '敏', mag: '魔', res: '抗', wis: '智' };
const TIER_LABEL = { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' };

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ————————————————————— 基础卡面

export function statLine(card) {
  const s = card.stats;
  return `HP ${s.hp} · 攻 ${s.atk} · 防 ${s.def} · 速 ${s.spd} · 敏 ${s.agi} · 魔 ${s.mag} · 抗 ${s.res} · 智 ${s.wis}`;
}

export function skillTag(s, chance) {
  const meta = skillMeta(s.id);
  const pct = chance == null ? null : Math.round(chance * 100);
  return el('span', {
    class: `skill-tag cat-${meta.cat || 'atk'}`,
    'data-tip': `${meta.name} ${s.lv}`,
    'data-tip-desc': meta.desc + (pct == null ? '' : `（单抽概率 ${pct}%）`),
  },
    emojiImg(s.id, 'emoji emoji--xs'),
    ` ${meta.name} ${s.lv}`,
    pct == null ? null : el('em', { class: 'skill-tag__pct' }, ` ${pct}%`));
}

export function cardTooltip(card) {
  const skills = (card.skillList || []).slice(0, 6).map((s) => `${skillMeta(s.id).name} ${s.lv}`).join('、') || '无技能';
  return `${card.name} @${card.clan}\n${statLine(card)}\n${skills}`;
}

export function cardEl(card, { size = 'grid', selected = false, dim = false, onClick = null, badge = null, extra = null } = {}) {
  const s = card.stats;
  const skills = (card.skillList || []).slice(0, 3);
  const node = el('button', {
    class: `c-card c-card--${size}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`,
    type: 'button',
    title: cardTooltip(card),
    'data-clan': card.clan,
    'data-cost': card.cost || 0,
    onclick: onClick || undefined,
  },
    el('div', { class: 'c-card__top' },
      card.icon ? el('img', { class: 'c-icon', src: card.icon, alt: '', loading: 'lazy' }) : el('div', { class: 'c-icon c-icon--blank' }, emojiImg(card.skillList?.[0]?.id || 'star')),
      el('div', { class: 'c-card__ids' },
        el('div', { class: 'c-name' }, card.name),
        el('div', { class: 'c-clan' }, `@${card.clan}`),
      ),
      card.cost ? el('div', { class: 'c-cost', title: '费用 / 强度分档' }, card.cost) : null,
    ),
    el('div', { class: 'c-hp' }, emojiImg('hp', 'emoji emoji--sm'), el('b', {}, s.hp)),
    el('div', { class: 'c-stats' },
      ['atk', 'def', 'mag', 'spd'].map((k) =>
        el('div', { class: 'c-stat' },
          emojiImg(k, 'emoji emoji--xs'),
          el('span', { class: 'c-stat__v' }, shownStat(k, s[k])),
          el('i', { class: 'c-stat__bar', style: { width: `${Math.min(100, (s[k] / STAT_MAX[k]) * 100)}%` } }),
        )),
    ),
    el('div', { class: 'c-skills' },
      skills.length ? skills.map((sk) => el('span', {
        class: `c-skill cat-${CAT[sk.cat]?.key || 'atk'}`,
        'data-tip': `${skillMeta(sk.id).name} ${sk.lv}`,
        'data-tip-desc': skillMeta(sk.id).desc,
      },
        emojiImg(sk.id, 'emoji emoji--xs'), el('b', {}, sk.lv))) : el('span', { class: 'c-skill c-skill--none' }, '无技能'),
    ),
    badge ? el('div', { class: 'c-badge' }, badge) : null,
    extra || null,
  );
  return node;
}

export function tacticEl(t, { active = false, onClick = null } = {}) {
  return el('button', { class: `tactic${active ? ' is-active' : ''}`, type: 'button', onclick: onClick || undefined, title: t.desc },
    el('span', { class: 'tactic__glyph' }, emojiImg(t.id, 'emoji emoji--lg')),
    el('span', { class: 'tactic__body' }, el('b', {}, t.name), el('small', {}, t.desc)),
  );
}

// ————————————————————— 页头

export function topbar(state, { screen, onHome, onHelp, onLog }) {
  const run = state.run;
  const meta = [];
  if (run && run.status === 'active') meta.push(`第 ${Math.min(run.index + 1, run.opponents.length)} / ${run.opponents.length} 战`);
  if (run && run.wins) meta.push(`${run.wins} 胜`);
  return el('header', { class: 'topbar' },
    el('button', { class: 'brand', type: 'button', onclick: onHome, title: '回首页' },
      el('span', { class: 'brand__mark' }, el('img', { src: 'assets/favicon.png', alt: '', width: '26', height: '26' })),
      el('span', { class: 'brand__text' }, el('b', {}, '名竞尖塔'), el('small', {}, '卡牌对决')),
    ),
    el('div', { class: 'topbar__meta' }, meta.map((m) => el('span', { class: 'pill' }, m))),
    el('div', { class: 'topbar__actions' },
      el('span', { class: `engine-badge engine-badge--${state.ladderSource}`, title: state.ladder?.meta?.fetchedAt || '' },
        emojiImg('ladder', 'emoji emoji--xs'),
        state.ladderSource === 'live' ? '天梯 · 实时' : state.ladderSource === 'cache' ? '天梯 · 缓存' : '天梯 · 快照'),
      el('a', { class: 'ghost', href: 'https://shenjack.top:10007/', target: '_blank', rel: 'noopener noreferrer', title: '打开名字竞技场天梯' },
        emojiImg('ladder', 'emoji emoji--xs'), ' 天梯'),
      el('button', { class: 'ghost', type: 'button', onclick: onLog || (() => {}) }, '日志'),
      el('button', { class: 'ghost', type: 'button', onclick: onHelp }, emojiImg('help', 'emoji emoji--xs'), ' 玩法'),
    ),
  );
}

// ————————————————————— 首页

export function renderHome(root, state, h) {
  const hasRun = state.run && state.run.status === 'active';
  const { wasm, core } = h.versions;
  root.replaceChildren(
    el('section', { class: 'home' },
      el('div', { class: 'home__hero' },
        el('div', { class: 'home__kicker' }, 'NAMERENA · CARD DUEL'),
        el('h1', { class: 'home__title', id: 'home-title' }, '名字，就是你的牌组'),
        el('div', { class: 'home__actions' },
          el('button', { class: 'primary big', type: 'button', onclick: h.onNewRun }, hasRun ? '重新开始爬塔' : '开始爬塔'),
          hasRun ? el('button', { class: 'secondary big', type: 'button', onclick: h.onContinue }, `继续（第 ${state.run.index + 1} 战）`) : null,
          el('button', { class: 'ghost big', type: 'button', onclick: h.onForge }, '名字工坊'),
        ),
        el('div', { class: 'home__facts' },
          el('div', { class: 'fact' }, el('b', {}, String(state.pool.length)), el('span', {}, '张名字卡')),
          el('div', { class: 'fact' }, el('b', {}, String(state.tacticsPool.length)), el('span', {}, '张战术卡')),
          el('div', { class: 'fact' }, el('b', {}, state.best ? `${state.best} 胜` : '—'), el('span', {}, '最佳纪录')),
          el('div', { class: 'fact' }, el('b', {}, `core ${core}`), el('span', {}, `wasm ${wasm}`)),
        ),
      ),
      el('div', { class: 'home__side' },
        el('div', { class: 'panel' },
          el('h3', {}, '当前对手池'),
          el('p', { class: 'muted' },
            state.ladderSource === 'live' ? '已从 shenjack.top 实时抓取天梯 1A。' : '浏览器跨域被拦，使用仓库内快照；跑 tools/fetch-ladder.mjs 可更新。'),
          el('ol', { class: 'ladder-list' }, (state.ladder?.queue || []).slice(0, 8).map((q, i) =>
            el('li', {}, el('span', { class: 'rank' }, `#${q.rank ?? '?'}`), el('span', { class: 'who' }, q.name), el('span', { class: 'score' }, q.score))),
          ),
        ),
        el('div', { class: 'panel panel--tip' },
          el('h3', {}, '一局怎么打'),
          el('ol', { class: 'steps' },
            el('li', {}, '从卡组里选 1 名角色出战，可再挂 2 张战术卡。'),
            el('li', {}, '每回合抽 3 张技能卡与一份能量：主动技点选，被动自动触发，能量不足的牌会变灰。'),
            el('li', {}, '一路打到该组第 1 名。每胜一场三选一：技能卡、战术卡、角色卡。'),
          ),
        ),
      ),
    ),
  );
}

// ————————————————————— 开局：选战队名，随机名字

export function renderNewRun(root, state, h) {
  const d = h.draft;
  const card = d.card;
  root.replaceChildren(
    el('section', { class: 'setup' },
      el('div', { class: 'setup__head' },
        el('div', { class: 'home__kicker' }, 'NEW RUN'),
        el('h1', {}, '给战队起个名字'),
      ),
      el('div', { class: 'setup__grid' },
        el('div', { class: 'setup__panel' },
          el('label', { class: 'field' }, el('span', {}, '战队名'),
            el('input', {
              id: 'clan-input', maxlength: '18', autocomplete: 'off', value: d.clan, placeholder: '输入战队名',
              onchange: (e) => h.onChangeClan(e.target.value),
            }),
          ),
          el('div', { class: 'field' }, el('span', {}, '本次挑战的天梯组别')),
          el('div', { class: 'chips' }, ['1A', '1B', '2A', '2B', '3A'].map((lane) =>
            el('button', { class: `chip${d.lane === lane ? ' is-active' : ''}`, type: 'button', onclick: () => h.onChangeLane(lane) }, lane))),
          el('div', { class: 'setup__name' },
            el('span', { class: 'muted' }, '本次随机名字'),
            el('b', {}, d.name),
          ),
          el('div', { class: 'setup__actions' },
            el('button', { class: 'secondary', type: 'button', disabled: d.rerolls <= 0, onclick: h.onReroll },
              d.rerolls > 0 ? `重抽名字（${d.rerolls}）` : '没有重抽机会了'),
            el('button', { class: 'primary big', type: 'button', onclick: h.onStart }, '带着这个名字出发'),
          ),
          el('p', { class: 'muted small' }, '重抽只换名字，不换战队名。'),
        ),
        el('div', { class: 'setup__preview' },
          card ? cardEl(card, { size: 'big' }) : el('div', { class: 'boot-error' }, '这个名字无法构建，换一个'),
          card ? el('div', { class: 'setup__detail' },
            el('div', { class: 'muted' }, statLine(card)),
            el('div', { class: 'skills-full' }, (card.skillList || []).map((s) =>
              el('span', { class: `skill-tag cat-${s.cat}`, title: skillMeta(s.id).desc }, emojiImg(s.id, 'emoji emoji--xs'), `${skillMeta(s.id).name} ${s.lv}`))),
          ) : null,
        ),
      ),
      el('button', { class: 'ghost setup__back', type: 'button', onclick: h.onHome }, '返回首页'),
    ),
  );
}

// ————————————————————— 备战

export function renderPrep(root, state, h) {
  const run = state.run;
  const opp = run.opponents[run.index] || { cards: [], rank: null, score: 0, teamSize: 0 };
  const team = (run.teamIds || []).map((id) => state.collection.find((c) => c.id === id)).filter(Boolean);
  const tactics = h.tacticsByIds(state, run.tacticIds);
  const full = team.length === run.teamSize;
  root.replaceChildren(
    el('section', { class: 'prep' },
      el('div', { class: 'prep__head' },
        el('div', { class: 'stage' }, el('span', { class: 'stage__n' }, `第 ${run.index + 1} / ${run.opponents.length} 战`), el('span', { class: 'muted' }, `天梯 ${run.lane} · 队伍 ${run.teamSize} 人`)),
        el('h2', {}, `天梯对手 #${opp.rank ?? '?'}`),
        el('div', { class: 'muted' }, `${opp.score ?? 0} 分 · 对方 ${opp.cards.length} 人`),
      ),
      el('div', { class: 'prep__board' },
        el('div', { class: 'prep__col' },
          el('h3', { class: 'col-title' }, '对手'),
          el('div', { class: 'roster-grid' }, opp.cards.map((c) => cardEl(c, { size: 'big', dim: true }))),
        ),
        el('div', { class: 'prep__col prep__col--mid' }, el('div', { class: 'vs-mark' }, 'VS')),
        el('div', { class: 'prep__col' },
          el('h3', { class: 'col-title' }, `你的出战队伍 ${team.length}/${run.teamSize}`),
          el('div', { class: 'roster-grid' }, team.length
            ? team.map((c) => cardEl(c, { size: 'big' }))
            : [el('div', { class: 'empty-slot' }, `从下方选择 ${run.teamSize} 名角色`)]),
          el('div', { class: 'tactic-slots' },
            tactics.length ? tactics.map((t) => el('span', { class: 'tactic-chip', title: t.desc }, emojiImg(t.id, 'emoji emoji--xs'), ` ${t.name}`)) : el('span', { class: 'muted' }, '未挂战术卡')),
        ),
      ),
      el('div', { class: 'prep__roster' },
        el('div', { class: 'roster-head' },
          el('h3', {}, `卡组 · ${state.collection.length}`),
          el('div', { class: 'muted' }, `点角色卡加入/移出队伍（需要 ${run.teamSize} 人）；选技能卡后点角色是锻造`),
        ),
        el('div', { class: 'roster-grid' }, state.collection.map((c) => el('div', { class: 'roster-item' },
          cardEl(c, { size: 'grid', selected: (run.teamIds || []).includes(c.id), onClick: () => (h.forgeSelected ? h.onPickChampion(c.id) : h.onToggleTeam(c.id)) }),
          el('div', { class: 'forged-list' }, (run.forged || []).filter((f) => f.charId === c.id).map((f) =>
            el('span', { class: 'forged-tag' }, skillMeta(f.skillId).name + ' +' + f.lv)))))),
        el('h3', { class: 'mt' }, `战术 · ${state.ownedTactics.length}`),
        el('div', { class: 'tactics-grid' }, h.ownedTacticObjects(state).map((t) =>
          tacticEl(t, { active: run.tacticIds.includes(t.id), onClick: () => h.onToggleTactic(t.id) }))),
        el('h3', { class: 'mt' }, `技能卡 · ${(run.skillCards || []).length}`),
        el('div', { class: 'muted small' }, h.forgeSelected ? '已选中一张技能卡：点击上面任意角色完成锻造（会消耗这张卡）' : '点一张技能卡，再点角色，把它锻进角色技能组'),
        el('div', { class: 'tactics-grid' }, (run.skillCards || []).map((s) =>
          el('button', { class: `tactic${h.forgeSelected === s.uid ? ' is-active' : ''}`, type: 'button', onclick: () => h.onPickSkillCard(s.uid) },
            el('span', { class: 'tactic__glyph' }, emojiImg(s.id, 'emoji emoji--lg')),
            el('span', { class: 'tactic__body' }, el('b', {}, skillMeta(s.id).name), el('small', {}, `熟练度 ${s.lv}`)),
          ))),
      ),
      el('div', { class: 'prep__foot' },
        el('div', { class: 'muted' }, full ? `出战：${team.map((t) => t.name).join('、')}` : `还需要 ${run.teamSize - team.length} 名角色`),
        el('button', { class: 'primary', type: 'button', disabled: !full, onclick: h.onFight }, '开战'),
      ),
    ),
  );
}
// ————————————————————— 战斗

export function renderBattleShell(root, state, battle, h) {
  const log = el('div', { class: 'log', id: 'battle-log' });
  const shell = el('section', { class: 'battle' },
    el('div', { class: 'battle__bar' },
      el('div', { class: 'battle__round', id: 'battle-round' }, '第 1 回合'),
      el('div', { class: 'battle__speed' },
        [0.5, 1, 1.5, 2, 3, 4].map((x) => el('button', { class: `speed${x === 1 ? ' is-active' : ''}`, type: 'button', 'data-speed': x, onclick: () => h.onSpeed(x) }, `${x}×`)),
        el('button', { class: 'speed', type: 'button', 'data-speed': 'manual', onclick: () => h.onSpeed('manual') }, '手动'),
        el('button', { class: 'ghost', type: 'button', onclick: h.onSkip }, '跳过'),
      ),
    ),
    el('div', { class: 'arena' },
      el('div', { class: 'unit-wrap unit-wrap--enemy', id: 'unit-enemy' }),
      el('div', { class: 'arena__center' }, log),
      el('div', { class: 'unit-wrap unit-wrap--player', id: 'unit-player' }),
    ),
    el('div', { class: 'handbar' },
      el('div', { class: 'handbar__top' },
        el('div', { class: 'hand-label' }, el('span', {}, '本回合手牌'), el('small', {}, '主动点选 · 被动自动 · 能量不足会变灰')),
        h.onEndTurn ? el('button', { class: 'ghost endturn', type: 'button', onclick: h.onEndTurn }, '结束回合') : null,
      ),
      el('div', { class: 'hand', id: 'battle-hand' }),
    ),
  );
  root.replaceChildren(shell);
  return shell;
}

export function unitPanel(u, { side }) {
  const isPlayer = side === 'player';
  return el('div', { class: `unit unit--${side}`, 'data-uid': u.uid },
    el('div', { class: 'unit__side' }, isPlayer ? '你 · PLAYER' : '对手 · ENEMY'),
    el('div', { class: 'unit__avatar' },
      u.icon ? el('img', { class: 'unit__icon', src: u.icon, alt: '' }) : el('div', { class: 'unit__icon unit__icon--blank' }),
      el('div', { class: 'unit__shield', 'data-shield': 0 }, ''),
    ),
    el('div', { class: 'unit__main' },
      el('div', { class: 'unit__name' }, el('b', {}, u.name), el('span', { class: 'unit__clan' }, `@${u.clan}`)),
      el('div', { class: 'hpblock' },
        el('div', { class: 'shieldbar' },
          el('i', { class: 'shieldbar__fill', style: { width: '0%' } }),
          el('span', { class: 'shieldbar__text' }, ''),
        ),
        el('div', { class: 'hpwrap', 'data-pct': '100' },
          el('i', { class: 'oldhp', style: { width: '100%' } }),
          el('i', { class: 'hp', style: { width: '100%' } }),
        ),
        el('div', { class: 'hpnum' }, `${u.hp} / ${u.maxHp}`),
      ),
      el('div', { class: 'unit__stats' }, ['atk', 'def', 'mag', 'spd'].map((k) =>
        el('span', { class: 'unit__stat', title: STAT_LABEL[k] }, emojiImg(k, 'emoji emoji--xs'), u.base[k]))),
      el('div', { class: 'statuses' }),
    ),
    el('div', { class: 'minions' }),
    el('div', { class: 'floats' }),
  );
}

export function handCardEl(card, { onPlay, disabled, locked = false }) {
  if (card.id === 'berserk') {
    return el('button', { class: 'hcard hcard--berserk', type: 'button', disabled: disabled || undefined, onclick: () => onPlay(card) },
      el('div', { class: 'hcard__glyph' }, emojiImg('sklberserk', 'emoji emoji--xl')),
      el('div', { class: 'hcard__body' },
        el('b', {}, '狂暴攻击'),
        el('span', { class: 'hcard__lv' }, '引擎接管 · 自动打出'),
        el('small', {}, '狂暴中无法选择技能，随机挥出一击。'),
      ),
      el('span', { class: 'hcard__cost is-free' }, '狂'),
    );
  }
  if (card.id === 'normal') {
    return el('button', { class: 'hcard hcard--normal', type: 'button', disabled: disabled || undefined, onclick: () => onPlay(card) },
      el('div', { class: 'hcard__glyph' }, emojiImg('normal', 'emoji emoji--xl')),
      el('div', { class: 'hcard__body' },
        el('b', {}, '普通攻击'),
        el('span', { class: 'hcard__lv' }, '0 MP · 物理 · 永远可用'),
        el('small', {}, '没有技能可用时，拳头永远在。'),
      ),
      el('span', { class: 'hcard__cost is-free' }, '0'),
    );
  }
  const meta = skillMeta(card.id);
  const passive = !!card.passive;
  return el('button', {
    class: `hcard cat-${meta.cat}${passive ? ' is-passive' : ''}${locked ? ' is-locked' : ''}`,
    type: 'button',
    disabled: disabled || passive || locked || undefined,
    onclick: () => onPlay(card),
    title: locked ? `魔力不足（这张牌要 ${card.cost} MP）` : passive ? `${meta.desc}（被动：满足条件时自动发动）` : meta.desc,
  },
    el('div', { class: 'hcard__glyph' }, emojiImg(card.id, 'emoji emoji--xl')),
    el('div', { class: 'hcard__body' },
      el('b', {}, meta.name),
      el('span', { class: 'hcard__lv' }, passive ? '被动 · 自动' : `熟练度 ${card.lv} · 消耗 ${card.cost} MP`),
      el('small', {}, passive ? '条件满足时自动发动，不需要点击。' : meta.desc),
    ),
    el('div', { class: 'hcard__cat' }, passive ? '被动' : CAT[meta.cat]?.name || ''),
    el('span', { class: `hcard__cost${locked ? ' is-locked' : ''}` }, card.cost),
  );
}

// ————————————————————— 战斗驱动（动画）

export class BattlePlayer {
  constructor(root, battle, h) {
    this.root = root;
    this.battle = battle;
    this.h = h;
    this.speed = 1;
    this.skip = false;
    this.units = new Map();
    this.roundEl = root.querySelector('#battle-round');
    this.handEl = root.querySelector('#battle-hand');
    this.energyEl = root.querySelector('#battle-energy');
    this.logEl = root.querySelector('#battle-log');
    this.mountUnit(battle.player, 'player');
    this.mountUnit(battle.enemy, 'enemy');
  }

  mountUnit(u, side) {
    const wrap = this.root.querySelector(`#unit-${side}`);
    const panel = unitPanel(u, { side });
    wrap.append(panel);
    this.units.set(u.uid, panel);
    return panel;
  }

  unitEl(uid) {
    let node = this.units.get(uid);
    if (node) return node;
    const u = this.battle.units.find((x) => x.uid === uid);
    if (!u) return null;
    node = this.root.querySelector(`#unit-${u.side}`).querySelector(`[data-uid="${uid}"]`);
    if (!node) {
      const sideWrap = this.root.querySelector(`#unit-${u.side}`);
      const minions = sideWrap.querySelector('.minions');
      node = el('div', { class: 'minion-chip', 'data-uid': uid }, el('b', {}, u.name), el('span', { class: 'minion-hp' }, `${u.hp}/${u.maxHp}`));
      minions.append(node);
    }
    this.units.set(uid, node);
    return node;
  }

  async play(events) {
    for (const e of events) {
      this.apply(e);
      await sleep(this.duration(e) / this.speed);
      if (this.skip) this.speed = 9999;
    }
  }

  duration(e) {
    if (this.skip) return 0;
    switch (e.t) {
      case 'log': return e.tone === 'system' ? 520 : 430;
      case 'hp': return 260;
      case 'round': return 700;
      case 'summon': return 560;
      case 'death': return 520;
      case 'end': return 700;
      default: return 200;
    }
  }

  apply(e) {
    switch (e.t) {
      case 'round': {
        this.roundEl.textContent = `第 ${e.n} 回合`;
        this.logEl.append(el('div', { class: 'log__round' }, `— 第 ${e.n} 回合 —`));
        break;
      }
      case 'log': {
        this.logEl.append(el('div', { class: `log__line tone-${e.tone}` }, e.text));
        this.logEl.scrollTop = this.logEl.scrollHeight;
        break;
      }
      case 'hp': {
        const node = this.unitEl(e.uid);
        if (!node) break;
        const u = this.battle.units.find((x) => x.uid === e.uid);
        if (!u) break;
        if (node.classList.contains('minion-chip')) {
          node.querySelector('.minion-hp').textContent = `${Math.max(0, e.hp)}/${e.maxHp}`;
        } else {
          // tswn 式血条：绿色当前值 + 橙色掉血段 + 独立数值
          const wrap = node.querySelector('.hpwrap');
          const hpEl = node.querySelector('.hp');
          const oldEl = node.querySelector('.oldhp');
          const num = node.querySelector('.hpnum');
          const prev = Number(wrap?.dataset.pct || 100);
          const next = Math.max(0, Math.min(100, (e.hp / e.maxHp) * 100));
          if (hpEl) hpEl.style.width = `${next}%`;
          if (oldEl) {
            oldEl.style.transition = 'none';
            oldEl.style.width = `${prev}%`;
            requestAnimationFrame(() => {
              oldEl.style.transition = '';
              oldEl.style.width = `${next}%`;
            });
          }
          if (wrap) wrap.dataset.pct = String(next);
          if (num) num.textContent = `${Math.max(0, Math.round(e.hp))} / ${e.maxHp}`;
          const shieldBar = node.querySelector('.shieldbar');
          if (shieldBar) {
            shieldBar.classList.toggle('is-on', e.shield > 0);
            const fill = shieldBar.querySelector('.shieldbar__fill');
            if (fill) fill.style.width = `${Math.min(100, (e.shield / 60) * 100)}%`;
            const txt = shieldBar.querySelector('.shieldbar__text');
            if (txt) txt.textContent = e.shield > 0 ? `盾 ${Math.round(e.shield)}` : '';
          }
          if (e.amount > 0) this.float(node, `-${e.amount}`, 'dmg');
        }
        break;
      }
      case 'status': {
        const node = this.units.get(e.uid);
        if (!node) break;
        const box = node.querySelector('.statuses');
        if (!box) break;
        box.replaceChildren(...e.list.map((s) => el('span', { class: `st ${s.bad ? 'st--bad' : 'st--good'}` }, `${s.name}${s.dur < 90 ? ` ${s.dur}` : ''}`)));
        break;
      }
      case 'summon': {
        const sideWrap = this.root.querySelector(`#unit-${e.side}`);
        const minions = sideWrap.querySelector('.minions');
        const chip = el('div', { class: 'minion-chip', 'data-uid': e.uid }, el('b', {}, e.name), el('span', { class: 'minion-hp' }, `${e.hp}/${e.maxHp}`));
        minions.append(chip);
        this.units.set(e.uid, chip);
        break;
      }
      case 'death': {
        const node = this.unitEl(e.uid);
        if (node) node.classList.add('is-dead');
        break;
      }
      case 'energy':
        this.renderEnergyBar(e.energy || 0, e.max || 0);
        break;
      case 'end': break;
      default: break;
    }
  }

  float(node, text, kind) {
    const box = node.querySelector('.floats') || node;
    const f = el('span', { class: `float float--${kind}` }, text);
    box.append(f);
    setTimeout(() => f.remove(), 1200);
  }

  renderEnergy(battle) {
    this.renderEnergyBar(battle.energy || 0, battle.maxEnergy || 0);
  }

  renderEnergyBar(cur, max) {
    if (!this.energyEl) return;
    const pips = [];
    for (let i = 0; i < max; i++) pips.push(el('i', { class: `pip${i < cur ? ' is-on' : ''}` }));
    this.energyEl.replaceChildren(
      el('span', { class: 'energybar__label' }, `能量 ${cur} / ${max}`),
      el('span', { class: 'energybar__pips' }, pips),
    );
  }

  renderHand(battle, { disabled, onPlay }) {
    this.renderEnergy(battle);
    this.handEl.replaceChildren(
      handCardEl({ id: 'normal', lv: 0 }, { onPlay, disabled }),
      ...battle.hand.filter((c) => c.id !== 'normal').map((c) =>
        handCardEl(c, { onPlay, disabled, locked: (c.cost || 0) > (battle.energy || 0) })),
    );
  }
}

// ————————————————————— 奖励 / 结算 / 工坊

export function renderReward(root, state, offers, h) {
  root.replaceChildren(
    el('section', { class: 'reward' },
      el('div', { class: 'reward__head' },
        el('div', { class: 'home__kicker' }, `第 ${state.run.wins} 胜`),
        el('h1', {}, '三选一'),
        el('p', { class: 'muted' }, '技能卡进锻造，战术卡直接生效，角色卡进卡组。'),
      ),
      el('div', { class: 'reward__grid' }, offers.map((o) =>
        o.kind === 'tactic'
          ? el('div', { class: 'offer offer--tactic' },
            el('div', { class: 'offer__tag' }, '战术卡'),
            el('div', { class: 'tactic__glyph big-glyph' }, emojiImg(o.tactic.id, 'emoji emoji--xxl')),
            el('b', {}, o.tactic.name),
            el('p', {}, o.tactic.desc),
            el('p', { class: 'muted small' }, '强度 x' + (o.power || 1).toFixed(1) + ' · 同名只保留更强的一张'),
            el('button', { class: 'primary', type: 'button', onclick: () => h.onPickOffer(o) }, '选择'),
          )
        : o.kind === 'skill'
          ? el('div', { class: 'offer offer--tactic' },
            el('div', { class: 'offer__tag' }, '技能卡 · 随机熟练度'),
            el('div', { class: 'tactic__glyph big-glyph' }, emojiImg(o.skill.id, 'emoji emoji--xxl')),
            el('b', {}, skillMeta(o.skill.id).name),
            el('p', {}, `熟练度 ${o.skill.lv}`),
            el('p', { class: 'muted small' }, '只能在锻造里加给角色，加完消耗'),
            el('button', { class: 'primary', type: 'button', onclick: () => h.onPickOffer(o) }, '选择'),
          )
          : el('div', { class: 'offer' },
            el('div', { class: 'offer__tag' }, `角色卡 · 费用 ${o.card.cost ?? '—'}`),
            cardEl(o.card, { size: 'big' }),
            el('button', { class: 'primary', type: 'button', onclick: () => h.onPickOffer(o) }, '选择'),
          ),
      )),
    ),
  );
}
export function renderEnd(root, state, h) {
  const run = state.run;
  const won = run.status === 'won';
  root.replaceChildren(
    el('section', { class: `end ${won ? 'end--win' : 'end--lose'}` },
      el('div', { class: 'end__badge' }, won ? '通关' : '止步'),
      el('h1', {}, won ? '八战全胜' : `倒在第 ${run.index + 1} 战`),
      el('p', { class: 'muted' }, won ? '你的名字走到了天梯顶端。' : '名字的强度，有时只差一次重抽。'),
      el('div', { class: 'end__stats' },
        el('div', { class: 'fact' }, el('b', {}, `${run.wins}`), el('span', {}, '胜场')),
        el('div', { class: 'fact' }, el('b', {}, `${state.collection.length}`), el('span', {}, '卡组')),
        el('div', { class: 'fact' }, el('b', {}, `${state.best}`), el('span', {}, '最佳')),
      ),
      el('div', { class: 'end__actions' },
        el('button', { class: 'primary big', type: 'button', onclick: h.onNewRun }, '再来一局'),
        el('button', { class: 'ghost big', type: 'button', onclick: h.onHome }, '回首页'),
      ),
    ),
  );
}

export function renderForge(root, state, h) {
  root.replaceChildren(
    el('section', { class: 'forge' },
      el('div', { class: 'forge__head' },
        el('div', { class: 'home__kicker' }, 'NAME FORGE'),
        el('h1', {}, '名字工坊'),
        el('p', { class: 'muted' }, '任意名字都能在这里变成一张真实的卡：八围、技能、头像全部由 tswn_core 现算。'),
      ),
      el('div', { class: 'forge__form' },
        el('label', {}, el('span', {}, '名字'), el('input', { id: 'forge-name', placeholder: '例如：林深见鹿 / alice / 打工人', maxlength: '48', autocomplete: 'off' })),
        el('label', {}, el('span', {}, '阵营'), el('input', { id: 'forge-clan', placeholder: '例如：青', maxlength: '18', autocomplete: 'off' })),
        el('button', { class: 'primary', type: 'button', onclick: () => h.onForgeBuild() }, '生成卡牌'),
        el('button', { class: 'ghost', type: 'button', onclick: h.onHome }, '返回'),
      ),
      el('div', { class: 'forge__result', id: 'forge-result' },
        el('p', { class: 'muted' }, '生成后会在这里显示卡面；可以把它加入本局卡组。'),
      ),
    ),
  );
}

// ————————————————————— 悬浮提示（技能名 + 说明）
let tipNode = null;

function ensureTip() {
  if (!tipNode) {
    tipNode = el('div', { class: 'tip' });
    document.body.append(tipNode);
  }
  return tipNode;
}

function hideTip() {
  if (tipNode) tipNode.style.display = 'none';
}

if (typeof document !== 'undefined') {
  document.addEventListener('mouseover', (ev) => {
    const host = ev.target instanceof Element ? ev.target.closest('[data-tip]') : null;
    if (!host) return;
    const tip = ensureTip();
    tip.replaceChildren(
      el('b', {}, host.dataset.tip),
      host.dataset.tipDesc ? el('span', {}, host.dataset.tipDesc) : null,
    );
    tip.style.display = 'block';
    const r = host.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))) + 'px';
    tip.style.top = Math.round(Math.max(8, r.top - h - 8)) + 'px';
  });
  document.addEventListener('mouseout', (ev) => {
    const host = ev.target instanceof Element ? ev.target.closest('[data-tip]') : null;
    if (host) hideTip();
  });
  document.addEventListener('scroll', hideTip, true);
}