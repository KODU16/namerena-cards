// 服务端运行时独立构建；与网站共用标准 WASM，不发布额外的 .bin。
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const out=new URL('../server/generated/',import.meta.url);
await mkdir(new URL('arena-wasm/',out),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('arena-runtime-entry.mjs',import.meta.url))],bundle:true,platform:'node',target:'node18',format:'esm',outfile:fileURLToPath(new URL('arena-runtime.mjs',out)),minify:false,legalComments:'none'});
await copyFile(new URL('../vendor/tswn_wasm_duel/tswn_wasm_bg.wasm',import.meta.url),new URL('arena-wasm/tswn_wasm_bg.wasm',out));
await copyFile(new URL('../server/arena.py',import.meta.url),new URL('arena.py',out));
const files={};for(const name of ['arena.py','arena-runtime.mjs','arena-wasm/tswn_wasm_bg.wasm'])files[name]=createHash('sha256').update(await readFile(new URL(name,out))).digest('hex');
const revision=createHash('sha256').update(JSON.stringify(files)).digest('hex');
await writeFile(new URL('manifest.json',out),JSON.stringify({protocol:3,storage_schema:1,revision,files},null,2));
console.log('arena runtime ready: '+revision.slice(0,12));
