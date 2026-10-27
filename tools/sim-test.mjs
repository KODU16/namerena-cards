// 无浏览器的战斗冒烟测试：批量跑对局，检查崩溃、回合数与胜率分布。
import { readFileSync } from 'node:fs';
import { Battle } from '../js/combat.js';

const cards = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const tactics = JSON.parse(readFileSync(new URL('../data/tactics.json', import.meta.url))).tactics;
const ladder = JSON.parse(readFileSync(new URL('../data/ladder.json', import.meta.url))).queue;

const rng = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

function autoPlay(b, r, policy = 'random') {
  let guard = 0;
  while (!b.over && guard++ < 60) {
    if (!b.hand || !b.hand.length) break;
    const pickCard = policy === 'first' ? b.hand[0] : b.hand[Math.floor(r() * b.hand.length)];
    b.playerAction(pickCard);
  }
  return b;
}

let wins = 0, total = 0, rounds = [], longest = 0, errors = 0;
const r = rng(12345);
for (let i = 0; i < 200; i++) {
  const p = cards[Math.floor(r() * cards.length)];
  const e = cards[Math.floor(r() * cards.length)];
  try {
    const b = new Battle({ player: p, enemy: e, seed: i + 1, tactics: i % 3 === 0 ? [tactics[i % tactics.length]] : [] });
    b.start();
    autoPlay(b, r);
    if (!b.over) errors++;
    if (b.winner === 'player') wins++;
    total++;
    rounds.push(b.round);
    longest = Math.max(longest, b.round);
  } catch (err) {
    errors++;
    console.error('FAIL', p.name, e.name, err.message, err.stack.split('\n')[1]);
  }
}
rounds.sort((a, b) => a - b);
console.log(`对局 ${total}，玩家胜率 ${(wins / total * 100).toFixed(1)}%，未结束 ${errors}`);
console.log(`回合数 中位 ${rounds[Math.floor(rounds.length / 2)]}，p90 ${rounds[Math.floor(rounds.length * 0.9)]}，最长 ${longest}`);

// 具体一局日志
const b = new Battle({ player: cards.find(c => c.cost === 5), enemy: cards.find(c => c.cost === 1), seed: 7 });
b.start();
let n = 0;
while (!b.over && n++ < 40) b.playerAction(b.hand[0]);
for (const l of b.log) console.log(`[${l.round}] ${l.text}`);
console.log('winner', b.winner, 'round', b.round, 'playerHp', b.player.hp, 'enemyHp', b.enemy.hp);
