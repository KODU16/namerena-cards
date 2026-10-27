// 下载 Twemoji 17.0.2（与论坛同版本）到 assets/emoji/<key>.png。
// 用法：node tools/fetch-emoji.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOJI_CHARS } from '../js/emoji.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'emoji');
mkdirSync(outDir, { recursive: true });

const codepoints = (ch) => [...ch]
  .map((c) => c.codePointAt(0))
  .filter((cp) => cp !== 0xfe0f) // Twemoji 文件名不带变体选择符
  .map((cp) => cp.toString(16))
  .join('-');

const CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/72x72/';

let ok = 0, skip = 0, fail = [];
for (const [key, ch] of Object.entries(EMOJI_CHARS)) {
  const file = path.join(outDir, `${key}.png`);
  if (existsSync(file) && process.env.FORCE !== '1') { skip++; continue; }
  const cp = codepoints(ch);
  const url = CDN + cp + '.png';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, buf);
    ok++;
  } catch (e) {
    fail.push(`${key} ${ch} ${cp}: ${e.message}`);
  }
}
console.log(`下载 ${ok}，跳过 ${skip}，失败 ${fail.length}`);
if (fail.length) console.log(fail.join('\n'));
