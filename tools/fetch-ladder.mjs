// 抓取天梯首页的成员分数排名，按 1A/1B/2A/2B/3A 五条线输出。
// 每条线按排名从「最底下第一个正分」往上排，最后一位就是该线第 1 名。
// 用法：node tools/fetch-ladder.mjs [--out data/ladder.json]
import { writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://shenjack.top:10007/';
const LANES = ['1A', '1B', '2A', '2B', '3A'];
const OUT = process.env.OUT || path.join(root, 'data', 'ladder.json');

const decodeEntities = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const splitName = (line) => {
  const at = line.lastIndexOf('@');
  if (at < 0) return { name: line.trim(), clan: '无名' };
  return { name: line.slice(0, at).trim(), clan: line.slice(at + 1).trim() };
};

export function parseLadder(html, lanes = LANES) {
  const start = html.indexOf('rankings-table');
  const table = html.slice(start, html.indexOf('</table>', start));
  const headers = [...table.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1].trim()).filter(Boolean);
  const rows = [];
  for (const tr of table.split('<tr>').slice(1)) {
    const rank = /rank-number">\s*(\d+)/.exec(tr);
    const cells = [...tr.matchAll(/<td class="member-score">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (!cells.length) continue;
    const byLane = {};
    lanes.forEach((lane, i) => {
      const cell = cells[i];
      if (!cell) return;
      const title = /title="([^"]*)"/.exec(cell);
      const score = /class="score"[^>]*>\s*([\d,]+)\s*</.exec(cell);
      if (!title || !score) return;
      const lineup = decodeEntities(title[1]).split('\n').map((x) => x.trim()).filter(Boolean);
      if (!lineup.length) return;
      const first = splitName(lineup[0]);
      byLane[lane] = {
        rank: rank ? Number(rank[1]) : null,
        score: Number(score[1].replace(/,/g, '')),
        name: first.name,
        clan: first.clan,
        lineup,
      };
    });
    if (Object.keys(byLane).length) rows.push(byLane);
  }
  return { headers, rows };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = await fetch(SOURCE, { headers: { 'user-agent': 'namerena-cards/1.0 (+static fan game)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const { rows } = parseLadder(html);
  console.log(`解析到 ${rows.length} 行`);

  const out = { meta: { source: SOURCE, fetchedAt: new Date().toISOString(), lanes: LANES }, lanes: {} };
  for (const lane of LANES) {
    const entries = rows.map((r) => r[lane]).filter(Boolean).filter((e) => e.score > 0);
    // 分数从低到高 = 从榜底往榜顶，最后一位是第 1 名
    entries.sort((a, b) => a.score - b.score);
    out.lanes[lane] = {
      teamSize: Number(lane[0]),
      queue: entries.map((e) => ({
        rank: e.rank,
        score: e.score,
        name: e.name,
        clan: e.clan,
        lineup: e.lineup,
        teamSize: Number(lane[0]),
      })),
    };
    console.log(`${lane}: ${entries.length} 个对手，最低 rank ${entries[0]?.rank} / 第一 rank ${entries[entries.length - 1]?.rank}`);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('写入', OUT);
}
