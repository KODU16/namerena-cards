// 检查任意「名字@阵营」在官方引擎里的真实八围。
// 用法：node tools/check-card.mjs "名字@阵营" ["名字2@阵营2" ...]
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'vendor', 'tswn_wasm_duel');
const mod = await import(pathToFileURL(path.join(pkg, 'tswn_wasm.js')).href);
mod.initSync({ module: readFileSync(path.join(pkg, 'tswn_wasm_bg.wasm')) });

const targets = process.argv.slice(2);
if (!targets.length) targets.push('木桩@test');

for (const line of targets) {
  const rep = mod.battle_replay_forced(`${line}\n\n木桩@test\nseed:check@!`, [], { max_rounds: 20000 });
  const s = rep.initial_states[0];
  console.log(`${line}\n  攻${s.attack} 防${s.defense} 速${s.speed} 敏${s.agility} 魔${s.magic} 抗${s.resistance} 智${s.wisdom} HP${s.max_hp}`);
  console.log(`  to_diy: ${mod.to_diy(line)}`);
}
