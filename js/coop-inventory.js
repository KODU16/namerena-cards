// 合作物品只有房间一份；装备占用与消耗回执都以唯一物品编号保存。
import {normalizeAbilities} from './abilities.js';
import {normalizeRelics} from './relics.js';
const clone=x=>structuredClone(x);
const merge=(old,added,key)=>[...new Map([...old,...added].map(x=>[x[key],x])).values()];
export function initializeInventory(room){
  const states=room.members.map(m=>m.state).filter(Boolean),potions=new Map();
  for(const s of states)for(const p of s.run.potions||[])potions.set(p.id,{id:p.id,n:(potions.get(p.id)?.n||0)+p.n});
  room.inventory={weapons:merge([],states.flatMap(s=>s.weapons||[]),'id'),skillCards:merge([],states.flatMap(s=>s.run.skillCards||[]),'uid'),potions:[...potions.values()],ownedTactics:[...new Set(states.flatMap(s=>s.ownedTactics||[]))],tacticPower:Object.assign({},...states.map(s=>s.tacticPower||{})),relics:normalizeRelics(states.flatMap(s=>s.relics||[])),abilities:normalizeAbilities(states.flatMap(s=>s.abilities||[])),claims:{}};
  bindInventory(room);
}
export function bindInventory(room){
  const bag=room.inventory;if(!bag)return;
  for(const m of room.members){const s=m.state;if(!s)continue;
    s.weapons=clone(bag.weapons.filter(w=>!bag.claims['weapon:'+w.id]));
    s.run.skillCards=clone(bag.skillCards.filter(c=>!bag.claims['skill:'+c.uid]));
    s.run.potions=clone(bag.potions);s.ownedTactics=[...bag.ownedTactics];s.tacticPower={...bag.tacticPower};s.relics=[...bag.relics];s.abilities=clone(bag.abilities);
  }
}
export function captureInventory(room,state){
  const bag=room.inventory;if(!bag)return;
  bag.weapons=merge(bag.weapons,state.weapons||[],'id');bag.skillCards=merge(bag.skillCards,state.run.skillCards||[],'uid');
  for(const p of state.run.potions||[])if(p.n>0&&bag.claims['potion:'+p.id]?.consumed)delete bag.claims['potion:'+p.id];
  bag.potions=clone(state.run.potions||[]);bag.ownedTactics=[...new Set(state.ownedTactics||[])];bag.tacticPower={...state.tacticPower};bag.relics=normalizeRelics(state.relics);bag.abilities=normalizeAbilities(state.abilities);
}
export function requireFree(room,type,id,key,{allowOwner=false}={}){
  const claim=room.inventory?.claims[type+':'+id];
  if(claim&&(!allowOwner||claim.key!==key||claim.consumed))throw Error('此物品已被其他角色使用，请刷新物品栏');
}
export function claimItem(room,type,id,key,character=null,consumed=false){
  room.inventory.claims[type+':'+id]={key,character,consumed};
}
export function releaseItem(room,type,id,key){
  const claim=room.inventory.claims[type+':'+id];if(claim&&claim.key!==key)throw Error('不能释放其他玩家的物品');
  delete room.inventory.claims[type+':'+id];
}
export function inventoryView(room){
  const bag=room.inventory;if(!bag)return null;
  const claims=Object.fromEntries(Object.entries(bag.claims).map(([id,claim])=>{const m=room.members.find(m=>m.key===claim.key),c=m?.state.collection.find(c=>c.id===claim.character);return [id,{...claim,team:m?.team||'',iconName:m?.state.collection[0]?.name||m?.team||'',characterName:c?.name||null}];}));
  return {...clone(bag),claims};
}
