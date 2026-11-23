// 构建独立 Toy 包；ZIP 根目录只放静态站点，不带源码或启动脚本。
import {spawnSync} from 'node:child_process';
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'../exports/cards-toy');await mkdir(out,{recursive:true});
const build=spawnSync(process.execPath,['tools/build-site.mjs','--toy'],{cwd:root,stdio:'inherit'});
if(build.status!==0)process.exit(build.status||1);
const zip=resolve(out,'cards-toy.zip');
const packaged=spawnSync('python',['-c','import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root).as_posix()) for p in sorted(root.rglob("*")) if p.is_file()]; z.close()',resolve(out,'site'),zip],{stdio:'inherit'});
if(packaged.status!==0)process.exit(packaged.status||1);
console.log('Toy ZIP: '+zip);
// 预览脚本和说明放在 ZIP 外，平台收到的仍然只有静态资源。
for(const name of ['start.ps1','stop.ps1'])await copyFile(resolve(root,'tools/toy',name),resolve(out,name));
await copyFile(resolve(root,'docs/TOY.md'),resolve(out,'README.md'));
