// 表情图标：与论坛（shenjack.top:10008）同款 Twemoji 17.0.2，本地打包不走外链。
export const EMOJI_CHARS = {
  // 技能
  sklfire: '🔥', sklice: '❄️', sklthunder: '⚡', sklquake: '🌋', sklabsorb: '🩸', sklpoison: '☠️',
  sklrapid: '🗡️', sklcritical: '💥', sklhalf: '🦠', sklexchange: '🔄', sklberserk: '😡', sklcharm: '💗',
  sklhaste: '💨', sklslow: '🐌', sklcurse: '🕷️', sklheal: '✨', sklrevive: '🕊️', skldisperse: '🧼',
  skliron: '🛡️', sklcharge: '🔋', sklaccumulate: '🌀', sklassassinate: '🥷', sklsummon: '🧛', sklclone: '👥',
  sklshadow: '👻', skldefend: '🧱', sklprotect: '🤝', sklreflect: '🪞', sklreraise: '🧿', sklshield: '🔰',
  sklcounter: '↩️', sklmerge: '🕳️', sklzombie: '🧟', sklupgrade: '💢', sklhide: '🌫️',
  // 战术卡
  't-atk': '💪', 't-def': '🛡️', 't-spd': '💨', 't-agi': '🎯', 't-mag': '🔮', 't-res': '🧿', 't-hp': '❤️', 't-wis': '🧠',
  't-fire': '🔥', 't-ice': '❄️', 't-thunder': '⚡', 't-iron': '🧱', 't-reflect': '🌵', 't-summon': '🧛',
  't-shadow': '👻', 't-revive': '🕊️', 't-poison': '☠️', 't-heal': '✨', 't-shield': '🔰', 't-protect': '🤝',
  // 界面
  atk: '🗡️', def: '🛡️', mag: '🔮', spd: '💨', agi: '🎯', res: '🧿', wis: '🧠', hp: '❤️',
  battle: '⚔️', deck: '🃏', ladder: '📈', engine: '⚙️', help: '❓', win: '🏆', lose: '💀',
  speed: '⏩', coin: '🪙', normal: '⚔️', star: '✨',
};

// 雪碧图：74 个图标合成一张（10 列 × 36px），只占一次请求
import { EMOJI_ORDER } from './emoji-order.js';

const COLS = 10;

export const emojiSrc = (key) => `assets/emoji/${key}.png`;

export function emojiImg(key, cls = 'emoji') {
  const span = document.createElement('span');
  span.className = `${cls} emoji-sprite`;
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', key);
  const i = EMOJI_ORDER.indexOf(key);
  if (i < 0) return span;
  span.style.setProperty('--col', String(i % COLS));
  span.style.setProperty('--row', String(Math.floor(i / COLS)));
  return span;
}