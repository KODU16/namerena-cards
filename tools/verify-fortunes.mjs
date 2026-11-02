// 检查实际签库的覆盖、均衡和抽样边界，不固定页面源码或字符串实现。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.document={getElementById(){},addEventListener(){}};
const {validateFortunes,secureRandomIndex,pickFortune}=await import('../js/fortune.js');
const payload=JSON.parse(readFileSync('data/fortunes.json','utf8')),rows=validateFortunes(payload);
const lexicon=JSON.parse(readFileSync('data/fortune-lexicon.json','utf8'));
assert.equal(rows.filter(r=>r.score<0).length,1000);
assert.equal(rows.filter(r=>r.score>0).length,1000);
const grades=new Map();
for(const [index,row] of rows.entries()) {
  assert.equal(row.id,index+1);
  if(index)assert.ok(Math.abs(row.score-rows[index-1].score-.1)<1e-9);
  assert.ok(!/[。！？；：\n]/.test(row.text));
  const term=lexicon.find(t=>t.term===row.term);
  assert.ok(term&&(term.messages>=5||term.explicit));assert.ok(row.text.includes(term.term));
  assert.strictEqual(pickFortune(rows,()=>index),row);
  grades.set(row.grade,(grades.get(row.grade)||0)+1);
}
assert.equal(grades.size,10);assert.ok([...grades.values()].every(n=>n===200));
assert.ok(rows.some(r=>r.text==='猴完了'&&r.score<0));
assert.ok(rows.some(r=>r.text==='滚木了'&&r.score<0));
assert.ok(rows.some(r=>r.text==='小豹'&&r.score>0));
assert.ok(rows.some(r=>r.text==='豹完了'&&r.score>0));
assert.ok(rows.some(r=>r.text==='不太豹'&&r.score<0));
assert.ok(rows.some(r=>r.text==='差点出货'&&r.score<0));
assert.ok(rows.some(r=>r.text==='周猴了'&&r.score<0));
assert.ok(rows.some(r=>r.text==='被抬走了'&&r.score<0));
assert.ok(rows.some(r=>r.text==='强得逆天'&&r.score>0));
assert.ok(rows.every(r=>!['幻术','分身','净化','苏生','轮椅'].includes(r.text)));
// Uint32 的不能整除尾段必须拒绝；每个下标都可被命中。
let calls=0;
assert.equal(secureRandomIndex(2000,v=>{v[0]=calls++===0?0xffffffff:1999;}),1999);assert.equal(calls,2);
for(let i=0;i<2000;i++)assert.equal(secureRandomIndex(2000,v=>{v[0]=i;}),i);
assert.throws(()=>secureRandomIndex(0));assert.throws(()=>secureRandomIndex(1.5));
assert.throws(()=>validateFortunes({entries:rows.slice(1)}));
assert.throws(()=>validateFortunes({entries:rows.map((r,i)=>i===1?rows[0]:r)}));
console.log(JSON.stringify({entries:rows.length,negative:1000,positive:1000,grades:Object.fromEntries(grades),uniformBoundaries:'passed',shortResults:'passed'}));
