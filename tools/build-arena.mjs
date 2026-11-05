// 服务端运行时独立构建；与网站共用标准 WASM，不发布额外的 .bin。
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
const out=new URL('../server/generated/',import.meta.url);
await mkdir(new URL('arena-wasm/',out),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('arena-runtime-entry.mjs',import.meta.url))],bundle:true,platform:'node',target:'node18',format:'esm',outfile:fileURLToPath(new URL('arena-runtime.mjs',out)),minify:false,legalComments:'none'});
await copyFile(new URL('../vendor/tswn_wasm_duel/tswn_wasm_bg.wasm',import.meta.url),new URL('arena-wasm/tswn_wasm_bg.wasm',out));
console.log('arena runtime ready');
