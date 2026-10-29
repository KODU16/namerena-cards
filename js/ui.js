// 界面渲染与战斗动画。没有框架，全部用原生 DOM。
import { CAT, SKILLS, skillMeta } from './skills.js';
import { burstAt } from './fx.js';
import { potionById, currentOpponent, ladderStandings, potionDescription, rewardSummary } from './game.js';
import { makeCard } from './engine.js';
import { emojiImg, mapIconSvg } from './emoji.js';
// 生成和绘制共用尺寸，保持节点半径和几何约束一致。
import { MAP_LAYOUT, mapNodeRadius } from './map.js';
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
  // 速对外始终展示折合后的值（引擎内部才是 +124 的原始值）
  const spdShown = Math.round((s.spd ?? 0) - 124);
  return `HP ${s.hp} · 攻 ${s.atk} · 防 ${s.def} · 速 ${spdShown} · 敏 ${s.agi} · 魔 ${s.mag} · 抗 ${s.res} · 智 ${s.wis}`;
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
  const skills = (card.skillList || []).slice(0, 6).map((s) => `${skillMeta(s.id).name} 熟练度${s.lv}`).join('、') || '无技能';
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

export function topbar(state, { screen, onHome, onHelp, onLog, onCodex }) {
  const run = state.run;
  const meta = [];
  if (run && run.status === 'active') meta.push(`第 ${run.layer || 1} / 10 层`);
  if (run && run.cleared?.length) meta.push(`本层已过 ${run.cleared.length} 关`);
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
      el('button', { class: 'ghost', type: 'button', onclick: onCodex || onHelp }, emojiImg('help', 'emoji emoji--xs'), ' 百科'),
      el('button', { class: 'ghost', type: 'button', onclick: onHelp }, ' 玩法'),
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
          el('button', { class: 'secondary big', type: 'button', onclick: h.onSaves }, hasRun ? `存档 · 第 ${state.run.index + 1} 战进行中` : '选择存档'),
          el('button', { class: 'ghost big', type: 'button', onclick: h.onForge }, '名字工坊'),
          el('button', { class: 'ghost big', type: 'button', onclick: h.onHeroes }, '英雄角色'),
        ),
        el('div', { class: 'home__facts' },
          el('div', { class: 'fact' }, el('b', {}, String(state.pool.length)), el('span', {}, '张名字卡')),
          el('div', { class: 'fact' }, el('b', {}, String(state.tacticsPool.length)), el('span', {}, '张战术卡')),
          el('div', { class: 'fact' }, el('b', {}, state.best ? `${state.best} 胜` : '—'), el('span', {}, '最佳纪录')),
          el('div', { class: 'fact' }, el('b', {}, `core ${core}`), el('span', {}, `wasm ${wasm}`)),
        ),
      ),
      el('div', { class: 'home__side' }),
    ),
  );
  const below = el('section', { class: 'home__below' },
    el('div', { class: 'panel' },
      el('h3', {}, state.ladderSource === 'live' ? '实时抓取天梯' : '天梯快照'),
      el('p', { class: 'muted' },
        state.ladderSource === 'live' ? '已从 shenjack.top 实时抓取天梯。' : '浏览器跨域被拦，使用仓库内快照；跑 tools/fetch-ladder.mjs 可更新。'),
      el('ol', { class: 'ladder-list' }, (state.ladder?.queue || []).slice(0, 8).map((q) =>
        el('li', {}, el('span', { class: 'rank' }, `#${q.rank ?? '?'}`), el('span', { class: 'who' }, q.name), el('span', { class: 'score' }, q.score)))),
    ),
  );
  root.append(below);
}

// ————————————————————— 开局：选战队名，随机名字

export function renderNewRun(root, state, h) {
  const d = h.draft;
  const cards = d.cards || [];
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
          el('div', { class: 'setup__names' },
            el('span', { class: 'muted' }, '本次随机名字（每行一个，对应一名出战角色）'),
            ...(d.names || []).map((name, i) => el('div', { class: 'setup__name-row' + (name ? '' : ' is-empty') },
              el('span', { class: 'setup__name-idx' }, String(i + 1) + '.'),
              el('b', {}, name || '（空位）'),
              name
                ? el('button', { class: 'ghost', type: 'button', disabled: d.rerolls <= 0, onclick: () => h.onRerollRow && h.onRerollRow(i) }, '换')
                : el('button', { class: 'ghost', type: 'button', onclick: () => h.onRefillName && h.onRefillName(i) }, '随机填'),
              name
                ? el('button', { class: 'ghost ghost--del', type: 'button', title: '删除这个角色', onclick: () => h.onRemoveName && h.onRemoveName(i) }, '删除')
                : null)),
          ),
          el('div', { class: 'setup__actions' },
            el('button', { class: 'secondary', type: 'button', disabled: d.rerolls <= 0, onclick: h.onReroll },
              d.rerolls > 0 ? `重抽名字（${d.rerolls}）` : '没有重抽机会了'),
            el('button', { class: 'primary big', type: 'button', onclick: h.onStart }, '带着这个名字出发'),
          ),
          el('p', { class: 'muted small' }, '重抽只换名字，不换战队名。'),
        ),
        el('div', { class: 'setup__preview' },
          ...(cards.length ? cards.map((c2) => charRowEl(c2, { bonus: h.cardBonus ? h.cardBonus(c2) : null })) : [el('div', { class: 'boot-error' }, '这些名字无法构建，换一个')]),
        ),
      ),
      el('button', { class: 'ghost setup__back', type: 'button', onclick: h.onHome }, '返回首页'),
    ),
  );
}

// ————————————————————— 备战

export function renderPrep(root, state, h) {
  const run = state.run;
  const node = run.graph?.byId?.get(run.selectedId || run.nodeId) || null;
  // 备战展示与战斗入口共用对手解析，避免遗漏 Boss 或精英阵容。
  const opp = currentOpponent(state) || { cards: [], rank: null, score: 0, teamSize: 0 };
  const team = (run.teamIds || []).map((id) => state.collection.find((c) => c.id === id)).filter(Boolean);
  const tactics = h.tacticsByIds(state, run.tacticIds);
  const full = team.length === run.teamSize;
  root.replaceChildren(
    el('section', { class: 'prep' },
      el('div', { class: 'prep__head' },
        el('div', { class: 'stage' }, el('span', { class: 'stage__n' }, `第 ${run.layer || 1} 层`), el('span', { class: 'muted' }, `天梯 ${run.lane} · 队伍 ${run.teamSize} 人`)),
        el('h2', {}, node?.kind === 'end' ? `层级 Boss · 天梯 #${opp.rank ?? '?'}` : opp.rank ? `天梯对手 #${opp.rank}` : opp.elite ? '精英试炼' : '试炼对手（@! 队名）'),
        el('div', { class: 'muted' }, `${opp.score ?? 0} 分 · 对方 ${opp.cards.length} 人`),
      ),
      el('div', { class: 'prep__board' },
        el('div', { class: 'prep__col' },
          el('h3', { class: 'col-title' }, '对手'),
          el('div', { class: 'roster-grid' }, opp.cards.map((c) => charRowEl(c, { dim: true, bonus: h.cardBonus ? h.cardBonus(c) : null }))),
        ),
        el('div', { class: 'prep__col prep__col--mid' }, el('div', { class: 'vs-mark' }, 'VS')),
        el('div', { class: 'prep__col' },
          el('h3', { class: 'col-title' }, `你的出战队伍 ${team.length}/${run.teamSize}`),
          el('div', { class: 'roster-grid' }, team.length
            ? team.map((c) => el('div', { class: 'team-slot' },
              charRowEl(c, { bonus: h.cardBonus ? h.cardBonus(c) : null }),
              (() => {
                const weapons = state.weapons || [];
                const sel = el('select', {
                  class: 'weapon-pick',
                  title: '给这名角色换武器',
                  onchange: (ev) => {
                    const v = ev.target.value;
                    if (!v || v === '__equipped__') h.onUnequip && h.onUnequip(c.id);
                    else h.onEquipWeapon && h.onEquipWeapon(v, c.id);
                  },
                },
                  el('option', { value: '' }, '无武器'),
                  // 已装备的武器不在仓库里，单独占一项，否则会显示成「无武器」且无法卸下
                  c.weapon ? el('option', { value: '__equipped__' }, '⚔ ' + c.weapon + '（已装备）') : null,
                  ...weapons.map((w) => el('option', { value: w.id }, '⚔ ' + w.name)),
                );
                sel.value = c.weapon ? '__equipped__' : '';
                return sel;
              })()))
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
          (() => {
            const downed = (run.downed || []).includes(c.id);
            const foreign = !!run.clan && c.clan !== run.clan;
            const bonus = h.bonusOf ? h.bonusOf(c) : null;
            const node = charRowEl(c, { bonus, dim: downed || foreign, selected: (run.teamIds || []).includes(c.id), onClick: () => (h.forgeSelected ? h.onPickChampion(c.id) : h.onToggleTeam(c.id)) });
            if (downed) node.title = (node.title || '') + '\n已倒下：本局不能再出战';
            if (foreign) node.title = (node.title || '') + '\n战队不同（@' + c.clan + '）：本局只能用 @' + run.clan + ' 的角色';
            if (h.forgeSelected && h.onForgeHover) {
              node.addEventListener('mouseenter', (ev) => h.onForgeHover(c.id, ev));
              node.addEventListener('mousemove', (ev) => h.onForgeHover(c.id, ev));
              node.addEventListener('mouseleave', () => h.onForgeLeave && h.onForgeLeave());
            }
            return node;
          })(),
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
        el('button', { class: 'ghost', type: 'button', onclick: h.onBack || (() => {}) }, '返回地图'),
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
      el('div', { class: 'arena__center' }, log, el('div', { class: 'turn-slot', id: 'battle-turn' })),
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

// 沿用地图木箱的金色包边，开启时掀盖并向四周散出金币；只播放一次。
export function chestOpeningArt() {
  const art = el('div', { class: 'treasure-art', html: `<svg class="treasure-art__chest" viewBox="0 0 300 180" role="img" aria-label="装满金币的宝箱已经打开">
    <defs><radialGradient id="treasure-glow"><stop stop-color="#ffdf73" stop-opacity=".65"/><stop offset="1" stop-color="#fff0aa" stop-opacity="0"/></radialGradient><linearGradient id="treasure-wood" x2="0" y2="1"><stop stop-color="#b97834"/><stop offset="1" stop-color="#79451f"/></linearGradient><linearGradient id="treasure-gold" x2="0" y2="1"><stop stop-color="#ffe7a0"/><stop offset="1" stop-color="#dda032"/></linearGradient></defs>
    <ellipse class="treasure-art__glow" cx="150" cy="86" rx="116" ry="80" fill="url(#treasure-glow)"/>
    <ellipse cx="150" cy="151" rx="64" ry="8" fill="#624226" opacity=".12"/>
    <g class="treasure-art__lid" stroke="#623e21" stroke-width="3" stroke-linejoin="round"><path d="M99 79V53Q150 23 201 53V79Z" fill="url(#treasure-wood)"/><path d="M104 73V56Q150 33 196 56V73Z" fill="#6c4224"/><path d="M111 72V51M189 72V51" stroke="#eebd59" stroke-width="7"/><path d="M99 77H201" stroke="#ffe1a0" stroke-width="6"/></g>
    <path d="M95 93L107 77H193L205 93L195 108H105Z" fill="#4f321f" stroke="#633e22" stroke-width="3"/>
    <g fill="#ffd55a" stroke="#ac771f" stroke-width="2"><ellipse cx="118" cy="89" rx="10" ry="5"/><ellipse cx="137" cy="85" rx="11" ry="5"/><ellipse cx="157" cy="89" rx="11" ry="5"/><ellipse cx="178" cy="85" rx="10" ry="5"/><ellipse cx="190" cy="92" rx="9" ry="5"/><ellipse cx="143" cy="94" rx="12" ry="5"/></g>
    <path d="M95 94H205V139L195 148H105L95 139Z" fill="url(#treasure-wood)" stroke="#623e21" stroke-width="3" stroke-linejoin="round"/>
    <path d="M99 108H201M99 129H201" stroke="#6a3c1d" stroke-width="2" opacity=".55"/>
    <path d="M109 96V145M191 96V145" stroke="#633e22" stroke-width="12"/><path d="M109 96V145M191 96V145" stroke="url(#treasure-gold)" stroke-width="8"/>
    <path d="M96 95H204M103 145H197" stroke="#f2c362" stroke-width="5"/><rect x="141" y="94" width="18" height="22" rx="3" fill="url(#treasure-gold)" stroke="#674421" stroke-width="2"/><circle cx="150" cy="103" r="3" fill="#704b29"/><path d="M150 104V109" stroke="#704b29" stroke-width="3"/>
    <path d="M77 57l3 8 8 3-8 3-3 8-3-8-8-3 8-3ZM222 85l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#edbc44"/>
  </svg>` });
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI * 2 / 18;
    const x = Math.round(Math.cos(angle) * (85 + (i % 3) * 20));
    const y = Math.round(Math.sin(angle) * (48 + (i % 4) * 9) - 38);
    const coin = el('span', { class: 'treasure-art__coin', 'aria-hidden': 'true' }, emojiImg('coin', 'emoji emoji--sm'));
    // CSS 自定义属性必须用 setProperty，不能通过普通 style 对象赋值。
    for (const [key, value] of Object.entries({
      '--coin-x': x + 'px', '--coin-y': y + 'px', '--coin-land': (y + 58) + 'px',
      '--coin-spin': (i % 2 ? 540 : -540) + 'deg', '--coin-delay': (140 + (i % 5) * 45) + 'ms',
    })) coin.style.setProperty(key, value);
    art.append(coin);
  }
  return art;
}

// 自动领取也展示完整奖励回执，避免只弹出笼统的“一件补给”。
export function rewardReceipt(offer) {
  const summary = rewardSummary(offer);
  const icon = offer.kind === 'potion' ? potionIcon(potionById(offer.potion.id), 40)
    : emojiImg(offer.skill?.id || offer.tactic?.id || (offer.kind === 'score' ? 'coin' : offer.kind === 'weapon' ? 'normal' : 'star'), 'emoji emoji--xxl');
  return el('div', { class: 'reward-receipt' },
    el('div', { class: 'reward-receipt__heading' }, icon, el('b', {}, summary.label)),
    offer.card ? fullCharRow(offer.card) : el('p', {}, summary.detail),
    el('p', { class: 'muted small' }, summary.destination));
}

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
          : o.kind === 'potion'
          ? el('div', { class: 'offer offer--tactic' },
            el('div', { class: 'offer__tag' }, '药水 · 立即见效'),
            el('div', { class: 'tactic__glyph big-glyph' }, potionIcon(potionById(o.potion.id) || { color: '#8a93a0' }, 40)),
            el('b', {}, (potionById(o.potion.id) || {}).name || '药水'),
            el('p', { class: 'muted small' }, '放进物品栏，战斗中使用时立刻结算'),
            el('button', { class: 'primary', type: 'button', onclick: () => h.onPickOffer(o) }, '选择'),
          )
          : o.kind === 'score'
          ? el('div', { class: 'offer offer--tactic' },
            el('div', { class: 'offer__tag' }, '分数 · 直接入账'),
            el('div', { class: 'tactic__glyph big-glyph' }, '+'),
            el('b', {}, '天梯分数 +' + o.points),
            el('p', { class: 'muted small' }, '试炼不给分，这里换成分数'),
            el('button', { class: 'primary', type: 'button', onclick: () => h.onPickOffer(o) }, '选择'),
          )
          : o.kind === 'weapon'
          ? el('div', { class: 'offer offer--tactic' },
            el('div', { class: 'offer__tag' }, '武器 · 装备后重算属性'),
            el('div', { class: 'tactic__glyph big-glyph' }, '⚔'),
            el('b', {}, o.weapon.name),
            el('p', { class: 'muted small' }, '在物品栏里装备，会显示加成了哪些属性与新技能'),
            el('button', { class: 'primary', type: 'button', onclick: () => h.onPickOffer(o) }, '选择'),
          )
          : el('div', { class: 'offer' },
            el('div', { class: 'offer__tag' }, `角色卡 · 费用 ${o.card.cost ?? '—'}`),
            charRowEl(o.card, { bonus: h.cardBonus ? h.cardBonus(o.card) : null }),
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
      // 通关标题对应十层天梯，避免沿用旧版八战流程的文案。
      el('h1', {}, won ? '天梯登顶，游戏胜利' : `倒在第 ${run.index + 1} 战`),
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

// 会话未确认或账号未注册队伍时，不创建可输入的工坊表单。
export function renderForge(root, state, h) {
  const account = h.account || { allowed: false, teams: [] };
  const message = h.loading ? '正在确认主站账号…' : account.unavailable
    ? '暂时无法确认主站账号，请稍后重试。' : '请先登录已注册队伍的 shenjack 账号，再使用名字工坊。';
  root.replaceChildren(el('section', { class: 'forge' },
    el('div', { class: 'forge__head' },
      el('div', { class: 'home__kicker' }, 'NAME FORGE'), el('h1', {}, '名字工坊'),
      el('p', { class: 'muted' }, '定制账号所属队伍的角色卡，八围、技能与表情由名字生成。')),
    account.allowed ? el('div', { class: 'forge__form' },
      el('label', {}, el('span', {}, '名字'), el('input', { id: 'forge-name', placeholder: '角色名字（不含 @队伍）', maxlength: '48', autocomplete: 'off' })),
      el('label', {}, el('span', {}, '所属队伍'), el('select', { id: 'forge-clan', onchange: () => document.getElementById('forge-result').replaceChildren() },
        account.teams.map((team) => el('option', { value: team }, team)))),
      el('button', { class: 'primary', type: 'button', onclick: h.onForgeBuild }, '生成卡牌'),
      el('button', { class: 'ghost', type: 'button', onclick: h.onHome }, '返回'))
      : el('div', { class: 'forge__locked', role: 'status' }, el('p', {}, message),
        !h.loading ? el('button', { class: 'primary', type: 'button', onclick: h.onRetry }, '重新确认账号') : null,
        el('button', { class: 'ghost', type: 'button', onclick: h.onHome }, '返回')),
    el('div', { class: 'forge__result', id: 'forge-result' }, account.allowed
      ? el('p', { class: 'muted' }, '生成后可以将角色加入卡组。') : null)));
}

// 英雄按类型和年份归档；二人组共用立绘，摊开的资料卡可点选居中。
export function renderHeroes(root, heroes, h) {
  const labels = { hp: '血', atk: '攻', def: '防', spd: '速', agi: '敏', mag: '魔', res: '抗', wis: '智' };
  const scoreLabels = [['pp', '普评'], ['qp', '强评'], ['qd', '强单'], ['pd', '普单']];
  const years = Array.from({ length: 11 }, (_, i) => 2026 - i);
  const archive = el('div', { class: 'heroes__archive' });
  let mode = 'single';
  let collapseFocused = null;
  // 自动缩字保留完整的两行姓名，并按真实换行判断是否需要展开技能组。
  const fitLayout = () => {
    for (const line of archive.querySelectorAll('.hero-card__name, .hero-card__clan')) {
      let size = line.classList.contains('hero-card__name') ? 14 : 11;
      line.style.fontSize = size + 'px';
      if (line.clientWidth && line.scrollWidth > line.clientWidth) {
        size *= line.clientWidth / line.scrollWidth;
        line.style.fontSize = size + 'px';
        while (line.scrollWidth > line.clientWidth && size > 1) { size -= .1; line.style.fontSize = size + 'px'; }
      }
    }
    for (const wrap of archive.querySelectorAll('.hero-card__skills-wrap')) {
      const list = wrap.querySelector('.hero-card__skills');
      wrap.querySelector('.hero-card__expand').hidden = list.scrollHeight <= list.clientHeight + 1;
    }
  };
  const skillItems = (card) => card.skillList.length
    ? card.skillList.map((skill) => el('span', { title: skillMeta(skill.id).desc }, emojiImg(skill.id, 'emoji emoji--xs'), skillMeta(skill.id).name, el('b', {}, skill.lv)))
    : [el('span', { class: 'muted' }, '无技能')];
  const heroCard = (hero) => {
    const cards = hero.cards || [hero.card];
    const duo = cards.length === 2;
    const details = el('div', { class: 'hero-card__details' });
    const panes = [];
    let outsideController = null;
    const collapse = () => {
      panes.forEach((pane) => {
        pane.classList.remove('is-focused');
        pane.setAttribute('aria-expanded', 'false');
        pane.querySelector('.hero-card__skill-panel').hidden = true;
        const expand = pane.querySelector('.hero-card__expand');
        expand.textContent = '点击展开技能组';
        expand.setAttribute('aria-expanded', 'false');
      });
      article.classList.remove('has-focused-member');
      outsideController?.abort();
      if (collapseFocused === collapse) collapseFocused = null;
    };
    // 同一节点通过 CSS 变换从摊牌位置移到中央，切换成员也保留动画。
    const focusMember = (pane) => {
      // 多张英雄并列时，打开另一张也视为点击当前资料卡外部。
      collapseFocused?.();
      collapse();
      collapseFocused = collapse;
      pane.classList.add('is-focused');
      pane.setAttribute('aria-expanded', 'true');
      article.classList.add('has-focused-member');
      outsideController = new AbortController();
      document.addEventListener('click', (event) => {
        if (!pane.contains(event.target)) collapse();
      }, { signal: outsideController.signal });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') collapse();
      }, { signal: outsideController.signal });
      fitLayout();
    };
    const memberPane = (card, index) => {
      // 首行之外的技能通过面板展开，移除内部拖动条。
      const panel = el('div', { class: 'hero-card__skill-panel', hidden: true },
        el('b', { class: 'hero-card__skill-title' }, '技能熟练度'),
        el('div', { class: 'hero-card__skill-list' }, skillItems(card)));
      const expand = el('button', { class: 'hero-card__expand', type: 'button', 'aria-expanded': 'false', onclick: (event) => {
        event.stopPropagation();
        if (duo && !pane.classList.contains('is-focused')) focusMember(pane);
        panel.hidden = !panel.hidden;
        expand.textContent = panel.hidden ? '点击展开技能组' : '收起技能组';
        expand.setAttribute('aria-expanded', String(!panel.hidden));
      } }, '点击展开技能组');
      const pane = el('div', { class: 'hero-card__member', ...(duo ? {
        tabindex: '0', role: 'button', 'aria-label': '查看' + card.name + '的详细信息', 'aria-expanded': 'false',
        'data-member': index,
        onclick: (event) => { event.stopPropagation(); if (!pane.classList.contains('is-focused')) focusMember(pane); },
        onkeydown: (event) => {
          if (event.target !== pane) return;
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusMember(pane); }
          if (event.key === 'Escape') collapse();
        },
      } : {}) },
        el('div', { class: 'hero-card__identity' },
          // 名字生成图是队徽，放左侧；绿色评级表情固定在右侧。
          el('span', { class: 'hero-card__badge' }, el('img', { src: card.icon, width: 24, height: 24, alt: '队徽' })),
          el('div', { class: 'hero-card__names', title: card.id },
            el('b', { class: 'hero-card__name' }, card.name),
            el('span', { class: 'hero-card__clan' }, '@' + card.clan)),
          el('span', { class: 'hero-card__expression', title: '评级表情' }, gradeIcon(card) || emojiImg('star', 'emoji emoji--sm'))),
        el('dl', { class: 'hero-card__stats' }, Object.entries(labels).map(([key, label]) =>
          el('div', {}, el('dt', {}, label), el('dd', {}, Math.round(card.stats[key] || 0))))),
        el('div', { class: 'hero-card__skills-wrap' },
          el('div', { class: 'hero-card__skills', 'aria-label': '技能熟练度首行' }, skillItems(card)), expand, panel),
        !duo ? el('dl', { class: 'hero-card__scores' }, scoreLabels.map(([key, label]) =>
          el('div', {}, el('dt', {}, label), el('dd', {}, Number.isFinite(hero.scores?.[key]) ? hero.scores[key] : '—')))) : null);
      panes.push(pane);
      return pane;
    };
    const article = el('article', { class: 'hero-card' + (duo ? ' hero-card--duo' : ''), 'aria-label': cards.map((card) => card.id).join(' + ') },
      el('div', { class: 'hero-card__portrait' }, el('img', { src: hero.portrait, alt: cards.map((card) => card.name).join('与') + ' 英雄立绘', loading: 'lazy', decoding: 'async', width: '640', height: '640' })),
      el('div', { class: 'hero-card__body' }, el('p', { class: 'hero-card__description' }, hero.description), details));
    details.replaceChildren(...cards.map(memberPane));
    return article;
  };
  const renderYears = () => {
    collapseFocused?.();
    archive.replaceChildren(...years.map((year) => {
      const entries = heroes.filter((hero) => hero.year === year && ((hero.cards?.length || 1) === 2 ? 'duo' : 'single') === mode);
      const rail = el('div', { class: 'heroes__rail' + (mode === 'duo' ? ' heroes__rail--duo' : ''), tabindex: '0', 'aria-label': year + '年英雄角色，横向滚动浏览' }, entries.map(heroCard));
      rail.addEventListener('wheel', (event) => {
        if (event.ctrlKey || rail.scrollWidth <= rail.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1);
        if ((delta < 0 && rail.scrollLeft <= 0) || (delta > 0 && rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1)) return;
        event.preventDefault(); rail.scrollLeft += delta;
      }, { passive: false });
      return el('section', { class: 'heroes__year-section', 'data-year': year },
        el('h2', { class: 'heroes__year' }, year, el('span', { 'aria-hidden': 'true' })),
        entries.length ? rail : el('p', { class: 'heroes__empty' }, '暂无英雄角色'));
    }));
    fitLayout();
  };
  const filters = el('div', { class: 'heroes__filters', role: 'group', 'aria-label': '英雄类型' },
    [['single', '单人英雄'], ['duo', '二人组英雄']].map(([value, label]) => el('button', {
      type: 'button', 'aria-pressed': String(value === mode), onclick: (event) => {
        mode = value;
        filters.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button === event.currentTarget)));
        renderYears();
      },
    }, label)));
  root.replaceChildren(el('section', { class: 'heroes' },
    el('header', { class: 'heroes__head' }, el('div', {}, el('div', { class: 'home__kicker' }, 'HERO GALLERY'), el('h1', {}, '英雄角色')),
      el('button', { class: 'ghost', type: 'button', onclick: h.onHome }, '返回')), filters, archive));
  renderYears();
  const observer = new ResizeObserver(() => { if (!archive.isConnected) observer.disconnect(); else fitLayout(); });
  observer.observe(archive);
  document.fonts.ready.then(() => { if (archive.isConnected) fitLayout(); });
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

export function hideTip() {
  if (tipNode) tipNode.style.display = 'none';
}

// 鼠标位置的气泡提示（锻造成功率用），tone: red / yellow / green
export function showCursorTip(text, x, y, tone = '') {
  const tip = ensureTip();
  tip.className = 'tip tip--cursor' + (tone ? ' tip--' + tone : '');
  tip.textContent = text;
  tip.style.display = 'block';
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, x + 14))) + 'px';
  tip.style.top = Math.round(Math.max(8, y - h - 12)) + 'px';
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
// ————————————————————— 地图（有向图）

export function renderMap(root, state, h) {
  const run = state.run;
  const g = run?.graph;
  if (!g) {
    root.replaceChildren(el('div', { class: 'boot-error' }, '这一局没有地图数据'));
    return;
  }
  const byDepth = new Map();
  for (const n of g.nodes) {
    if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
    byDepth.get(n.depth).push(n);
  }
  const maxDepth = Math.max(...byDepth.keys());
  const { width: W, row: ROW, pad: PAD, inset: INSET } = MAP_LAYOUT;
  const H = (maxDepth + 1) * ROW + PAD;
  const pos = new Map();
  for (const [d, list] of byDepth) {
    list.forEach((n, i) => {
      const px = typeof n.px === 'number' ? n.px : (i + 0.5) / Math.max(1, list.length);
      const x = INSET + px * (W - 2 * INSET);
      const y = H - PAD - d * ROW + (n.py || 0);   // 玩家在下方，终点在上方
      pos.set(n.id, { x, y });
    });
  }
  const current = g.byId.get(run.nodeId);
  const available = new Set(current?.next || []);
  const cleared = new Set(run.cleared || []);

  const edges = [];
  for (const n of g.nodes) {
    for (const id of n.next) {
      let a = pos.get(n.id);
      let b = pos.get(id);
      if (!a || !b) continue;
      // 仅当前节点通往下一可访问节点的连线加粗，代替节点底色提示。
      const cls = 'map-edge' + (cleared.has(n.id) ? ' is-past' : '')
        + (n.id === run.nodeId && available.has(id) ? ' is-avail' : '');
      const via = n.via && n.via[id];
      // 将线端裁到圆外；折线采用端点相邻线段的方向。
      const waypoint = (v) => ({ x: INSET + v.x * (W - 2 * INSET), y: H - PAD - v.y * ROW });
      const trim = (center, toward, radius) => {
        const length = Math.hypot(toward.x - center.x, toward.y - center.y);
        const scale = length ? Math.min(1, (radius + 2) / length) : 0;
        return { x: center.x + (toward.x - center.x) * scale, y: center.y + (toward.y - center.y) * scale };
      };
      const first = trim(a, via?.length ? waypoint(via[0]) : b, mapNodeRadius(n));
      const last = trim(b, via?.length ? waypoint(via[via.length - 1]) : a, mapNodeRadius(g.byId.get(id)));
      a = first;
      b = last;
      if (via && via.length) {
        const pts = [a, ...via.map((v) => ({ x: INSET + v.x * (W - 2 * INSET), y: H - PAD - v.y * ROW })), b];
        edges.push(`<polyline points="${pts.map((p2) => p2.x + ',' + p2.y).join(' ')}" class="${cls}" fill="none" />`);
      } else {
        edges.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${cls}" />`);
      }
    }
  }
  const iconForNode = (n) => {
    if (n.kind === 'filler' || n.kind === 'elite') return null;
    const card = n.payload?.cards?.[0] || (n.payload?.cards ? n.payload.cards[0] : null);
    return card?.icon || null;
  };
  // 地图物体也从同一雪碧图的 view 提取，避免混用系统 Emoji 字形。
  const objectArt = mapIconSvg;
  const nodeHtml = g.nodes.map((n) => {
    const p = pos.get(n.id) || { x: 0, y: 0 };
    const isAvail = available.has(n.id);
    const isCurrent = n.id === run.nodeId;
    const isCleared = cleared.has(n.id);
    const cls = ['map-node', `map-node--${n.kind}`];
    if (isAvail) cls.push('is-avail');
    if (isCurrent) cls.push('is-current');
    if (isCleared) cls.push('is-cleared');
    const r = mapNodeRadius(n);
    const icon = iconForNode(n);
    const art = n.kind === 'start'
      ? '<text y="6" text-anchor="middle" class="map-glyph">起</text>'
      : n.kind === 'event'
        ? objectArt('event')
        : n.kind === 'chest'
          // 宝箱使用本地 SVG 几何图案，无额外图片请求。
          ? '<g shape-rendering="crispEdges"><path d="M-11,-3 V-8 L-7,-11 H7 L11,-8 V-3 Z" fill="#cc8d2c" stroke="#704820" stroke-width="2"/><rect x="-11" y="-3" width="22" height="14" rx="1" fill="#b87326" stroke="#704820" stroke-width="2"/><path d="M-7,-9 V10 M7,-9 V10 M-11,-2 H11" stroke="#f5cf63" stroke-width="2"/><rect x="-2" y="-4" width="4" height="7" fill="#ffe08a" stroke="#704820" stroke-width="1"/></g>'
        : n.kind === 'elite'
          ? objectArt('boss')
          : n.kind === 'cpu'
          ? objectArt('cpu')
          : n.kind === 'shop'
          ? '<text y="8" text-anchor="middle" class="map-shop">$</text>'
          : n.kind === 'camp'
          ? objectArt('camp')
          : n.kind === 'filler'
          ? objectArt('battle')
          : icon
            ? `<image href="${icon}" x="-16" y="-16" width="32" height="32" />`
            : '<text y="6" text-anchor="middle" class="map-glyph">战</text>';
    const label = n.kind === 'start' ? '起点'
      : n.kind === 'end' ? `终点 #${n.rank ?? ''}`
        : n.kind === 'ladder' ? `天梯 #${n.rank ?? '?'}`
          : n.kind === 'elite' ? '精英'
            : n.kind === 'cpu' ? '电脑'
              : n.kind === 'shop' ? '商店'
              : n.kind === 'camp' ? '篝火'
                : n.kind === 'event' ? '补给'
                  : n.kind === 'chest' ? '宝箱'
                  : '试炼';
    return `<g class="${cls.join(' ')}" data-id="${n.id}" transform="translate(${p.x},${p.y})">
      <g class="map-node__art">
        <!-- 保留原圆形命中区域与连线避让半径，仅将图案宽高翻倍。 -->
        <circle class="map-node__hit" r="${r}"></circle>
        <g class="map-node__icon" transform="scale(2)">${art}</g>
      </g>
      <text y="${r + 16}" text-anchor="middle" class="map-label">${label}</text>
    </g>`;
  }).join('');

  const svg = `<svg class="map-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${edges.join('')}${nodeHtml}</svg>`;
  root.replaceChildren(
    el('section', { class: 'map' },
      el('div', { class: 'map__head' },
        el('div', {},
          el('div', { class: 'home__kicker' }, `LAYER ${run.layer || 1} / 10`),
          el('h2', {}, `第 ${run.layer || 1} 层 · 天梯 ${run.lane}`),
          el('div', { class: 'muted map__say', id: 'map-say' }, h.say || '从下往上走：天梯名次一路变好，最后汇聚到本层名次最高的选手')),
        el('div', { class: 'map__tools' }, 
          (() => { const end = g.byId.get(g.endId); const icon = end?.payload?.cards?.[0]?.icon; return el('div', { class: 'map__boss', title: '本层终点：名次最高的天梯选手' },
            icon ? el('img', { class: 'map__boss-icon', src: icon, alt: '' }) : null,
            el('div', {}, el('small', {}, '本层终点'), el('b', {}, end?.payload?.cards?.[0]?.name ? end.payload.cards[0].name + '@' + end.payload.cards[0].clan : '—')),
            el('span', { class: 'map__rank' }, '#' + (end?.rank ?? '?'))); })(),
          el('div', { class: 'map__layers', title: '已经通过的层数' },
            el('small', {}, '已攀爬'), el('b', {}, (run.layer - 1) + ' / 10 层')),
          el('button', { class: 'ghost map__bag', type: 'button', onclick: () => h.onInventory && h.onInventory() }, '物品栏'),
        ),
        el('div', { class: 'map__legend' },
          el('span', { class: 'map-legend map-legend--avail' }, '可前往'),
          el('span', { class: 'map-legend map-legend--ladder' }, '天梯'),
          el('span', { class: 'map-legend map-legend--filler' }, '试炼'),
          el('span', { class: 'map-legend map-legend--chest' }, '宝箱 · 物品＋分数'),
          el('span', { class: 'map-legend map-legend--end' }, '终点'))),
      el('div', { class: 'map__row' },
        el('div', { class: 'map__body' }),
        (() => {
          const mine = Number.isFinite(run.score) ? run.score : 0;
          const rows = ladderStandings(run);
          const mineIdx = rows.findIndex((r) => r.me);
          const slice = rows.slice(Math.max(0, mineIdx - 5), mineIdx + 6);
          return el('aside', { class: 'map__rank' },
            el('h4', {}, '天梯排名'),
            el('p', { class: 'rank-me-line' }, el('span', {}, '你的分数'), el('b', {}, String(Math.round(mine)))),
            el('div', { class: 'rank-list' }, slice.map((r) => {
              if (r.me) return el('div', { class: 'rank-row rank-row--me' }, el('span', { class: 'rank-pos' }, '#' + r.pos), el('b', {}, '你'), el('span', { class: 'rank-score' }, Math.round(mine)));
              const e2 = r.entry;
              const icon = e2.cards?.[0]?.icon;
              return el('div', { class: 'rank-row', title: e2.name || '' },
                el('span', { class: 'rank-pos' }, '#' + r.pos),
                icon ? el('img', { class: 'rank-icon', src: icon, alt: '' }) : el('span', { class: 'rank-icon' }),
                el('span', { class: 'rank-name' }, e2.name || ''),
                el('span', { class: 'rank-score' }, Math.round(e2.score)));
            })));
        })(),
      ),
      el('div', { class: 'map__foot' },
        el('span', { class: 'muted small' }, '按住拖动可以平移地图'),
        el('button', { class: 'ghost', type: 'button', onclick: h.onHome }, '返回首页')),
    ),
  );
  const body = root.querySelector('.map__body');
  if (body) {
    body.innerHTML = svg;
    body.scrollTop = body.scrollHeight;
    body.scrollLeft = (body.scrollWidth - body.clientWidth) / 2;
    let dragging = false;
    let moved = 0;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let st = 0;
    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // 仅主键平移，右键不能改变地图交互状态。
      dragging = true;
      moved = 0;
      sx = e.clientX;
      sy = e.clientY;
      sl = body.scrollLeft;
      st = body.scrollTop;
      body.classList.add('is-dragging');
    });
    body.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      body.scrollLeft = sl - dx;
      body.scrollTop = st - dy;
    });
    const stop = () => { dragging = false; body.classList.remove('is-dragging'); };
    body.addEventListener('pointerup', stop);
    body.addEventListener('pointerleave', stop);
    root.querySelectorAll('.map-node.is-avail').forEach((nodeEl) => {
      nodeEl.addEventListener('click', () => {
        if (moved > 6) return;
        if (nodeEl.classList.contains('is-choosing')) return;
        nodeEl.classList.add('is-choosing');
        // 粒子颜色：战队图标的主色；试炼 @! 固定紫色
        const nodeData = g.byId.get(nodeEl.dataset.id);
        const rect = nodeEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const color = nodeData?.kind === 'chest' ? '#dba533' : nodeData?.kind === 'filler' ? '#8b5cf6' : (colorFromIcon(nodeData?.payload?.cards?.[0]?.icon) || '#2f8ec9');
        burstAt(cx, cy, color);
        setTimeout(() => h.onPick(nodeEl.dataset.id), 700);
      });
    });
  }
}
// 取图标里的主色（跳过透明像素），失败时返回空
const iconColorCache = new Map();
function colorFromIcon(src) {
  if (!src) return '';
  if (iconColorCache.has(src)) return iconColorCache.get(src);
  try {
    const img = new Image();
    img.src = src;
    if (!img.complete) { iconColorCache.set(src, ''); return ''; }
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, 16, 16);
    const data = cx.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      r += data[i]; gg += data[i + 1]; b += data[i + 2]; n++;
    }
    const color = n ? 'rgb(' + Math.round(r / n) + ', ' + Math.round(gg / n) + ', ' + Math.round(b / n) + ')' : '';
    iconColorCache.set(src, color);
    return color;
  } catch { return ''; }
}

// 对外展示的八围数值（与 tswn 展示页一致）
export function dispStats(s) {
  const raw = s || {};
  const r = (v) => Math.round(v || 0);
  return { hp: r(raw.hp), atk: r(raw.atk), def: r(raw.def), agi: r(raw.agi), mag: r(raw.mag), res: r(raw.res), wis: r(raw.wis), spd: r(raw.spd) };
}

// 八围：七围 + 体力
export function eightSumOf(card) {
  const s = card?.stats;
  if (!s) return 0;
  const d = dispStats(s);
  return Math.round(d.atk + d.def + d.spd + d.agi + d.mag + d.res + d.wis + d.hp);
}

// 固定路径由发布构建替换为内容指纹路径，图标修改后不会命中旧切片缓存。
const GRADE_ICONS = [null, 'assets/grade-1.png', 'assets/grade-2.png', 'assets/grade-3.png'];
// 八围评级图标：>692 第一枚，>672 第二枚，>652 第三枚
export function gradeIcon(card) {
  const sum = eightSumOf(card);
  const n = sum > 692 ? 1 : sum > 672 ? 2 : sum > 652 ? 3 : 0;
  return n ? el('img', { class: 'grade-icon', src: GRADE_ICONS[n], width: 28, height: 28, alt: '', title: '八围 ' + sum }) : null;
}

// 可交互的完整角色行（点击/置灰/选中）
export function charRowEl(card, { onClick = null, dim = false, selected = false, bonus = null } = {}) {
  const row = fullCharRow(card, bonus);
  const node = onClick
    ? el('button', { class: 'fullrow-btn', type: 'button', onclick: onClick }, row)
    : el('div', { class: 'fullrow-btn' }, row);
  if (dim) node.classList.add('is-dim');
  if (selected) node.classList.add('is-selected');
  return node;
}


// 角色库里的完整角色行：仿战斗中单位行，全文字、不用图标
export function fullCharRow(card) {
  const s = card.stats || {};
  const disp = dispStats(s);
  const hp = Math.max(1, Math.round(s.hp || 1));
  const mp = Math.round(card.maxMp || 100);
  const shield = Math.round(card.shield || 0);
  // 战术/武器带来的加成用更小一号的蓝字标出（由调用方传入 bonusMap）
  const bonusMap = arguments[1] || {};
  const line = (label, key, v) => {
    const delta = key ? Math.round(bonusMap[key] || 0) : 0;
    return el('span', { class: 'fullrow__stat' }, label + ' ' + v,
      delta ? el('i', { class: 'fullrow__plus' + (delta < 0 ? ' is-neg' : '') }, (delta > 0 ? '+' : '') + delta) : null);
  };
  const bar = (cls, label, pct) => el('div', { class: 'fullrow__bar ' + cls, title: label },
    el('i', { style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' }),
    el('span', {}, label));
  return el('div', { class: 'fullrow' },
    el('div', { class: 'fullrow__head' },
      card.icon ? el('img', { class: 'fullrow__icon', src: card.icon, alt: '' }) : null,
      el('b', {}, (card.name || '') + '@' + (card.clan || '')),
      card.weapon ? el('span', { class: 'fullrow__weapon' }, '+' + card.weapon) : null,
      gradeIcon(card)),
    bar('fullrow__bar--hp', '血量 ' + hp, 100),
    bar('fullrow__bar--mp', '魔力 ' + mp, mp),
    shield > 0 ? bar('fullrow__bar--shield', '护盾 ' + shield, (shield / hp) * 100) : null,
    el('div', { class: 'fullrow__stats' },
      line('攻', 'atk', disp.atk), line('防', 'def', disp.def), line('速', 'spd', disp.spd), line('敏', 'agi', disp.agi),
      line('魔', 'mag', disp.mag), line('抗', 'res', disp.res), line('智', 'wis', disp.wis)),
    el('div', { class: 'fullrow__skills' }, (card.skillList || []).length
      ? (card.skillList || []).map((sk) => el('span', { class: 'fullrow__skill', title: skillMeta(sk.id).desc }, skillMeta(sk.id).name + ' ' + sk.lv))
      : el('span', { class: 'muted small' }, '无技能')));
}

// ————————————————————— 分数徽标

export function renderScoreBadge(state, visible) {
  let node = document.getElementById('score-badge');
  if (!node) {
    node = el('div', { id: 'score-badge' });
    document.body.appendChild(node);
  }
  node.style.display = visible ? 'flex' : 'none';
  const run = state.run;
  const score = run && Number.isFinite(run.score) ? Math.round(run.score) : null;
  node.replaceChildren(
    el('span', { class: 'score-badge__k' }, '分数'),
    el('span', { class: 'score-badge__v' }, score == null ? '—' : String(score)),
  );
}

// ————————————————————— 百科

const CODEX_STATS = [
  ['体力', 'HP', '归零即被击倒。回复来自治愈魔法、苏生术、生命药水；护盾先于体力吸收伤害。'],
  ['攻', 'attack', '物理攻击的伤害基础。普攻、地裂术、会心一击、连击等物理技能都吃这一项。'],
  ['防', 'defense', '抵消物理伤害。铁壁、守护、防御药水都会临时抬高它。'],
  ['速', 'speed', '行动顺序与行动条（速度点数）。越高越先动、行动越频繁；加速术/减速术直接改这项。'],
  ['敏', 'agility', '闪避与命中的判定基础。隐匿、潜行会临时抬高闪避。'],
  ['魔', 'magic', '魔法攻击的伤害基础。火球术、冰冻术、雷击术等法术都吃这一项。'],
  ['抗', 'resistance', '抵消魔法伤害。抗性药水临时抬高它。'],
  ['智', 'wisdom', '被动与判定的基础值。例如反击判定会用 wisdom 与引擎掷骰比较，越高越容易触发。'],
  ['魔力（MP）', 'magic_point / 0~100', '放技能要花的资源。抽牌那一刻就定好这一手花多少（8~23），不够的牌会变灰；上限 100，能量药水回 40。'],
  ['护盾', 'shield', '先于体力吸收伤害，按回合叠加，不会溢出到体力。'],
  ['战场状态', 'status', '蓄力（下一击三倍）、狂暴（每次一点二倍且不能选牌）、铁壁（防御上升）、疾走/迟缓（速度）、中毒（持续掉血）、冰冻（跳过下一次行动）、魅惑（转而攻击自己人）、诅咒（受伤提高）、守护/反击/苏生/隐匿等，都会显示在单位名字下面。'],
];

const CODEX_PLAYER = [
  ['抽牌', '每回合从你已学的主动技能里抽 3 张，权重是 1 + 熟练度/6（熟练度越高越容易抽到）。普通攻击永远可用。'],
  ['净化', '敌人专属，正常不会进你的牌池；只有武器带来的净化可以抽到，且熟练度封顶 1。'],
  ['MP 时机', '卡牌在抽到的那一刻就用引擎的掷骰定好消耗（8~23），不是出牌时再掷。能量不足的牌会变灰。'],
  ['谁听你指挥', '只有本体与分身会停下来等你下指令；幻影、使魔、丧尸由引擎自动行动。'],
  ['背刺', '潜行与背刺是两段，引擎会强制走完第二段，玩家不能在这中间插别的牌。'],
  ['狂暴', '进入狂暴（含被附体）后，四张牌全部变成「狂暴攻击」并自动随机打出，玩家不能选牌。'],
  ['召唤上限', '每个角色只能拥有 1 只使魔；已有使魔时不会再抽到血祭。蓄力中同理不会再抽到蓄力。'],
  ['护盾', '护盾按回合叠加，先于体力吸收伤害。'],
  ['药水', '不消耗行动，效果作用于这一次行动；生命/能量药水点下去立刻反映在血条/蓝条上。'],
  ['武器', '装备后属性线由 tswn 用 名字+武器@战队 重新构建，可能升也可能降；界面会列出加成了哪些属性、新添了哪些技能。'],
];

const CAT_NAMES = { atk: '物理', magic: '法术', ctrl: '控制', def: '防御', heal: '回复', summon: '召唤' };

const CODEX_MATH = [
  ['普攻', '伤害大致等于攻击力减去对方防御的一半。'],
  ['法术', '同上，攻击力换成魔力、防御换成抗性。'],
  ['技能', '技能在这个基础上按倍率放大，蓄力后的下一击按三倍、狂暴状态按一点二倍算。'],
  ['治愈 / 苏生', '治愈不看对方防御，回复量按魔力算，大约是同等魔力普攻的两倍；苏生复活时的体力约是治愈的八成。'],
  ['药水', '属性药水让对应属性加四分之一（至少加 8），生命药水回四分之一最大体力，能量药水回 40 点 MP。'],
];
export function codexSheet(state) {
  const tabBar = el('div', { class: 'inv__tabs' });
  const body = el('div', { class: 'inv__body codex' });
  const paint = (id) => {
    [...tabBar.children].forEach((b) => b.classList.toggle('is-active', b.dataset.tab === id));
    if (id === 'stats') {
      body.replaceChildren(el('div', { class: 'codex__list' }, CODEX_STATS.map(([name, key, desc]) =>
        el('div', { class: 'codex__row' }, el('b', {}, name), el('small', {}, key), el('p', {}, desc)))));
    } else if (id === 'skills') {
      const groups = {};
      for (const [id2, s] of Object.entries(SKILLS)) {
        (groups[s.cat] = groups[s.cat] || []).push({ id: id2, ...s });
      }
      body.replaceChildren(...Object.entries(groups).map(([cat, list]) =>
        el('section', { class: 'codex__section' },
          el('h3', {}, CAT_NAMES[cat] || cat),
          el('div', { class: 'codex__list' }, list.map((s) => el('div', { class: 'codex__row' },
            el('b', {}, s.name), el('small', {}, s.id), el('p', {}, s.desc)))))));
    } else if (id === 'math') {
      body.replaceChildren(el('div', { class: 'codex__list' }, CODEX_MATH.map(([name, desc]) =>
        el('div', { class: 'codex__row' }, el('b', {}, name), el('p', {}, desc)))));
    } else {
      body.replaceChildren(el('div', { class: 'codex__list' }, CODEX_PLAYER.map(([name, desc]) =>
        el('div', { class: 'codex__row' }, el('b', {}, name), el('p', {}, desc)))));
    }
  };
  for (const t of [{ id: 'stats', n: '属性' }, { id: 'skills', n: '技能' }, { id: 'math', n: '伤害与数值' }, { id: 'player', n: '玩家手操差异' }]) {
    tabBar.append(el('button', { class: 'ghost inv__tab', type: 'button', 'data-tab': t.id, onclick: () => paint(t.id) }, t.n));
  }
  const wrap = el('div', { class: 'inv' }, el('h2', {}, '百科'), tabBar, body);
  paint('stats');
  return wrap;
}

// ————————————————————— 物品栏

export function inventorySheet(state, h = {}) {
  const run = state.run || {};
  const tabs = [
    { id: 'chars', name: '角色库' },
    { id: 'forge', name: '锻造卡' },
    { id: 'tactics', name: '战术卡' },
    { id: 'potions', name: '药水' },
    { id: 'weapons', name: '武器' },
  ];
  const body = el('div', { class: 'inv__body' });
  const tabBar = el('div', { class: 'inv__tabs' });
  const del = (kind, id, label) => el('button', {
    class: 'ghost inv__del',
    type: 'button',
    title: '销毁',
    onclick: () => { if (h.onDestroy && h.onDestroy(kind, id, label)) paint(currentTab); },
  }, '销毁');
  const paint = (id) => {
    currentTab = id;
    [...tabBar.children].forEach((b) => b.classList.toggle('is-active', b.dataset.tab === id));
    if (id === 'chars') {
      body.replaceChildren(
        el('div', { class: 'inv__chars' }, (state.collection || []).map((card) => {
          const inTeam = (run.teamIds || []).includes(card.id);
          return el('div', { class: 'inv__char' },
            fullCharRow(card, h.cardBonus ? h.cardBonus(card) : null),
            el('div', { class: 'inv__ops' },
              card.weapon ? el('span', { class: 'inv__weapon' }, '⚔ ' + card.weapon) : null,
              card.weaponInfo ? el('div', { class: 'inv__wd' },
                el('div', {}, '加成：' + (card.weaponInfo.deltas.length ? card.weaponInfo.deltas.map((d) => d.label + (d.delta > 0 ? '+' : '') + d.delta).join('、') : '无')),
                card.weaponInfo.added.length ? el('div', {}, '新技能：' + card.weaponInfo.added.map((a) => skillMeta(a.id).name + '(' + a.lv + ')').join('、')) : null,
                (card.weaponInfo.removed || []).length ? el('div', {}, '失去技能：' + card.weaponInfo.removed.map((a) => skillMeta(a.id).name).join('、')) : null) : null,
              card.weapon ? el('button', { class: 'ghost', type: 'button', onclick: () => { h.onUnequip && h.onUnequip(card.id); paint('chars'); } }, '卸下') : null,
              inTeam ? el('span', { class: 'muted small' }, '出战中') : del('card', card.id, card.name)));
        })),
        el('p', { class: 'muted small' }, '出战中的角色不能销毁；悬停角色卡可看完整技能与八围'));
    } else if (id === 'forge') {
      const list = (run.skillCards || []);
      body.replaceChildren(list.length
        ? el('div', { class: 'inv__grid' }, list.map((s) => el('div', { class: 'inv__item', title: skillMeta(s.id).desc },
          el('b', {}, skillMeta(s.id).name), el('small', {}, '熟练度 ' + s.lv), del('forge', s.uid, skillMeta(s.id).name))))
        : el('p', { class: 'muted' }, '还没有锻造卡'));
    } else if (id === 'tactics') {
      const ids = state.ownedTactics || [];
      const pool = Array.isArray(state.tacticsPool) ? state.tacticsPool : [];
      body.replaceChildren(ids.length
        ? el('div', { class: 'inv__grid' }, ids.map((tid) => {
          const t = pool.find((x) => x.id === tid);
          const power = (state.tacticPower || {})[tid] || 1;
          return el('div', { class: 'inv__item' }, el('b', {}, t?.name || tid), el('small', {}, '强度 ×' + power), del('tactic', tid, t?.name || tid));
        }))
        : el('p', { class: 'muted' }, '还没有战术卡'));
    } else if (id === 'potions') {
      const list = (run.potions || []).filter((p) => p.n > 0);
      body.replaceChildren(list.length
        ? el('div', { class: 'inv__grid' }, list.map((p) => {
          const meta = potionById(p.id);
          return meta ? el('div', { class: 'inv__item', title: potionDesc(meta) }, el('b', {}, meta.name), el('small', {}, '×' + p.n)) : null;
        }))
        : el('p', { class: 'muted' }, '药水用完了'));
    } else {
      const list = state.weapons || [];
      body.replaceChildren(list.length
        ? el('div', { class: 'inv__grid' }, list.map((w) => el('div', { class: 'inv__item' },
          el('b', {}, '⚔ ' + w.name),
          el('select', { class: 'inv__pick', onchange: (ev) => { if (ev.target.value) { h.onEquipWeapon && h.onEquipWeapon(w.id, ev.target.value); paint('weapons'); } } },
            el('option', { value: '' }, '装备给…'),
            ...(state.collection || []).map((c) => el('option', { value: c.id }, c.name + '@' + c.clan))),
          del('weapon', w.id, w.name))))
        : el('p', { class: 'muted' }, '还没有武器：击败携带武器的试炼对手有几率掉落'));
    }
  };
  let currentTab = 'chars';
  for (const t of tabs) {
    tabBar.append(el('button', { class: 'ghost inv__tab', type: 'button', 'data-tab': t.id, onclick: () => paint(t.id) }, t.name));
  }
  const sheet = el('div', { class: 'inv' }, el('h2', {}, '物品栏'), tabBar, body);
  paint('chars');
  return sheet;
}
// ————————————————————— 药水

// 药瓶与技能共用 32px 图集，小型入口按 20px 展示。
export function potionIcon(p, size = 20) {
  const icon = emojiImg('potion-' + (p.id || 'hp'), 'emoji potion-icon');
  icon.style.setProperty('--cell', size + 'px');
  return icon;
}

// 药水说明：按实际实现（tswn 结算）精确描述
// 所有药水入口共用同一份引擎语义说明。
const potionDesc = potionDescription;

export function renderPotionDock(state, onUse) {
  let dock = document.getElementById('potion-dock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'potion-dock';
    document.body.appendChild(dock);
  }
  const run = state.run;
  const list = (run?.potions || []).filter((p) => p.n > 0);
  dock.replaceChildren();
  if (!list.length) { dock.style.display = 'none'; return; }
  dock.style.display = 'flex';
  for (const item of list) {
    const meta = potionById(item.id);
    if (!meta) continue;
    const btn = el('button', {
      class: 'potion',
      type: 'button',
      title: potionDesc(meta),
      onclick: () => onUse && onUse(item.id),
    }, potionIcon(meta), el('span', { class: 'potion__n' }, '×' + item.n));
    dock.append(btn);
  }
}
