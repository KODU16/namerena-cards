// 原生 16×16 像素图标：整数坐标绘制，四边留空，合并成透明 SVG 雪碧图。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const colors = { ink:'#283044', pale:'#fff5d7', red:'#e65352', orange:'#ef993b', gold:'#f1c84b', green:'#55aa69', mint:'#86d5ac', blue:'#4d88cb', ice:'#90dcdf', purple:'#9c6abd', pink:'#e987b6', steel:'#98afbf', dark:'#535d7d', white:'#ffffff' };
const skills = ['fire','ice','thunder','quake','absorb','poison','rapid','critical','half','exchange','berserk','charm','haste','slow','curse','heal','revive','disperse','iron','charge','accumulate','assassinate','summon','clone','shadow','defend','protect','reflect','reraise','shield','counter','merge','zombie','upgrade','hide','explode','possess'];
const stats = ['atk','def','spd','agi','mag','res','wis','hp'];
const tactics = ['atk','def','spd','agi','mag','res','hp','wis','fire','ice','thunder','iron','reflect','summon','shadow','revive','poison','heal','shield','protect'];
const objects = ['battle','deck','ladder','engine','help','win','lose','speed','coin','normal','star','weapon','forge','bag','event','camp','cpu','shop','boss'];
const keys = [...stats, ...skills.map(s=>'skl'+s), ...tactics.map(s=>'t-'+s), ...stats.filter(s=>s!=='hp').concat(['hp','mp']).map(s=>'potion-'+s), ...objects];
const cols=10, rows=Math.ceil(keys.length/cols);
const makeGrid=()=>Array.from({length:16},()=>Array(16).fill(null));
let grid;
const dot=(x,y,c)=>{if(x>=1&&x<=14&&y>=1&&y<=14)grid[y][x]=c;};
const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)dot(i,j,c);};
const line=(x,y,tx,ty,c)=>{let dx=Math.abs(tx-x),sx=x<tx?1:-1,dy=-Math.abs(ty-y),sy=y<ty?1:-1,e=dx+dy;for(;;){dot(x,y,c);if(x===tx&&y===ty)break;const e2=2*e;if(e2>=dy){e+=dy;x+=sx;}if(e2<=dx){e+=dx;y+=sy;}}};
const ring=(x,y,r,c)=>{for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const d=i*i+j*j;if(d<=r*r&&d>(r-1)*(r-1))dot(x+i,y+j,c);}};
const mask=(rows,x,y,c)=>rows.forEach((r,j)=>[...r].forEach((v,i)=>{if(v!==' ')dot(x+i,y+j,v==='+'?'pale':v==='o'?'ink':c);}));
const cross=(x,y,c)=>{rect(x-1,y-3,3,7,c);rect(x-3,y-1,7,3,c);};
const spark=(x,y,c)=>{line(x-2,y,x+2,y,c);line(x,y-2,x,y+2,c);};
const heart=(c='red',x=3,y=4)=>mask([' oo  oo ','o++oo++o','o++++++o','o++++++o',' o++++o ','  o++o  ','   oo   '].map(r=>r.replaceAll('+','x')),x,y,c);
const shield=(c='blue')=>{mask(['oooooooooo','o++++++++o','oxxxxxxxxo','oxxxxxxxxo','oxxxxxxxxo',' oxxxxxxo ','  oxxxxo  ','   oxxo   ','    oo    '],3,3,c);};
const blade=(c='steel',offset=0)=>{line(5+offset,10,11+offset,4,'ink');line(6+offset,10,12+offset,4,c);line(6+offset,9,11+offset,4,'pale');line(3+offset,9,7+offset,13,'gold');line(3+offset,13,5+offset,11,'dark');};
const arrow=(c='gold',down=false)=>{const y=down?10:5,tip=down?13:2;rect(7,down?4:5,2,7,c);line(4,y,7,tip,c);line(11,y,8,tip,c);};
const skull=(c='pale')=>{rect(4,3,8,8,'ink');rect(3,5,10,5,'ink');rect(5,4,6,7,c);rect(4,6,8,3,c);rect(5,7,2,2,'ink');rect(9,7,2,2,'ink');rect(6,11,4,2,c);dot(7,10,'ink');dot(8,10,'ink');dot(7,12,'ink');dot(9,12,'ink');};
const bottle=(c='green')=>{rect(6,2,4,2,'gold');rect(5,4,6,3,'ink');rect(3,7,10,6,'ink');rect(4,6,8,7,'ink');rect(5,5,6,7,'ice');rect(4,8,8,4,c);rect(5,12,6,1,c);rect(5,7,2,3,'pale');};
const eye=(c='purple')=>{mask(['    oooo    ','  ooxxxxoo  ',' oxxxxxxxxo ','oxxxxxxxxxxo',' oxxxxxxxxo ','  ooxxxxoo  ','    oooo    '],2,5,c);rect(7,6,3,5,'ink');dot(8,7,'white');};
const person=(x,c)=>{rect(x+1,3,3,3,'ink');rect(x+1,4,3,2,c);rect(x,7,5,5,'ink');rect(x+1,7,3,4,c);dot(x+1,13,c);dot(x+3,13,c);};
function paint(name){
  switch(name){
    case 'fire':mask(['     x    ','    xx    ','  x xxx   ','  xxxxx x ',' x+xxxxxx ',' x+++xxx  ',' x++++xx  ','  x++xx   ','   xxx    '],3,3,'orange');rect(7,8,2,4,'gold');break;
    case 'ice':for(const [x,y] of [[8,2],[8,14],[2,5],[14,11],[2,11],[14,5]])line(8,8,x,y,'ice');for(const [x,y]of [[5,4],[11,4],[5,12],[11,12]])spark(x,y,'blue');dot(8,8,'pale');break;
    case 'thunder':mask(['    xxxxx','   xxxxx ','  xxxxx  ',' xxxxx   ','xxxxxxx  ','   xxxx  ','  xxxx   ',' xxxx    ','xxx      ','xx       '],3,3,'gold');line(8,3,4,8,'pale');break;
    case 'quake':rect(2,9,12,4,'dark');rect(3,6,10,3,'orange');line(9,3,6,7,'pale');line(6,7,9,10,'ink');line(9,10,7,14,'ink');break;
    case 'absorb':mask(['    x   ','   xxx  ','  xxxxx ',' xxxxxxx',' xxxxxxx',' xx++xxx','  xxxxx ','   xxx  '],4,3,'red');cross(11,11,'pale');break;
    case 'poison':bottle('green');rect(7,9,1,2,'ink');rect(10,9,1,2,'ink');dot(9,12,'ink');break;
    case 'rapid':blade('steel',-1);line(9,10,13,6,'ice');line(10,12,14,8,'ice');break;
    case 'critical':spark(8,7,'orange');spark(5,10,'red');blade();break;
    case 'half':ring(8,8,2,'green');for(const [x,y]of [[8,4],[4,11],[12,11]]){ring(x,y,3,'green');dot(x,y,'gold');}break;
    case 'exchange':heart('pink');line(2,3,11,3,'ice');line(11,3,9,1,'ice');line(4,13,13,13,'purple');line(4,13,6,15,'purple');break;
    case 'berserk':rect(4,4,8,8,'red');line(3,2,6,5,'gold');line(12,2,9,5,'gold');line(5,7,7,8,'ink');line(10,7,8,8,'ink');rect(6,11,4,1,'pale');break;
    case 'charm':heart('pink');spark(12,3,'gold');break;
    case 'haste':mask(['xxxxxxxxxx',' xxxxxxxx ','   xxxxxx ','    xxxx  ','     xxx  ','      xx  '],2,4,'mint');line(3,12,10,12,'green');break;
    case 'slow':rect(4,2,8,2,'steel');rect(4,12,8,2,'steel');line(5,4,10,11,'purple');line(10,4,5,11,'purple');rect(7,5,2,2,'gold');rect(6,10,4,2,'gold');break;
    case 'curse':skull('purple');spark(12,3,'pink');break;
    case 'heal':cross(8,8,'green');rect(7,5,1,6,'mint');spark(3,3,'pale');break;
    case 'revive':cross(8,8,'mint');line(2,10,5,6,'pale');line(13,10,10,6,'pale');line(3,12,5,9,'gold');line(12,12,10,9,'gold');break;
    case 'disperse':line(4,12,11,5,'steel');spark(11,4,'gold');spark(4,5,'ice');dot(13,9,'white');break;
    case 'iron':shield('steel');for(let y=5;y<10;y+=2)line(5,y,10,y,'dark');break;
    case 'charge':ring(8,8,6,'orange');paint('thunder');break;
    case 'accumulate':ring(8,8,5,'orange');rect(5,6,6,5,'gold');rect(4,7,2,3,'pale');rect(6,4,1,3,'pale');rect(8,4,1,3,'pale');break;
    case 'assassinate':blade('purple');line(3,3,6,3,'red');dot(4,4,'pale');break;
    case 'summon':ring(8,9,5,'purple');line(4,2,6,7,'red');line(12,2,10,7,'red');line(4,11,8,5,'pink');line(8,5,12,11,'pink');line(4,9,12,9,'pink');break;
    case 'clone':person(2,'ice');person(9,'blue');break;
    case 'shadow':mask(['   oooo   ','  oxxxxo  ',' oxxxxxxo ',' ooxxxoxo ','oxxxxxxxxo','oxxxxxxxxo','oxxxxxxxxo','oxoxxoxoxo',' o oo o o '],3,3,'purple');rect(6,6,1,2,'pale');rect(10,6,1,2,'pale');break;
    case 'defend':shield('blue');line(7,5,7,10,'pale');break;
    case 'protect':shield('green');rect(6,6,4,3,'pink');dot(7,9,'pink');dot(8,9,'pink');break;
    case 'reflect':ring(8,8,5,'ice');line(3,3,3,7,'blue');line(3,3,7,3,'blue');line(13,13,13,9,'purple');line(13,13,9,13,'purple');break;
    case 'reraise':line(4,2,8,6,'steel');line(12,2,8,6,'steel');ring(8,9,4,'gold');cross(8,9,'pale');break;
    case 'shield':shield('gold');rect(7,5,2,6,'pale');rect(5,7,6,2,'pale');break;
    case 'counter':blade();line(3,5,3,9,'red');line(3,5,7,5,'red');line(3,5,5,3,'red');break;
    case 'merge':ring(8,8,6,'purple');rect(4,7,8,3,'ink');for(let x=4;x<12;x+=2){dot(x,7,'pale');dot(x+1,9,'pale');}break;
    case 'zombie':skull('green');line(2,12,5,9,'purple');break;
    case 'upgrade':heart('red');arrow('gold');break;
    case 'hide':eye('dark');line(3,13,12,3,'steel');break;
    case 'explode':ring(7,9,5,'dark');rect(5,5,6,7,'ink');line(9,4,12,2,'orange');spark(12,2,'gold');dot(5,7,'pale');break;
    case 'possess':eye('pink');ring(8,8,6,'purple');break;
    case 'atk':case 'weapon':case 'normal':blade();break;
    case 'def':shield('steel');break;
    case 'spd':paint('haste');break;
    case 'agi':eye('green');break;
    case 'mag':rect(7,4,2,9,'purple');spark(8,3,'pink');line(3,13,12,13,'gold');break;
    case 'res':shield('purple');spark(8,7,'pale');break;
    case 'wis':rect(2,3,12,10,'ink');rect(3,4,4,8,'pale');rect(9,4,4,8,'gold');line(8,4,8,13,'dark');break;
    case 'hp':heart();break;
    case 'mp':paint('thunder');break;
    case 'battle':blade('steel',-1);line(3,3,12,12,'red');line(3,4,11,12,'pale');break;
    case 'deck':rect(3,2,8,11,'dark');rect(5,4,8,10,'gold');rect(6,5,6,8,'pale');spark(9,8,'red');break;
    case 'ladder':for(let y=3;y<14;y+=3)line(4,y,11,y,'gold');line(4,2,4,14,'steel');line(11,2,11,14,'steel');break;
    case 'engine':ring(8,8,5,'steel');for(const [x,y]of [[7,1],[7,13],[1,7],[13,7]])rect(x,y,2,2,'steel');ring(8,8,2,'blue');break;
    case 'help':ring(8,8,6,'blue');mask(['xxx','  x',' xx',' x ','   ',' x '],7,5,'pale');break;
    case 'win':rect(4,3,8,5,'gold');rect(5,8,6,2,'orange');rect(7,10,2,3,'gold');rect(5,13,6,1,'steel');line(2,4,2,7,'gold');line(13,4,13,7,'gold');break;
    case 'lose':skull();break;
    case 'speed':line(3,3,8,8,'gold');line(8,8,3,13,'gold');line(8,3,13,8,'orange');line(13,8,8,13,'orange');break;
    case 'coin':ring(8,8,6,'orange');ring(8,8,4,'gold');rect(7,5,2,6,'pale');break;
    case 'star':spark(8,8,'gold');line(4,4,12,12,'orange');line(4,12,12,4,'orange');dot(8,8,'pale');break;
    case 'forge':rect(2,10,12,3,'steel');rect(5,13,6,1,'dark');rect(6,2,7,3,'gold');line(8,5,5,10,'orange');break;
    case 'bag':rect(5,2,6,3,'orange');rect(3,5,10,8,'dark');rect(4,6,8,6,'orange');rect(5,9,6,3,'gold');dot(8,8,'pale');break;
    case 'event':paint('help');spark(3,2,'pink');break;
    case 'camp':paint('fire');line(3,13,12,13,'orange');line(4,12,10,14,'dark');break;
    case 'cpu':rect(2,2,12,9,'ink');rect(3,3,10,7,'blue');rect(4,4,8,5,'mint');rect(7,11,2,2,'steel');rect(4,13,8,1,'steel');line(5,6,6,7,'green');line(6,7,9,4,'green');break;
    case 'shop':rect(3,7,10,7,'orange');rect(2,4,12,4,'red');for(let x=3;x<14;x+=4)rect(x,4,2,4,'pale');rect(5,9,3,5,'dark');rect(10,9,2,3,'ice');break;
    case 'boss':rect(4,4,8,8,'red');line(3,2,5,5,'gold');line(12,2,10,5,'gold');rect(5,7,2,2,'pale');rect(9,7,2,2,'pale');rect(6,11,4,1,'ink');break;
    default:throw new Error('No icon design for '+name);
  }
}
function design(key){grid=makeGrid();if(key.startsWith('potion-')){const id=key.slice(7);const tint={atk:'red',def:'blue',spd:'green',agi:'gold',mag:'purple',res:'ice',wis:'orange',hp:'pink',mp:'blue'}[id];bottle(tint);const marks={atk:[7,8,2,4],def:[6,9,4,2],spd:[8,8,1,4],agi:[7,9,3,1],mag:[7,8,2,2],res:[6,8,4,1],wis:[6,10,4,1],hp:[7,8,2,4],mp:[8,8,2,3]};rect(...marks[id],'pale');if(id==='hp')rect(6,9,4,2,'pale');}
else if(key.startsWith('t-')){paint(key.slice(2));line(2,2,5,2,'steel');line(2,2,2,5,'steel');line(13,10,13,13,'steel');line(10,13,13,13,'steel');}
else paint(key.startsWith('skl')?key.slice(3):key);return grid;}
// 按连续同色横线编码，减小 SVG 字节数；所有图形均使用整像素边界。
function svgPaths(g){const byColor=new Map();for(let y=0;y<16;y++)for(let x=0;x<16;){const c=g[y][x];if(!c){x++;continue;}let end=x+1;while(end<16&&g[y][end]===c)end++;const path='M'+x+' '+y+'h'+(end-x)+'v1h-'+(end-x)+'z';byColor.set(c,(byColor.get(c)||'')+path);x=end;}return [...byColor].map(([c,d])=>'<path fill="'+colors[c]+'" d="'+d+'"/>').join('');}
const groups=keys.map((key,i)=>'<view id="icon-'+key+'" viewBox="'+(i%cols*16)+' '+(Math.floor(i/cols)*16)+' 16 16"/><g id="'+key+'" transform="translate('+(i%cols*16)+' '+(Math.floor(i/cols)*16)+')">'+svgPaths(design(key))+'</g>');
await writeFile(resolve(root,'assets/icons-16.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="'+cols*16+'" height="'+rows*16+'" viewBox="0 0 '+cols*16+' '+rows*16+'" shape-rendering="crispEdges">'+groups.join('')+'</svg>');
await writeFile(resolve(root,'js/emoji-order.js'),'// 自动生成：16×16 原生像素图标的排列，修改 tools/build-icons.mjs 后重建。\nexport const ICON_COLUMNS = '+cols+';\nexport const ICON_ROWS = '+rows+';\nexport const EMOJI_ORDER = '+JSON.stringify(keys)+';\n');
// 发布版使用索引色无损 PNG；源 SVG 留在仓库中，避免服务器不压缩 SVG 时增加流量。
const palette = [null, ...Object.keys(colors)];
const width = cols * 16, height = rows * 16;
const pixels = Buffer.alloc(width * height);
keys.forEach((key, i) => {
  const g = design(key), ox = (i % cols) * 16, oy = Math.floor(i / cols) * 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pixels[(oy + y) * width + ox + x] = palette.indexOf(g[y][x]);
});
const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
const plte = Buffer.from(palette.flatMap((key) => key ? colors[key].slice(1).match(/../g).map((n) => parseInt(n, 16)) : [0, 0, 0]));
const raster = Buffer.alloc(height * (width + 1));
for (let y = 0; y < height; y++) pixels.copy(raster, y * (width + 1) + 1, y * width, (y + 1) * width);
await writeFile(resolve(root, 'assets/icons-16.png'), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', Buffer.from(palette.map((key) => key ? 255 : 0))),
  chunk('IDAT', deflateSync(raster, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log('icons: '+keys.length+' native 16x16 designs in one SVG');
