// 合作爬塔规则由主站运行；浏览器只接收个人投影，不提交角色数值或胜负。
import * as G from './game.js';
import {makeCard,buildLine,applyTactics,engineWasm,iconFor} from './engine.js';
import {abilityPacket,normalizeAbilities,abilityMpCost} from './abilities.js';
import {drawHand,ACTIVE_ID,NORMAL_ID,canPlayHandCard} from './hand.js';
import {levelOf,SKILLS,effectiveSkillLevel} from './skills.js';
import {rollRelic,RELIC_RARITIES} from './relics.js';
import {initializeInventory,bindInventory,captureInventory,requireFree,claimItem,releaseItem,inventoryView} from './coop-inventory.js';

export const COOP_RULES_VERSION=1;
export const COOP_LANES=['1A','1B','2A','2B'];
const combatKinds=new Set(['filler','elite','ladder','end']);
const fail=message=>{throw Error(message);};
const seedFor=(room,key,salt=0)=>{let n=room.seed^salt;for(const c of String(key))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export const activeMembers=room=>room.members.filter(m=>!m.spectator&&!m.left);
const fighters=room=>room.members.filter(m=>!m.left&&m.state&&available(m).length>0);
const needsInput=m=>!m.spectator&&!m.auto;
export function restoreCoop(room){
  for(const m of room.members){const s=m.state;if(!s)continue;s.run.graph.byId=new Map(s.run.graph.nodes.map(n=>[n.id,n]));}
  bindInventory(room);return room;
}
export function createCoopRoom({id,seed,host,team,lane='1A',nodeCount=40,turnSeconds=30,difficulty=0}){
  if(!Number.isInteger(difficulty)||difficulty<0||difficulty>20)fail('难度必须为 A0～A20');
  if(!Number.isInteger(turnSeconds)||turnSeconds<5||turnSeconds>180)fail('出牌时限须为 5～180 秒');
  if(!Number.isInteger(nodeCount)||nodeCount<20||nodeCount>80||nodeCount%10)fail('每层节点数必须为 20～80 的十倍数');
  if(!COOP_LANES.includes(lane))fail('联机只支持 1A、1B、2A、2B');
  return {id,seed:seed>>>0,host,lane,nodeCount,turnSeconds,difficulty,version:0,rules:COOP_RULES_VERSION,status:'waiting',phase:'waiting',score:0,population:0,members:[{key:host,team,ready:false,spectator:false,left:false}],votes:{},receipts:[],log:[]};
}
export function joinCoop(room,{key,team}){
  if(room.members.some(m=>m.key===key))return;
  if(room.status!=='waiting'||room.members.length>=4)fail('房间已开局或已满 4 人');
  room.members.push({key,team,ready:false,spectator:false,left:false});room.version++;
}
function personalState(member){
  const s=member.state;s.run.graph.byId=new Map(s.run.graph.nodes.map(n=>[n.id,n]));return s;
}
function syncScore(room){for(const m of room.members)if(m.state)m.state.run.score=room.score;}
function available(m){return m.state.collection.filter(c=>!m.state.run.downed.includes(c.id));}
function changeShared(room,delta){room.score=Math.max(0,room.score+delta);if(delta<0){if(room.inventory)room.inventory.relics=room.inventory.relics.filter(id=>id!=='battle-coin');for(const m of room.members)m.state.relics=m.state.relics.filter(id=>id!=='battle-coin');}syncScore(room);bindInventory(room);}
function mutatePersonal(room,m,fn){syncScore(room);bindInventory(room);const before=room.score,result=fn(personalState(m)),delta=m.state.run.score-before;captureInventory(room,m.state);changeShared(room,delta);return result;}
export async function startCoop(room,context){
  if(room.status!=='waiting'||room.members.length<2||room.members.length>4||!room.members.every(m=>m.ready))fail('需要 2～4 人全部准备后开局');
  const entries=context.entries||await context.ladder(room.lane);
  for(const [index,m] of room.members.entries()){
    const s=G.createState();s.tacticsPool=context.tactics;s.customCards=[];
    const rng=G.mulberry32(seedFor(room,m.key));const names=m.names||[];
    const starters=Array.from({length:Number(room.lane[0])},(_,i)=>makeCard(names[i]||G.randomName(rng),m.team));
    await G.startRun(s,{seed:room.seed,lane:room.lane,clan:m.team,nodeCount:room.nodeCount,difficulty:room.difficulty||0,laneEntries:entries,starters});
    // 每人独立奖励随机流，地图与敌人种子仍由房间共同决定。
    s.run.coopPersonalSeed=seedFor(room,m.key,index);m.state=s;m.done=false;m.ready=false;
  }
  room.population=room.members.length;room.status='active';room.phase='map';room.votes={};initializeInventory(room);syncScore(room);
}
export function coopOpponent(room){
  const s=personalState(room.members[0]),node=G.currentNode(s),base=G.currentOpponent(s);
  if(!base)fail('战斗节点没有敌人');
  let cards=[];
  for(let i=0;i<room.population;i++){
    // 天梯复制同一原节点，试炼则重新生成彼此独立的随机 @! 队伍。
    if(node.kind==='filler')cards.push(...G.makeFiller(s.run.teamSize,G.mulberry32(seedFor(room,node.id,i+1))).map(c=>G.applyDifficultyEnemy(c,s.run,'normal')));
    else if(node.kind==='elite'){
      const rng=G.mulberry32(seedFor(room,node.id,i+1)),mult=node.payload.mode==='heavy'?node.payload.mult:1;
      cards.push(...Array.from({length:base.cards.length},()=>{const c=makeCard(G.randomName(rng),'!');c.eliteMult=mult;c.stats=Object.fromEntries(Object.entries(c.stats).map(([k,v])=>[k,Math.round(v*mult)]));return G.applyDifficultyEnemy(c,s.run,'elite');}));
    }
    else cards.push(...structuredClone(base.cards));
  }
  // A20 最终关在复制后保留真实 tswn 组队加成。
  if(node.kind==='end'&&s.run.layer===10&&s.run.difficulty===20)cards=boostFinalEnemyGroup(cards);
  return {...base,cards,teamSize:cards.length};
}
// 通过原始名字的真实分组导出计算组队收益，再保留节点的 Boss 与难度倍率。
function boostFinalEnemyGroup(cards){
  const raw=engineWasm().to_diy(cards.map(c=>c.name+'@'+c.clan).join('+'));
  const built=[];let cursor=0;
  while(cursor<raw.length){
    const start=raw.indexOf('+ol:',cursor);if(start<0)break;
    let depth=0,quoted=false,escaped=false,end=start+4;
    for(;end<raw.length;end++){
      const ch=raw[end];
      if(quoted){if(escaped)escaped=false;else if(ch.charCodeAt(0)===92)escaped=true;else if(ch.charCodeAt(0)===34)quoted=false;}
      else if(ch.charCodeAt(0)===34)quoted=true;
      else if(ch==='{')depth++;
      else if(ch==='}'&&--depth===0){end++;break;}
    }
    built.push(JSON.parse(raw.slice(start+4,end)));cursor=end+1;
  }
  if(built.length!==cards.length)fail('最终关组队构建失败');
  const keys=['atk','def','spd','agi','mag','res','wis','hp'];
  return cards.map((card,i)=>{
    const natural=makeCard(card.name,card.clan),group=built[i];
    return {...card,groupBoosted:true,stats:Object.fromEntries(keys.map((key,lane)=>[key,Math.round(group.attrs[lane]*(card.stats[key]/Math.max(1,natural.stats[key])))])),skillList:Object.entries(group.skills||{}).map(([id,v])=>({id,lv:Math.round(levelOf(v)),cat:SKILLS[id]?.cat||'atk'})).filter(k=>SKILLS[k.id]&&k.lv>0)};
  });
}
function enterVotedNode(room,id){
  for(const m of room.members){const s=personalState(m);if(!G.selectNode(s,id))fail('节点不可达');m.done=m.spectator;m.ready=m.spectator;}
  room.votes={};const node=G.currentNode(room.members[0].state);room.node=id;
  if(combatKinds.has(node.kind)){room.phase='prep';room.opponent=coopOpponent(room);return;}
  room.phase='node';
  const coinStart=room.score,coinHeld=room.inventory.relics.includes('battle-coin');
  for(const m of room.members){
    if(m.spectator||m.auto){G.clearNode(personalState(m));m.done=true;continue;}
    const s=personalState(m),n=G.currentNode(s),r=G.mulberry32(seedFor(room,m.key,s.run.index));
    // 功能内容按成员生成并存下，刷新、重复请求不会重新抽取。
    n.coopSeed=seedFor(room,m.key,s.run.layer*65537+s.run.index);
    if(n.kind==='cpu')n.payload=G.makeCpu(r);
    if(n.kind==='shop')n.shopItems=G.rollShop(s,n.coopSeed,s.run.layer);
    if(n.kind==='event'||n.kind==='chest'){const originalSeed=s.run.seed;s.run.seed=n.coopSeed;try{m.receipt=mutatePersonal(room,m,()=>G.enterEvent(s,id));}finally{s.run.seed=originalSeed;}} 
    else mutatePersonal(room,m,()=>G.enterCamp(s,id));
  }
  // 共享遗物的经过节点收益不因每人处理一次功能节点而重复累计。
  if(coinHeld){const gain=Math.round(50*G.scoreGainMultiplier(room.members[0].state.run));const extra=Math.max(0,fighters(room).filter(m=>!m.auto).length-1)*gain;room.score=Math.max(coinStart,room.score-extra);syncScore(room);}
  reserveShopRelics(room);
}
// 同一件遗物只允许存在于一个待购报价中，已持有的遗物不会再次进入任何人的商店。
function reserveShopRelics(room){
  if(!room.inventory)return;const seen=new Set(room.inventory.relics);
  for(const m of room.members){const node=m.state&&G.currentNode(personalState(m));if(!node)continue;
    const lists=[node.shopItems,...Object.values(node.curseStocks||{})].filter(Array.isArray);
    for(const list of lists)for(let i=list.length-1;i>=0;i--){const offer=list[i];if(offer.kind!=='relic'||offer.sold)continue;
      if(seen.has(offer.relic)){const relic=rollRelic(G.mulberry32(seedFor(room,m.key,(node.coopSeed||0)+i)),[...seen]);if(!relic){list.splice(i,1);continue;}offer.relic=relic.id;offer.rarity=relic.rarity;if(typeof offer.price==='number')offer.price=RELIC_RARITIES[relic.rarity].shopPrice;}
      seen.add(offer.relic);
    }
  }
}
function finishNode(room){
  const first=personalState(room.members[0]);const end=first.run.nodeId===first.run.graph.endId;
  if(end){for(const m of room.members)G.advanceLayer(personalState(m));if(first.run.status==='won'){room.status='won';room.phase='ended';return;}}
  room.phase='map';room.votes={};room.opponent=null;room.battle=null;for(const m of room.members){m.done=false;m.ready=false;m.offers=null;m.receipt=null;}
  syncScore(room);
}
function markDowned(room){
  for(const m of room.members){const s=m.state;
    // 战败后释放原出战者的物品占用；武器按单人规则独立回收或损失。
    const equipped=s.collection.filter(c=>s.run.teamIds.includes(c.id)&&c.weaponItem).map(c=>c.weaponItem.id);
    const result=G.settleDefeatWeapons(s,s.run.teamIds,G.mulberry32(seedFor(room,m.key,room.attempt||0)));captureInventory(room,s);
    for(const id of equipped){releaseItem(room,'weapon',id,m.key);if(!result.recovered.some(w=>w.id===id))room.inventory.weapons=room.inventory.weapons.filter(w=>w.id!==id);}
    for(const [id,claim] of Object.entries(room.inventory.claims))if(claim.key===m.key&&!claim.consumed&&(id.startsWith('tactic:')||id.startsWith('potion:')))delete room.inventory.claims[id];
    s.run.tacticIds=[];s.run.downed=[...new Set([...s.run.downed,...s.run.teamIds])];s.run.teamIds=[];m.ready=false;m.spectator=m.auto||!available(m).length;
    if(m.auto){s.run.teamIds=available(m).slice(0,s.run.teamSize).map(c=>c.id);m.ready=true;}
  }
  const before=room.members[0].state.run.score;G.loseScore(room.members[0].state);changeShared(room,room.members[0].state.run.score-before);
  room.phase=fighters(room).length?'replacement':'ended';
  if(room.phase==='ended')room.status='lost';room.battle=null;maybeBeginBattle(room);
}
// 仍有操作权者准备完后开战；永久旁观者已自动补位，无需再点准备。
function maybeBeginBattle(room){
  if(!['prep','replacement'].includes(room.phase)||!fighters(room).length||!activeMembers(room).every(p=>p.ready))return;
  room.phase='battle';room.attempt=(room.attempt||0)+1;
  room.battle={id:room.id+':'+room.node+':'+room.attempt,seed:seedFor(room,room.node,room.attempt),actions:[],autoKeys:fighters(room).filter(p=>p.auto).map(p=>p.key),autoEvents:[],resting:fighters(room).filter(p=>p.state.run.restBuff).map(p=>p.key),roster:fighters(room).flatMap(p=>p.state.run.teamIds.map(id=>({key:p.key,cardId:id})))};
  for(const p of room.members)p.state.run.restBuff=false;
}
export function advanceCoopAutomation(room){
  const before=room.phase;
  maybeBeginBattle(room);
  if(['node','rewards'].includes(room.phase)&&activeMembers(room).every(m=>m.done))finishNode(room);
  // 全员永久旁观时按地图固定顺序选下一节点，仍然不伪造任何玩家投票。
  if(room.phase==='map'&&!activeMembers(room).length&&fighters(room).length){const s=personalState(room.members[0]),id=s.run.graph.byId.get(s.run.nodeId)?.next[0];if(id)enterVotedNode(room,id);}
  if(before!==room.phase)room.version++;
}
export function settleCoopBattle(room,result){
  if(room.phase!=='battle')return;
  room.version++;
  if(!result.won){markDowned(room);return;}
  const first=room.members[0].state,node=G.currentNode(first);
  // 全队获胜保留所有出战角色，包括本场曾倒下的名字；仅全队战败消耗角色。
  const baseScore=room.score;
  for(const m of room.members){G.recordBattleResult(m.state,true,result.rounds);G.clearNode(personalState(m));}
  // 共享战力币是同一件遗物，每个共同节点只结算一次。
  changeShared(room,first.run.score-baseScore);
  if(node.kind==='ladder'||node.kind==='end'){const before=first.run.score;G.addScore(first,node.payload.score);changeShared(room,(first.run.score-before)*room.population);}
  else {
    const offer=G.rollRewards(first,seedFor(room,room.node,room.attempt||0),node.kind==='elite',true).find(o=>o.kind==='score');
    if(offer)changeShared(room,offer.points*room.population);
  }
  room.phase='rewards';room.lastResult={won:true,rounds:result.rounds};room.battle=null;
  for(const m of room.members){m.done=m.spectator;if(!m.spectator)m.offers=G.rollRewards(m.state,seedFor(room,m.key,first.run.index),node.kind==='elite',false,false,false,false);}
  if(!fighters(room).length){room.phase='ended';room.status='lost';}
}
export function coopPersonalAction(room,m,action){
  const s=personalState(m),kind=G.currentNode(s)?.kind;
  const inventoryActions=new Set(['forge','equip','unequip','tactic']);
  if(!inventoryActions.has(action.type)&&room.phase!=='node')fail('请在个人功能节点内操作');
  if(action.character&&!available(m).some(c=>c.id===action.character))fail('请选择自己的存活角色');
  const campAction=['rest','camp-stat','camp-skill'].includes(action.type);
  if(campAction&&G.currentNode(s)?.campUsed)fail('本次篝火已使用');
  if(m.done||m.spectator)fail('已完成或正在旁观');
  if(['equip','weapon-sell','weapon-reforge'].includes(action.type))requireFree(room,'weapon',action.id,m.key);
  if(action.type==='forge')requireFree(room,'skill',action.id,m.key);
  if(action.type==='tactic'&&!s.run.tacticIds.includes(action.id))requireFree(room,'tactic',action.id,m.key);
  const oldWeapon=s.collection.find(c=>c.id===action.character)?.weaponItem?.id;
  const wasTactic=s.run.tacticIds.includes(action.id);
  const value=mutatePersonal(room,m,()=>{
    switch(action.type){
      case 'buy':if(kind!=='shop')fail('不在商店');return G.buyShopItem(s,{id:action.id});
      case 'merchant-buy':if(kind!=='weaponMerchant')fail('不在武器商人');return G.buyMerchantWeapon(s,action.id);
      case 'weapon-sell':if(kind!=='weaponMerchant')fail('不在武器商人');return G.sellWeapon(s,action.id);
      case 'weapon-reforge':if(kind!=='weaponMerchant')fail('不在武器商人');return G.reforgeWeapon(s,action.id);
      case 'rest':if(kind!=='camp')fail('不在篝火');return G.campRest(s,action.character);
      case 'camp-stat':if(kind!=='camp')fail('不在篝火');return G.campForgeStat(s,action.character,action.stat);
      case 'camp-skill':if(kind!=='camp')fail('不在篝火');return G.campForge(s,action.character,action.skill);
      case 'scan':if(kind!=='cpu')fail('不在电脑');if(typeof action.prefix!=='string'||action.prefix.length>40||/[@+\r\n]/.test(action.prefix))fail('前缀过长');return G.scanCpuNode(s,s.run.nodeId,action.prefix,Math.max(1,Math.min(100000,Number(action.start)||1000)));
      case 'construct':if(kind!=='constructMerchant')fail('不在构造商人');return G.constructCharacter(s,action.character,Number(action.amount));
      case 'curse':if(kind!=='curseMerchant')fail('不在诅咒商人');return G.buyCurseItem(s,action.character,action.id);
      case 'forge':return G.forgeSkill(s,action.id,action.character);
      case 'equip':return G.equipWeapon(s,action.id,action.character);
      case 'unequip':return G.unequipWeapon(s,action.character);
      case 'tactic':{if(!s.ownedTactics.includes(action.id))fail('未持有该战术');const ids=s.run.tacticIds,index=ids.indexOf(action.id);if(index>=0)ids.splice(index,1);else {if(ids.length>=2)fail('最多挂两张战术卡');ids.push(action.id);}return true;}
      default:fail('不支持的个人操作');
    }
  });
  if((value&&value.ok!==false)||(action.type==='forge'&&value?.chance>0)){
    if(action.type==='equip'){if(oldWeapon)releaseItem(room,'weapon',oldWeapon,m.key);claimItem(room,'weapon',action.id,m.key,action.character);}
    if(action.type==='unequip'&&oldWeapon)releaseItem(room,'weapon',oldWeapon,m.key);
    if(action.type==='forge')claimItem(room,'skill',action.id,m.key,action.character,true);
    if(action.type==='tactic'){if(wasTactic)releaseItem(room,'tactic',action.id,m.key);else claimItem(room,'tactic',action.id,m.key);}
    if(action.type==='weapon-sell')room.inventory.weapons=room.inventory.weapons.filter(w=>w.id!==action.id);
  }
  bindInventory(room);reserveShopRelics(room);
  if(campAction&&value!==false&&value!==null)G.currentNode(s).campUsed=true;
  if(value===false||value===null||(value?.ok===false&&!(action.type==='forge'&&value.chance>0)))fail(value?.reason||'操作条件不满足');
}
// 入口只接受已认证成员的意图；平台在事务锁中调用并持久化完整状态。
export async function reduceCoop(room,key,action,context={}){
  restoreCoop(room);const m=room.members.find(m=>m.key===key&&!m.left);if(!m)fail('不是房间成员');
  if(action.type==='ready'){
    if(room.status!=='waiting')fail('已经开局');
    if(action.names){if(!Array.isArray(action.names)||action.names.length>Number(room.lane[0])||action.names.some(n=>typeof n!=='string'||n.length>80||/[@+\r\n]/.test(n)))fail('角色名字无效');m.names=action.names;}
    m.ready=!!action.ready;
  }else if(action.type==='start'){
    if(key!==room.host)fail('只有房主可以开局');await startCoop(room,context);
  }else if(action.type==='leave'){
    if(room.status==='waiting'){room.members=room.members.filter(x=>x.key!==key);room.host=room.members[0]?.key;}
    else fail('开局后保留席位，可返回首页并通过房间号重连');
  }else if(room.status!=='active')fail('房间未在进行中');
  else if(action.type==='spectate'){
    if(m.auto)fail('已永久进入旁观');m.auto=true;m.spectator=true;m.done=true;m.ready=true;delete room.votes[key];
    for(const [id,claim]of Object.entries(room.inventory.claims))if(claim.key===key&&id.startsWith('potion:')&&!claim.consumed)delete room.inventory.claims[id];
    if(room.battle){room.battle.autoEvents||=[];room.battle.autoEvents.push({at:room.battle.actions.length,key});}
    else if(room.phase==='map'){const voters=activeMembers(room),node=voters.length&&room.votes[voters[0].key];if(node&&voters.every(p=>room.votes[p.key]===node))enterVotedNode(room,node);}
    else if(['node','rewards'].includes(room.phase)&&activeMembers(room).every(p=>p.done))finishNode(room);
  }else if(action.type==='reserve-potion'){
    if(m.spectator||m.done)fail('当前不能占用药水');const p=room.inventory.potions.find(p=>p.id===action.id&&p.n>0);if(!p)fail('没有这瓶药水');
    if(action.reserve){requireFree(room,'potion',p.id,key,{allowOwner:true});claimItem(room,'potion',p.id,key);}else releaseItem(room,'potion',p.id,key);
  }
  else if(action.type==='vote'){
    if(room.phase!=='map'||m.spectator)fail('当前不能投票');
    const s=personalState(m);if(!s.run.graph.byId.get(s.run.nodeId)?.next.includes(action.node))fail('节点不可达');
    room.votes[key]=action.node;const voters=activeMembers(room);
    if(voters.length&&voters.every(p=>room.votes[p.key]===action.node))enterVotedNode(room,action.node);
  }else if(action.type==='team'){
    if(!['map','prep','replacement','node','rewards'].includes(room.phase)||m.spectator||m.ready||m.done)fail('当前不能换人');
    if(!Array.isArray(action.ids)||action.ids.length>m.state.run.teamSize||new Set(action.ids).size!==action.ids.length||action.ids.some(id=>!available(m).some(c=>c.id===id)))fail('出战名单无效');
    m.state.run.teamIds=action.ids;
  }else if(action.type==='battle-ready'){
    if(!['prep','replacement'].includes(room.phase)||m.spectator)fail('当前不能准备战斗');
    if(!m.state.run.teamIds.length)fail('请选择库存中的存活角色');m.ready=!!action.ready;
    maybeBeginBattle(room);
  }else if(action.type==='done'){
    if(!['node','rewards'].includes(room.phase)||m.spectator)fail('当前不能结束节点');
    if(room.phase==='rewards'&&!m.done)fail('请先选择战斗奖励');m.done=true;
    if(activeMembers(room).every(p=>p.done))finishNode(room);
  }else if(action.type==='reward'){
    if(room.phase!=='rewards'||m.done||m.spectator)fail('当前不能领取奖励');
    const offer=m.offers?.[action.index];if(!offer)fail('奖励不存在');mutatePersonal(room,m,s=>G.applyReward(s,offer));m.offers=null;m.done=true;
    if(activeMembers(room).every(p=>p.done))finishNode(room);
  }else if(action.type==='personal'){
    if(!['node','map','prep','replacement','rewards'].includes(room.phase)||m.ready)fail('当前不能操作物品');
    coopPersonalAction(room,m,action.action||{});
  }else fail('未知合作操作');
  advanceCoopAutomation(room);room.version++;syncScore(room);return room;
}
export function coopView(room,key,battle=null){
  restoreCoop(room);const mine=room.members.find(m=>m.key===key);if(!mine)fail('不是房间成员');
  const s=mine.state;let stock=s&&room.phase==='node'&&!mine.spectator?nodeStock(s):null;reserveShopRelics(room);if(stock)stock=nodeStock(s);
  // 其他成员的私人物品不发给客户端；投票、出战名单和旁观状态全队可见。
  return {id:room.id,host:room.host,lane:room.lane,difficulty:room.difficulty||0,turnSeconds:room.turnSeconds||30,status:room.status,phase:room.phase,version:room.version,population:room.population,score:room.score,votes:room.votes,members:room.members.map(m=>({key:m.key,team:m.team,ready:m.ready,done:m.done,spectator:m.spectator,auto:!!m.auto,iconName:m.state?.collection[0]?.name||m.team,teamCards:m.state?m.state.run.teamIds.map(id=>m.state.collection.find(c=>c.id===id)):[]})),me:key,inventory:inventoryView(room),state:s?{...G.snapshot(s),tacticsPool:s.tacticsPool}:null,stock,offers:mine.offers,receipt:mine.receipt,opponent:room.opponent,battle,lastResult:room.lastResult,rules:room.rules};
}
function nodeStock(s){
  switch(G.currentNode(s)?.kind){case 'shop':return G.shopStock(s);case 'weaponMerchant':return G.merchantStock(s);case 'curseMerchant':return s.collection.filter(c=>!s.run.downed.includes(c.id)).map(c=>({character:c.id,offers:G.curseStock(s,c.id)}));default:return null;}
}
// 每个根角色用内部唯一名字定位，外显名字与图标仍取原卡，重复天梯敌人不会合并。
export class CoopCombat {
  constructor(){this.sessions=new Map();}
  get(room){
    for(const [id,e] of this.sessions)if(Date.now()-e.touched>1800000){e.session.free();this.sessions.delete(id);}
    const spec=room.battle;if(!spec)return null;let entry=this.sessions.get(spec.id);
    if(entry&&JSON.stringify(entry.commands)!==JSON.stringify(spec.actions.slice(0,entry.commands.length))){entry.session.free();this.sessions.delete(spec.id);entry=null;}
    if(!entry){
      const allies=spec.roster.map(({key,cardId},i)=>{const m=room.members.find(m=>m.key===key),s=personalState(m),card=s.collection.find(c=>c.id===cardId);return {key,cardId,card:G.applyRelicBattleBonuses(applyTactics(G.prepareBattleCard(s,card),G.tacticsByIds(s,s.run.tacticIds)),s.relics),alias:'coop-player-'+i};});
      const enemies=room.opponent.cards.map((card,i)=>({card,alias:'coop-enemy-'+i}));const roots=[...allies,...enemies];
      const line=x=>buildLine({...x.card,name:x.alias});
      const input=[...allies.map(line),'',...enemies.map(line),'seed:'+spec.seed+'@!'].join('\n');
      const w=engineWasm(),probe=new w.BattleSession(input,{}),initial=probe.initial_states();probe.free();
      const playerTeam=initial.find(s=>s.input_team_index===0).team_index;
      // 团队持有的战斗遗物共享给友方，角色专属锻造、武器、战术与药水仍各自独立。
      const relics=new Set(fighters(room).flatMap(m=>m.state.relics));const options={controlled_team:playerTeam,max_rounds:20000,include_icons:false,relic_damage_floor:relics.has('heavy-spite')};
      for(const [id,option] of Object.entries({'pl-tester-v1':'opening_relic_team','cpu-fan':'healing_relic_team','rat-tail':'shielding_relic_team','language-pack':'language_relic_team','attribute-modifier':'debuff_relic_team','say-and-do':'clone_relic_team','red-underwear':'positive_status_relic_team','thanks':'thanks_relic_team','inequality':'inequality_relic_team','zuxizu-zuzuo':'assassinate_relic_team','help-test-post':'stat_relic_team'}))if(relics.has(id))options[option]=playerTeam;
      const reduced=room.difficulty>=14;if(spec.resting?.length&&!reduced)options.start_hp_pct=1.25;
      const session=new w.BattleSession(input,options);
      session.set_abilities(abilityPacket(normalizeAbilities(fighters(room).flatMap(m=>m.state.abilities))));
      // 每位成员自己的休息增益仅用于其角色；原始最大体力不变。
      const hp=session.initial_states().filter(s=>s.input_team_index===0&&s.owner_id==null).flatMap(state=>{const source=roots.find(x=>x.alias===state.id_name);return spec.resting?.includes(source?.key)&&!reduced?[]:[state.id,Math.max(1,Math.round(state.max_hp*(reduced?(spec.resting?.includes(source?.key)?.9:.75):1)))];});
      session.set_initial_hp(new Uint32Array(hp));
      entry={session,roots,playerTeam,commands:[],autoEvents:new Set(),frames:[],log:[]};this.setAutomatic(entry,spec.autoKeys||[]);this.advance(entry);this.sessions.set(spec.id,entry);
    }
    for(const command of spec.actions.slice(entry.commands.length)){this.applyAutoEvents(entry,spec);entry.session.submit_action(...command);this.advance(entry);entry.commands.push(command);}
    this.applyAutoEvents(entry,spec);
    entry.touched=Date.now();return entry;
  }
  setAutomatic(e,keys){const roots=e.session.initial_states().filter(s=>s.owner_id==null&&e.roots.some(r=>r.key&&keys.includes(r.key)&&r.alias===s.id_name)).map(s=>s.id);if(roots.length&&!e.session.is_done())e.session.set_auto_actors(new Uint32Array(roots));}
  applyAutoEvents(e,spec){for(const [index,event]of (spec.autoEvents||[]).entries())if(event.at===e.commands.length&&!e.autoEvents.has(index)){this.setAutomatic(e,[event.key]);e.autoEvents.add(index);this.advance(e);}}
  advance(e){for(let frame;(frame=e.session.next_frame())!=null;){e.log.push(...frame.updates.map(u=>u.message_rendered).filter(Boolean));e.frames.push(frame);}e.log=e.log.slice(-80);e.frames=e.frames.slice(-24);}
  owner(e,state){const root=state.source_id??state.owner_id??state.id;const original=e.session.initial_states().find(s=>s.id===root)||state;return e.roots.find(x=>x.alias===original.id_name);}
  snapshot(room,key){const e=this.get(room);if(!e)return null;const states=e.session.current_states(),actor=states.find(s=>s.id===e.session.paused_actor()),owner=actor&&this.owner(e,actor);const seed=room.battle.seed^Math.imul(room.battle.actions.length,2654435761);
    let hand=[];if(actor){const skills=actor.skills.map(([name,lv])=>({...(owner?.card.skillList.find(s=>s.id==='skl'+name.replace('core.skill.',''))||{}),id:'skl'+name.replace('core.skill.',''),lv:effectiveSkillLevel(lv)}));hand=[{id:'normal',cost:0,lv:0},...drawHand(skills,G.mulberry32(seed),3)].map(c=>{const rawCost=c.cost,cost=c.id==='normal'?0:abilityMpCost(normalizeAbilities(activeMembers(room).flatMap(m=>m.state.abilities)),c.id,rawCost);return {...c,rawCost,cost,code:c.id==='normal'?NORMAL_ID:ACTIVE_ID[c.id],usable:canPlayHandCard({...c,cost},actor.magic_point)};});}
    const display=state=>{const source=this.owner(e,state);return {...state,id_name:source?.card.name||state.id_name,id_key_name:source?source.card.name+'@'+source.card.clan:state.id_key_name,icon_key:source?source.card.name+'@'+source.card.clan:state.icon_key,base_name:source?.card.name||state.base_name,display_name:source?.card.name||state.display_name,icon:source?iconFor(source.card.name,source.card.clan):null,coop_owner:source?.key||null};};
    const rename=text=>e.roots.reduce((s,r)=>s.split(r.alias).join(r.card.name),text);
    return {id:room.battle.id,turn:room.battle.actions.length,actor:actor?.id??null,owner:owner?.key??null,your_turn:owner?.key===key,hand:owner?.key===key?hand:[],states:states.map(display),log:e.log.map(rename),rounds:e.session.rounds_advanced(),done:e.session.is_done(),won:e.session.result()?.winner_team_indices.includes(e.playerTeam)||false,fallen:states.filter(s=>s.owner_id==null&&s.input_team_index===0&&!s.alive).map(s=>this.owner(e,s)).filter(Boolean).map(x=>({key:x.key,cardId:x.cardId}))};
  }
  play(room,key,action){const e=this.get(room),view=this.snapshot(room,key);if(!view.your_turn||action.turn!==view.turn)fail('尚未轮到你或手牌已变化');const card=view.hand.find(c=>c.id===action.card);if(!card?.usable)fail('这张手牌不能使用');bindInventory(room);const member=room.members.find(m=>m.key===key),potions=member.state.run.potions;if(action.potion)requireFree(room,'potion',action.potion,key,{allowOwner:true});const potion=action.potion?potions.find(p=>p.id===action.potion&&p.n>0):null;if(action.potion&&!potion)fail('未持有这瓶药水');const meta=potion&&G.potionById(potion.id);
    const packed=Math.max(0,card.rawCost||0)|((meta?meta.field+1:0)<<8);room.battle.actions.push([view.actor,card.code,packed]);if(potion){potion.n--;captureInventory(room,member.state);if(potion.n<=0)claimItem(room,'potion',potion.id,key,null,true);else releaseItem(room,'potion',potion.id,key);bindInventory(room);}this.get(room);room.version++;return this.snapshot(room,key);}
  release(id){const e=this.sessions.get(id);if(e)e.session.free();this.sessions.delete(id);}
}

// 自动出牌只选择服务器当前手牌，不接受浏览器上报超时或结算结果。
export function timeCoopBattle(room,combat,now,key){
  if(room.phase!=='battle')return null;
  let view=combat.snapshot(room,key);if(view.done)return view;
  const turn=room.battle.actions.length;
  if(room.battle.clockTurn!==turn||room.battle.clockActor!==view.actor){room.battle.clockTurn=turn;room.battle.clockActor=view.actor;room.battle.deadline=now+(room.turnSeconds||30);}
  if(now>=room.battle.deadline){
    const owner=combat.snapshot(room,view.owner),hand=owner.hand.filter(c=>c.usable);
    const choice=hand.find(c=>c.id!=='normal')||hand[0];
    if(choice)view=combat.play(room,owner.owner,{card:choice.id,turn:owner.turn});
    room.battle.clockTurn=room.battle.actions.length;room.battle.clockActor=view.actor;room.battle.deadline=now+(room.turnSeconds||30);
  }
  return {...view,deadline:room.battle.deadline,turnSeconds:room.turnSeconds||30,serverNow:now};
}
