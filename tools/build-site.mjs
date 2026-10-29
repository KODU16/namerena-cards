// 生成独立的压缩发布目录；只复制运行资源，不输出源码映射。
import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
// 所有构建平台由同一份独立 32px 图标生成图集。
import './build-icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 12);
const read = (path) => readFile(join(root, path));
const emit = async (path, data) => {
  const target = join(out, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
};
// 清理范围固定在本项目 dist 内，避免误操作其他目录。
await mkdir(out, { recursive: true });
const existing = await readdir(out);
if (existing.length) {
  const { rm } = await import('node:fs/promises');
  for (const name of existing) {
    const target = resolve(out, name);
    if (!target.startsWith(out + sep)) throw new Error('Invalid output path');
    await rm(target, { recursive: true, force: true });
  }
}
const wasm = await read('vendor/tswn_wasm_duel/tswn_wasm_bg.wasm');
const wasmName = 'tswn_wasm_bg-' + hash(wasm) + '.wasm';
await emit('vendor/tswn_wasm_duel/' + wasmName, wasm);
// 预压缩引擎为普通二进制文件，由浏览器原生解压，不依赖 Pages 对 wasm 开启 gzip。
const wasmGzip = gzipSync(wasm, { level: 9 });
const compressedName = 'tswn_wasm_bg-' + hash(wasmGzip) + '.bin';
await emit('vendor/tswn_wasm_duel/' + compressedName, wasmGzip);
const vendorSource = (await read('vendor/tswn_wasm_duel/tswn_wasm.js')).toString('utf8')
  .replace("module_or_path = new URL('tswn_wasm_bg.wasm', import.meta.url);", [
    "if (typeof DecompressionStream === 'function') {",
    'module_or_path = fetch(new URL(' + JSON.stringify(compressedName) + ', import.meta.url)).then((response) => {',
    "if (!response.ok) throw new Error('Engine download failed: ' + response.status);",
    "return new Response(response.body.pipeThrough(new DecompressionStream('gzip')), { headers: { 'Content-Type': 'application/wasm' } });",
    '});',
    '} else { module_or_path = new URL(' + JSON.stringify(wasmName) + ', import.meta.url); }',
  ].join('\n'));
if (!vendorSource.includes(compressedName)) throw new Error('WASM loader format changed; update compression rewrite');
const vendor = (await transform(vendorSource, { minify: true, format: 'esm', target: 'es2020', legalComments: 'none' })).code;
const vendorName = 'tswn_wasm-' + hash(vendor) + '.js';
await emit('vendor/tswn_wasm_duel/' + vendorName, vendor);
const bundled = await build({
  absWorkingDir: root, entryPoints: ['js/main.js'], bundle: true, write: false,
  minify: true, format: 'esm', target: 'es2020', legalComments: 'none',
  plugins: [{ name: 'external-wasm-glue', setup(builder) {
    // 保持 wasm 加载器的相对地址有效，并独立缓存体积最大的引擎。
    builder.onResolve({ filter: /vendor\/tswn_wasm_duel\/tswn_wasm\.js$/ }, () => ({
      path: '../vendor/tswn_wasm_duel/' + vendorName, external: true,
    }));
  } }],
});
// 三枚切片使用内容指纹；保留源雪碧图供重新裁切，不发布它。
const gradePaths = {};
let gradeBytes = 0;
for (const n of [1, 2, 3]) {
  const icon = await read('assets/grade-' + n + '.png');
  gradePaths[n] = 'assets/grade-' + n + '-' + hash(icon) + '.png';
  await emit(gradePaths[n], icon);
  gradeBytes += icon.length;
}
// JS 和 CSS 使用同一张带内容指纹的图，不额外请求旧雪碧图。
const iconSprite = await read('assets/icons-32.png');
const iconSpriteName = 'icons-32-' + hash(iconSprite) + '.png';
const app = Buffer.from(bundled.outputFiles[0].text.replace(/assets\/grade-([123])\.png/g, (_, n) => gradePaths[n])
  .replaceAll('assets/icons-32.png', 'assets/' + iconSpriteName));
const appName = 'main-' + hash(app) + '.js';
await emit('js/' + appName, app);
const sprite = await read('assets/icons-32.png');
const spriteName = 'icons-32-' + hash(sprite) + '.png';
await emit('assets/' + spriteName, sprite);
await emit('assets/favicon.png', await read('assets/favicon.png'));
// 评级图标已随应用生成指纹路径，仅复制三张独立切片。
const cssSource = (await read('css/style.css')).toString('utf8').replace(/icons-32\.png(?:\?v=\d+)?/g, spriteName);
const css = (await transform(cssSource, { loader: 'css', minify: true, legalComments: 'none' })).code;
const cssName = 'style-' + hash(css) + '.css';
await emit('css/' + cssName, css);
for (const name of ['tactics.json', 'ladder.json']) {
  await emit('data/' + name, JSON.stringify(JSON.parse(await read('data/' + name))));
}
let html = (await read('index.html')).toString('utf8');
html = html.replace(/css\/style\.css\?v=\d+/g, 'css/' + cssName)
  .replace(/js\/main\.js\?v=\d+/g, 'js/' + appName)
  .replace(/<!--[^]*?-->/g, '').replace(/>\s+</g, '><').trim();
await emit('index.html', html);
await emit('.nojekyll', '');
await emit('NOTICE.md', await read('NOTICE.md'));
// 估算可压缩文本与 wasm 的传输体积；PNG 按原始字节计，不依赖服务器一定启用 gzip。
const assets = [Buffer.from(html), Buffer.from(app), Buffer.from(vendor), Buffer.from(css),
  Buffer.from(JSON.stringify(JSON.parse(await read('data/tactics.json'))))];
const raw = wasmGzip.length + gradeBytes + assets.reduce((sum, data) => sum + data.length, 0) + sprite.length + (await read('assets/favicon.png')).length;
const gzip = wasmGzip.length + gradeBytes + assets.reduce((sum, data) => sum + gzipSync(data, { level: 9 }).length, 0) + sprite.length + (await read('assets/favicon.png')).length;
console.log('dist ready: first-load assets ' + (raw / 1024).toFixed(1) + ' KiB raw / ' + (gzip / 1024).toFixed(1) + ' KiB gzip estimate');
