// 生成独立的压缩发布目录；只复制运行资源，不输出源码映射。
import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
// 所有构建平台由同一份独立 32px 图标生成图集。
import './build-icons.mjs';
import './build-fortunes.mjs';
// 多人模式后端与网页一同构建，服务器拉取后即可使用同版本引擎。
import './build-arena.mjs';

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
// 直接加载标准 WASM，避免 .bin 请求被 IDM 接管为文件下载。
const vendorSource = (await read('vendor/tswn_wasm_duel/tswn_wasm.js')).toString('utf8')
  .replace("module_or_path = new URL('tswn_wasm_bg.wasm', import.meta.url);",
    'module_or_path = new URL(' + JSON.stringify(wasmName) + ', import.meta.url);')
  // iOS WebViews may not satisfy wasm-bindgen's Response instanceof check; pass bytes explicitly.
  .replace('const { instance, module } = await __wbg_load(await module_or_path, imports);',
    'const source = await module_or_path;\n    const bytes = source && typeof source.arrayBuffer === \'function\' ? await source.arrayBuffer() : source;\n    const { instance, module } = await __wbg_load(bytes, imports);');
if (!vendorSource.includes(wasmName)) throw new Error('WASM loader format changed; update asset rewrite');
if (!vendorSource.includes('const bytes = source')) throw new Error('WASM byte-loader rewrite failed');
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
// 英雄立绘按需请求，独立内容指纹缓存，不计入游戏首屏下载。
let appSource = bundled.outputFiles[0].text;
// 商人立绘同样只在打开对应商店时加载，保留透明背景并使用内容指纹。
for (const folder of ['assets/heroes', 'assets/characters']) {
  for (const name of (await readdir(join(root, folder))).sort()) {
    if (!name.endsWith('.webp')) continue;
    const art = await read(folder + '/' + name);
    const target = folder + '/' + name.slice(0, -5) + '-' + hash(art) + '.webp';
    await emit(target, art);
    appSource = appSource.replaceAll(folder + '/' + name, target);
  }
}
// 遗物独立图标按需加载；打包动态路径并带内容指纹，避免发布后丢图。
for (const name of (await readdir(join(root, 'assets/icons32'))).filter(n => n.startsWith('relic-') && n.endsWith('.png'))) {
  const data = await read('assets/icons32/' + name);
  const target = 'assets/relics/' + name.slice(0, -4) + '-' + hash(data) + '.png';
  await emit(target, data);
  appSource = appSource.replaceAll('assets/icons32/' + name, target);
}
// 签库按打开界面时才请求，带内容指纹避免更新后命中旧词库。
const fortunes = await read('data/fortunes.json');
const fortunePath = 'data/fortunes-' + hash(fortunes) + '.json';
await emit(fortunePath, fortunes);
appSource = appSource.replaceAll('data/fortunes.json', fortunePath);
const app = Buffer.from(appSource.replace(/assets\/grade-([123])\.png/g, (_, n) => gradePaths[n])
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
// 服务端兼容包随 dist 原子发布；客户端不请求此目录。
for(const name of ['arena.py','arena-runtime.mjs','arena-wasm/tswn_wasm_bg.wasm','manifest.json'])await emit('arena-server/'+name,await read('server/generated/'+name));
await emit('.nojekyll', '');
await emit('NOTICE.md', await read('NOTICE.md'));
// 仅估算文本压缩；WASM 和 PNG 按原始字节计，不依赖服务器开启 gzip。
const assets = [Buffer.from(html), Buffer.from(app), Buffer.from(vendor), Buffer.from(css),
  Buffer.from(JSON.stringify(JSON.parse(await read('data/tactics.json'))))];
const raw = wasm.length + gradeBytes + assets.reduce((sum, data) => sum + data.length, 0) + sprite.length + (await read('assets/favicon.png')).length;
const gzip = wasm.length + gradeBytes + assets.reduce((sum, data) => sum + gzipSync(data, { level: 9 }).length, 0) + sprite.length + (await read('assets/favicon.png')).length;
console.log('dist ready: first-load assets ' + (raw / 1024).toFixed(1) + ' KiB raw / ' + (gzip / 1024).toFixed(1) + ' KiB gzip estimate');
