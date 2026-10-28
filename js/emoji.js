// 项目自绘 16×16 像素图标：统一配色、透明边界，无需外部字体或图片服务。
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

// 全部技能和物体图标合成一张无损 PNG，每个单元恰好 16×16。
import { EMOJI_ORDER, ICON_COLUMNS, ICON_ROWS } from './emoji-order.js';

const COLS = ICON_COLUMNS;

// SVG 地图通过嵌套视口裁切同一张 PNG，不需要额外下载整张源 SVG。
export function mapIconSvg(key) {
  const i = EMOJI_ORDER.indexOf(key);
  if (i < 0) return '';
  return '<svg x="-12" y="-12" width="24" height="24" viewBox="' + (i % COLS * 16) + ' ' + (Math.floor(i / COLS) * 16)
    + ' 16 16" overflow="hidden"><image href="assets/icons-16.png" width="' + ICON_COLUMNS * 16 + '" height="' + ICON_ROWS * 16 + '" style="image-rendering:pixelated" /></svg>';
}

export function emojiImg(key, cls = 'emoji') {
  const span = document.createElement('span');
  span.className = `${cls} emoji-sprite`;
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', key);
  const i = EMOJI_ORDER.indexOf(key);
  if (i < 0) return span;
  span.style.setProperty('--icon-cols', String(ICON_COLUMNS));
  span.style.setProperty('--icon-rows', String(ICON_ROWS));
  span.style.setProperty('--col', String(i % COLS));
  span.style.setProperty('--row', String(Math.floor(i / COLS)));
  return span;
}
