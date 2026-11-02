// 抽签只读独立词库，不触碰战斗、角色、分数或存档。
import {el} from './ui.js';

let poolPromise;
export function validateFortunes(data) {
  const rows=data?.entries;
  if(!Array.isArray(rows)||rows.length!==2000||new Set(rows.map(r=>r?.text)).size!==2000
    ||rows.some(r=>typeof r.text!=='string'||!r.text||[...r.text].length>16||!Number.isFinite(r.score))) {
    throw new Error('签文暂时无法读取');
  }
  return rows;
}

// 拒绝取模尾段，让 2000 条签逐条等概率，而不是先抽吉凶类别。
export function secureRandomIndex(length, fill=(values)=>globalThis.crypto.getRandomValues(values)) {
  if(!Number.isInteger(length)||length<1||length>0x100000000)throw new RangeError('Invalid fortune pool size');
  const limit=Math.floor(0x100000000/length)*length,value=new Uint32Array(1);
  do { fill(value); } while(value[0]>=limit);
  return value[0]%length;
}
export function pickFortune(rows, randomIndex=secureRandomIndex) { return rows[randomIndex(rows.length)]; }

async function loadPool() {
  if(!poolPromise)poolPromise=fetch('data/fortunes.json').then(response=>{
    if(!response.ok)throw new Error('签文加载失败，请重试');
    return response.json();
  }).then(validateFortunes).catch(error=>{poolPromise=null;throw error;});
  return poolPromise;
}

export function installFortune() {
  if(document.getElementById('fortune-launch'))return;
  let rows=null,revision=0;
  const result=el('p',{class:'fortune__result','aria-live':'polite','aria-atomic':'true'});
  const status=el('p',{class:'fortune__status',role:'status'});
  const tube=el('div',{class:'fortune__tube','aria-hidden':'true'},
    el('i',{}),el('i',{}),el('i',{}),el('span',{},'签'));
  const draw=el('button',{class:'primary fortune__draw',type:'button',autofocus:true},'抽签');
  const close=el('button',{class:'ghost fortune__close',type:'button','aria-label':'关闭抽签'},'×');
  const dialog=el('dialog',{id:'fortune-dialog',class:'fortune','aria-labelledby':'fortune-title','aria-describedby':'fortune-prompts'},
    el('section',{class:'fortune__paper'},
      el('header',{class:'fortune__head'},el('span',{},'NAMERENA · 群语签'),close),
      el('h2',{id:'fortune-title'},'抽签'),
      el('div',{class:'fortune__stage'},tube,result),draw,
      // 两条提示固定在抽签按钮下方；结果区域只显示简短签语。
      el('div',{id:'fortune-prompts',class:'fortune__prompts'},el('p',{},'在心里默想要抽签的事'),
        el('p',{},'每个问题只有第一次抽签才是准确的')),
      status));
  const launch=el('button',{id:'fortune-launch',class:'fortune-launch',type:'button','aria-haspopup':'dialog'},
    el('span',{'aria-hidden':'true'},'签'),'抽签');

  async function prepare(ticket) {
    draw.disabled=true;status.textContent='正在准备签文…';
    try {
      rows=await loadPool();
      if(ticket!==revision||!dialog.open)return;
      status.textContent='';draw.textContent='抽签';draw.disabled=false;
    } catch(error) {
      if(ticket!==revision||!dialog.open)return;
      status.textContent=error.message;draw.textContent='重新加载';draw.disabled=false;
    }
  }
  launch.addEventListener('click',()=>{
    // 使用独立模态窗口，返回后保留原地图、商店或战斗界面。
    const ticket=++revision;result.textContent='';dialog.classList.remove('is-revealed','is-drawing');
    dialog.showModal();prepare(ticket);
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{revision++;dialog.classList.remove('is-drawing');});
  draw.addEventListener('click',async()=>{
    if(draw.disabled)return;
    if(!rows){await prepare(revision);return;}
    const ticket=revision;draw.disabled=true;status.textContent='';
    dialog.classList.remove('is-revealed');dialog.classList.add('is-drawing');result.textContent='';
    try {
      const selected=pickFortune(rows);
      const delay=matchMedia('(prefers-reduced-motion: reduce)').matches?0:480;
      await new Promise(resolve=>setTimeout(resolve,delay));
      if(ticket!==revision||!dialog.open)return;
      // 不展示解释、分数或吉凶标签，只展示词库中的原定短签。
      result.textContent=selected.text;dialog.classList.add('is-revealed');draw.textContent='再抽一签';
    } catch {
      if(ticket===revision&&dialog.open)status.textContent='没能抽出签，请重试';
    } finally {
      if(ticket===revision&&dialog.open){dialog.classList.remove('is-drawing');draw.disabled=false;}
    }
  });
  document.body.append(launch,dialog);
}
