// 合并独立的透明 32px 图标，战术卡和重复物体使用别名，避免重复下载。
import {readFile,writeFile} from 'node:fs/promises';
import {inflateSync,deflateSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const {size,columns,keys,aliases}=JSON.parse(await readFile(new URL('tools/icon-manifest.json',root)));
const rows=Math.ceil(keys.length/columns),width=columns*size,height=rows*size;
const pixels=Buffer.alloc(width*height*4);
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
// Pillow 输出为非交错 RGBA；解码五种 PNG 行滤波后，按整数单元复制。
function decode(png){
  const idat=[];let w,h;
  for(let p=8;p<png.length;){const len=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8),data=png.subarray(p+8,p+8+len);p+=len+12;
    if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);if(data[8]!==8||data[9]!==6||data[12]!==0)throw Error('Expected 8-bit noninterlaced RGBA');}
    if(type==='IDAT')idat.push(data);
  }
  if(w!==size||h!==size)throw Error('Expected '+size+'px sprite');
  const raw=inflateSync(Buffer.concat(idat)),out=Buffer.alloc(w*h*4),stride=w*4;
  for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Invalid PNG filter');
    for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?out[i-4]:0,b=y?out[i-stride]:0,c=y&&x>=4?out[i-stride-4]:0;
      out[i]=(raw[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;if(out[i+3]!==0&&out[i+3]!==255)throw Error('Expected binary alpha');if((x<2||y<2||x>=size-2||y>=size-2)&&out[i+3])throw Error('Sprite needs two transparent padding pixels');if(!out[i+3])out.fill(0,i,i+4);}
  return out;
}
for(const [i,key]of keys.entries()){
  const icon=decode(await readFile(new URL('assets/icons32/'+key+'.png',root))),ox=i%columns*size,oy=Math.floor(i/columns)*size;
  for(let y=0;y<size;y++)icon.copy(pixels,((oy+y)*width+ox)*4,y*size*4,(y+1)*size*4);
}
for(const target of Object.values(aliases))if(!keys.includes(target))throw Error('Invalid icon alias: '+target);
const crc32=data=>{let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([len,body,crc]);};
// 共用调色板时使用索引 PNG：透明像素占第零项，像素颜色保持无损。
const palette=[[0,0,0]],lookup=new Map(),indexed=Buffer.alloc(width*height);
for(let i=0;i<width*height;i++){const p=i*4;if(!pixels[p+3])continue;const key=pixels.subarray(p,p+3).toString('hex');if(!lookup.has(key)){lookup.set(key,palette.length);palette.push([...pixels.subarray(p,p+3)]);}indexed[i]=lookup.get(key);}
if(palette.length>256)throw Error('Run prepare-icons32.py to share a 255-color palette');
const stride=width,raster=Buffer.alloc(height*(stride+1));
for(let y=0;y<height;y++)indexed.copy(raster,y*(stride+1)+1,y*stride,(y+1)*stride);
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=3;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',Buffer.from(palette.flat())),chunk('tRNS',Buffer.from(palette.map((_,i)=>i?255:0))),chunk('IDAT',deflateSync(raster,{level:9})),chunk('IEND',Buffer.alloc(0))]);
await writeFile(new URL('assets/icons-32.png',root),png);
await writeFile(new URL('js/emoji-order.js',root),'// 自动生成：独立 32px 图标的排列与复用关系，修改 tools/icon-manifest.json 后重建。\nexport const ICON_SIZE = '+size+';\nexport const ICON_COLUMNS = '+columns+';\nexport const ICON_ROWS = '+rows+';\nexport const EMOJI_ORDER = '+JSON.stringify(keys)+';\nexport const ICON_ALIASES = '+JSON.stringify(aliases)+';\n');
console.log('icons: '+keys.length+' independent 32x32 sprites, '+Object.keys(aliases).length+' aliases, '+png.length+' bytes');
