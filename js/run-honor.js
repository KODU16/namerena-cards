// 读档履历独立于可回退快照保存；同一位置第二次实际读档永久失去本局皇冠。
const PREFIX='namerena-cards/honor/v1/';
export function beginHonor(run) {
  run.honor={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,loads:{},spoiled:false};
  return run.honor;
}
// 预览不同的下一节点、换槽位或重新存档仍属于同一个当前位置。
export function honorPosition(run) { return JSON.stringify([run.layer||1,run.nodeId||'start']); }
export function syncHonor(run,{loaded=false}={}) {
  if(!run)return;
  const old=run.honor||{id:`legacy-${run.createdAt||0}-${run.seed}-${run.clan||''}`,loads:{},spoiled:false};
  let ledger={};
  try { ledger=JSON.parse(localStorage.getItem(PREFIX+old.id)||'{}')||{}; } catch { /* 保留快照中的履历。 */ }
  const loads={...old.loads};
  for(const [position,count] of Object.entries(ledger.loads||{}))loads[position]=Math.max(loads[position]||0,Number(count)||0);
  if(loaded){const position=honorPosition(run);loads[position]=(loads[position]||0)+1;}
  run.honor={id:old.id,loads,spoiled:!!(old.spoiled||ledger.spoiled||Object.values(loads).some(count=>count>=2))};
  try { localStorage.setItem(PREFIX+old.id,JSON.stringify(run.honor)); } catch { /* 存储不可用时仍保留本次会话履历。 */ }
}
export const hasHonor = run => !!run&&!run.honor?.spoiled;
