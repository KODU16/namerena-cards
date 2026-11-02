// 固化 2000 条短签，发布时直接抽已有条目；构建不读取私人聊天记录。
import {writeFileSync, readFileSync} from 'node:fs';
import {BANDS, FRAMES, GRADES} from './fortune-language.mjs';
const lexicon=JSON.parse(readFileSync(new URL('../data/fortune-lexicon.json',import.meta.url),'utf8'));
const entries=[];
for(const [band, phrases] of BANDS.entries()) {
 if(phrases.length!==5)throw Error('Each tone band needs five short phrases');
 for(const phrase of phrases)for(const frame of FRAMES) {
  const text=frame+phrase,index=entries.length;
  // 所有短签均含经语料核对的熟词；“猴完了”为用户明确指定的低频例外。
  const term=lexicon.find(t=>phrase.includes(t.term));
  if(!term||(!term.explicit&&term.messages<5))throw Error('Unfamiliar expression: '+phrase);
  entries.push({id:index+1,score:Math.round((index-999.5)*10)/100,grade:GRADES[Math.floor(band/4)],term:term.term,text});
 }
}
if(entries.length!==2000||new Set(entries.map(e=>e.text)).size!==2000)throw Error('Expected 2000 distinct short fortunes');
if(entries.some(e=>[...e.text].length>16))throw Error('Fortune must remain a short expression');
writeFileSync(new URL('../data/fortunes.json',import.meta.url),JSON.stringify({version:1,entries}));
console.log('fortunes: 2000 short expressions, 1000 negative / 1000 positive, 200 per grade');
