// 合作界面复用大逃杀会话请求和原爬塔地图；所有玩法操作交由主站裁决。
import {ArenaView} from './arena.js';
import * as UI from './ui.js';
import * as G from './game.js';
import {iconFor} from './engine.js';
import {skillMeta} from './skills.js';
import {duelUnitRow} from './duel.js';
const {el}=UI;
const labels={map:'共同选路',prep:'战斗准备',battle:'团队战斗',replacement:'全队战败 · 选择替补',node:'个人节点',rewards:'个人奖励',ended:'本局结束'};
const nodeNames={shop:'商店',camp:'篝火',cpu:'电脑',weaponMerchant:'武器商人',curseMerchant:'诅咒商人',constructMerchant:'构造商人',event:'补给',chest:'宝箱'};
export class CoopView extends ArenaView {
  constructor(root,options){super(root,options);this.tab='map';this.pendingId=null;this.sessionPath='/coop/session';}
  updateTimers(){
    const b=this.room?.battle;if(!b?.deadline)return;
    const now=(this.clockServer||b.serverNow||Date.now()/1000)+(performance.now()-(this.clockReceived||performance.now()))/1000;
    const remaining=Math.max(0,b.deadline-now),angle=Math.max(0,Math.min(360,remaining/(b.turnSeconds||30)*360));
    for(const ring of this.root.querySelectorAll('[data-coop-clock]')){ring.style.setProperty('--remaining-angle',angle+'deg');ring.setAttribute('aria-label','剩余出牌时间 '+Math.ceil(remaining)+' 秒');ring.title='剩余 '+Math.ceil(remaining)+' 秒';}
  }
  async open(){
    this.root.replaceChildren(el('p',{},'正在连接合作爬塔…'));
    try{const data=await this.call('/coop/session');if(this.closed)return;this.user=data.teamname;await this.lobby();const code=new URLSearchParams(location.hash.slice(1)).get('coop');if(code)await this.openRoom(code);}
    catch(error){if(!this.closed)this.root.replaceChildren(el('section',{class:'coop-panel'},el('h1',{},'合作爬塔'),el('p',{class:'error',role:'alert'},error.message),this.button('重试',()=>this.open()),this.button('返回首页',this.onHome)));}
  }
  async perform(fn){
    if(this.busy||this.closed)return;this.busy=true;
    try{this.message='';await fn();}catch(error){this.message=error.message;}
    finally{this.busy=false;if(!this.closed&&this.room)this.renderRoom();else if(!this.closed){const box=this.root.querySelector('[data-coop-error]');if(box)box.textContent=this.message;}}
  }
  async lobby(){
    clearTimeout(this.pollTimer);this.room=null;const data=await this.call('/coop/rooms');if(this.closed)return;
    const lane=el('select',{'aria-label':'合作组别'},['1A','1B','2A','2B'].map(id=>el('option',{value:id},id+' · 每人 '+id[0]+' 个名字')));
    const nodes=el('select',{'aria-label':'每层节点数'},[20,30,40,50,60,70,80].map(n=>el('option',{value:n,selected:n===40},n+' 节点')));
    const difficulty=el('select',{'aria-label':'合作难度'},Array.from({length:21},(_,n)=>el('option',{value:n},n?'A'+n:'标准 A0')));
    const timeout=el('input',{type:'number',min:5,max:180,value:30,'aria-label':'自动出牌超时秒数'});
    const code=el('input',{placeholder:'六位房间号',maxlength:6,'aria-label':'合作房间号'});
    this.root.replaceChildren(el('section',{class:'coop-panel'},el('h1',{},'合作爬塔 · 2～4 人'),
      el('p',{},'同一条路线，全票进入节点。每人各带 1 或 2 个名字，共享天梯分数；功能节点各自处理。'),
      el('p',{class:'muted'},'只有全队倒下才算战败。胜利保留本场倒下的角色；战败后库存耗尽者旁观，敌人数始终按开局人数计算。'),
      el('div',{class:'coop-actions'},lane,nodes,difficulty,el('label',{},'自动出牌超时（秒）',timeout),this.button('创建合作房间',()=>this.perform(async()=>{const r=await this.call('/coop/rooms',{lane:lane.value,nodeCount:Number(nodes.value),turnSeconds:Number(timeout.value),difficulty:Number(difficulty.value)});this.accept(r.room);}))),
      el('div',{class:'coop-actions'},code,this.button('加入房间',()=>this.openRoom(code.value)),data.my_room?this.button('返回我的房间',()=>this.openRoom(data.my_room)):null,this.button('刷新房间列表',()=>this.lobby()),this.button('返回首页',this.onHome)),
      el('p',{class:'error',role:'alert','data-coop-error':''},this.message),
      ...(data.rooms||[]).map(r=>el('article',{class:'coop-member'},el('b',{},r.id+' · '+r.host+' · '+r.lane+' · '+r.count+'/4 人'),this.button('加入',()=>this.openRoom(r.id),r.count>=4)))));
  }
  async openRoom(code){await this.perform(async()=>{const id=String(code).trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(id))throw Error('请输入六位房间号');const r=await this.call('/coop/rooms/'+id+'/join',{});this.accept(r.room);});}
  accept(room){
    if(this.closed||this.room?.id===room.id&&room.version<this.room.version)return;
    const changed=this.room?.phase!==room.phase;this.room=room;this.clockServer=room.battle?.serverNow;this.clockReceived=performance.now();
    if(room.state){this.state=room.state;this.state.run.graph.byId=new Map(this.state.run.graph.nodes.map(n=>[n.id,n]));for(const c of this.state.collection)c.icon=iconFor(c.name,c.clan);}
    if(changed)this.tab='map';
    history.replaceState(null,'','#coop='+room.id);this.renderRoom();this.schedule();
  }
  schedule(){clearTimeout(this.pollTimer);if(this.closed||!this.room)return;const id=this.room.id;this.pollTimer=setTimeout(async()=>{try{const data=await this.call('/coop/rooms/'+id);if(this.closed||this.room?.id!==id)return;if(data.room.version!==this.room.version)this.accept(data.room);else if(data.room.battle){this.room.battle=data.room.battle;this.clockServer=data.room.battle.serverNow;this.clockReceived=performance.now();this.updateTimers();}}catch(error){this.message=error.message;const box=this.root.querySelector('[data-coop-error]');if(box)box.textContent=this.message;}this.schedule();},1500);}
  async action(type,data={}){await this.perform(async()=>{const id=this.room.id;try{const r=await this.call('/coop/rooms/'+id+'/action',{action_id:crypto.randomUUID(),version:this.room.version,action:{type,...data}});this.accept(r.room);}catch(error){const fresh=await this.call('/coop/rooms/'+id);this.accept(fresh.room);throw error;}});}
  personal(type,data={}){return this.action('personal',{action:{type,...data}});}
  mine(){return this.room.members.find(m=>m.key===this.room.me);}
  header(){const r=this.room;return el('header',{class:'coop-header'},el('div',{},el('h2',{},'合作 '+r.lane+' · A'+r.difficulty+' · '+r.id),el('p',{},(r.population||r.members.length)+' 人 · '+(labels[r.phase]||'等待准备')+' · 全队共享 '+r.score+' 分 · 出牌 '+r.turnSeconds+' 秒')), el('div',{class:'coop-actions'},this.button('角色与物品',()=>{this.tab=this.tab==='inventory'?'map':'inventory';this.renderRoom();},!this.state),this.room.status==='active'&&!this.mine().auto?this.button('永久退出操作并旁观',()=>{if(confirm('进入后本局无法恢复操作；角色由引擎托管，功能节点跳过。确定永久旁观？'))this.action('spectate');}):null,this.button('返回首页（保留房间）',this.onHome)),el('p',{class:'error',role:'alert','data-coop-error':''},this.message));}
  members(){const r=this.room;return el('div',{class:'coop-members'},r.members.map(m=>el('article',{class:'coop-member'},el('img',{src:iconFor(m.iconName,m.team),width:28,height:28,alt:''}),el('b',{},m.team+(m.key===r.me?'（你）':'')),el('span',{},m.auto?'永久旁观 · 引擎托管':m.spectator?'旁观':r.phase==='waiting'?m.ready?'已准备':'未准备':m.done?'已完成':m.ready?'已准备':'处理中'))));}
  renderRoom(){
    if(!this.room||this.closed)return;const r=this.room,me=this.mine();
    // 房间轮询重绘时保留左右列表各自的滚动位置。
    const scrolls=Object.fromEntries(['player','enemy'].map(side=>[side,this.root.querySelector('#unit-'+side)?.scrollTop||0]));this.battleScroll=scrolls;
    const content=el('main',{class:'coop-content'});this.root.replaceChildren(el('section',{class:'coop-mode'},this.header(),this.members(),content));
    if(r.phase==='waiting'){
      const names=Array.from({length:Number(r.lane[0])},(_,i)=>el('input',{placeholder:'名字 '+(i+1)+'（留空随机）',maxlength:80,'aria-label':'合作角色名字 '+(i+1),disabled:me.ready}));
      content.append(el('div',{class:'coop-panel'},el('p',{},'当前战队：'+me.team+'。准备后锁定本次开局名字。'),...names,this.button(me.ready?'取消准备':'准备',()=>this.action('ready',{ready:!me.ready,names:names.map(n=>n.value.trim())})),r.host===r.me?this.button('全员准备后开局',()=>this.action('start'),r.members.length<2||!r.members.every(m=>m.ready),'primary'):null,this.button('退出房间',()=>this.perform(async()=>{await this.call('/coop/rooms/'+r.id+'/action',{action_id:crypto.randomUUID(),version:r.version,action:{type:'leave'}});await this.lobby();}))));return;
    }
    if(r.phase==='ended'){content.append(el('div',{class:'coop-panel'},el('h1',{},r.status==='won'?'合作登顶':'全队已无替补'),el('p',{},'最终共享分数：'+r.score),this.button('返回大厅',()=>this.lobby())));return;}
    if(this.tab==='inventory'){content.append(this.inventory());return;}
    if(r.phase==='map'){
      UI.renderMap(content,this.state,{say:'点击可进入节点投票；所有仍有库存角色的成员同票后进入。旁观者无需投票。',onInventory:()=>{this.tab='inventory';this.renderRoom();},onPick:id=>{if(!me.spectator)this.action('vote',{node:id});},coop:true});
      // 直接使用 DOM 设置文本与头像，投票者名字不会拼入 SVG/HTML 字符串。
      for(const [key,id] of Object.entries(r.votes)){const member=r.members.find(m=>m.key===key),node=content.querySelector('[data-id="'+id+'"]');if(!node||!member)continue;const ns='http://www.w3.org/2000/svg',index=[...node.querySelectorAll('.coop-vote')].length,g=document.createElementNS(ns,'g');g.setAttribute('class','coop-vote');g.setAttribute('transform','translate(48,'+(index*28-14)+')');const image=document.createElementNS(ns,'image');image.setAttribute('href',iconFor(member.iconName,member.team));image.setAttribute('width','22');image.setAttribute('height','22');const text=document.createElementNS(ns,'text');text.setAttribute('x','28');text.setAttribute('y','16');text.textContent=member.team;g.append(image,text);node.append(g);}
      return;
    }
    if(r.phase==='battle'){content.append(this.battle());return;}
    if(r.phase==='prep'||r.phase==='replacement'){
      content.append(el('div',{class:'coop-panel'},el('h2',{},labels[r.phase]),el('p',{},'敌人 '+r.opponent.cards.length+' 名 · 人数按开局 '+r.population+' 人固定。'),r.phase==='replacement'?el('p',{},'本次全队战败，原出战角色已不可用。选择库存角色后重试同一节点。'):null,
        el('div',{class:'coop-enemies'},r.opponent.cards.map(c=>UI.fullCharRow({...c,icon:iconFor(c.name,c.clan)}))),this.roster(),this.button(me.ready?'取消准备':'准备战斗',()=>this.action('battle-ready',{ready:!me.ready}),me.spectator||!this.state.run.teamIds.length,'primary')));return;
    }
    if(r.phase==='rewards'){
      content.append(el('div',{class:'coop-panel'},el('h2',{},'战斗胜利 · 分数已全队共享'),el('p',{},'本场倒下的角色仍可继续使用。每人独立选择一项物品奖励。'),me.done||me.spectator?el('p',{},'等待其他成员选择…'):el('div',{class:'coop-stock'},(r.offers||[]).map((offer,index)=>{const summary=G.rewardSummary(offer);return el('article',{},el('b',{},summary.label),el('p',{},summary.detail),this.button('领取',()=>this.action('reward',{index}),false,'primary'));}))));return;
    }
    if(r.phase==='node')content.append(this.functional());
  }
  occupancy(type,id){
    const claim=this.room.inventory?.claims[type+':'+id];if(!claim)return null;
    return el('span',{class:'coop-occupied'},'此物品正被 ',el('img',{src:iconFor(claim.iconName,claim.team),width:22,height:22,alt:'队伍图标'}),el('b',{},claim.team),' 占用',claim.consumed?'（已消耗）':null);
  }
  roster(){
    const s=this.state,me=this.mine(),bag=this.room.inventory;
    return el('div',{},el('h3',{},'我的角色 · 已选 '+s.run.teamIds.length+'/'+s.run.teamSize),...s.collection.map(c=>{
      const dead=s.run.downed.includes(c.id),locked=me.spectator||me.ready||me.done||this.room.phase==='battle';
      // 已占用武器仍展示在每张角色卡的选择框中，原生禁用选项防止重复装备。
      const weapons=el('select',{'aria-label':c.name+' 装备武器',disabled:locked||dead,onchange:event=>event.target.value?this.personal('equip',{id:event.target.value,character:c.id}):this.personal('unequip',{character:c.id})},el('option',{value:''},'无武器'),...(bag?.weapons||[]).map(w=>{const claim=bag.claims['weapon:'+w.id];return el('option',{value:w.id,disabled:!!claim,style:claim?'color:#adb4bd':''},w.name+(claim?'（正被'+(claim.characterName||claim.team)+'使用）':''));}));
      weapons.value=c.weaponItem?.id||'';
      return el('article',{class:'coop-roster'},el('div',{},UI.fullCharRow(c),weapons),this.button(dead?'全队战败时倒下':s.run.teamIds.includes(c.id)?'取消出战':'选为出战',()=>{const ids=s.run.teamIds.includes(c.id)?s.run.teamIds.filter(id=>id!==c.id):[...s.run.teamIds,c.id];this.action('team',{ids});},locked||dead||!s.run.teamIds.includes(c.id)&&s.run.teamIds.length>=s.run.teamSize));
    }));
  }
  characterSelect(){return el('select',{'aria-label':'操作角色'},this.state.collection.filter(c=>!this.state.run.downed.includes(c.id)).map(c=>el('option',{value:c.id},c.name+'@'+c.clan)));}
  inventory(){
    const s=this.state,me=this.mine(),bag=this.room.inventory,char=this.characterSelect();const locked=me.spectator||me.ready||me.done||this.room.phase==='battle';
    const row=(type,id,content,button)=>el('article',{class:'coop-member'+(bag?.claims[type+':'+id]?' is-occupied':'')},content,this.occupancy(type,id),button);
    return el('div',{class:'coop-panel'},this.button('返回当前节点',()=>{this.tab='map';this.renderRoom();}),this.roster(),el('h3',{},'全队共享物品栏 · 操作目标'),char,
      el('h3',{},'锻造卡'),...(bag?.skillCards||[]).map(c=>row('skill',c.uid,el('span',{},c.kind==='attribute'?c.name+' · '+G.attributeForgeSummary(c):skillMeta(c.id).name+' +'+c.lv),this.button('使用锻造卡',()=>this.personal('forge',{id:c.uid,character:char.value}),locked||!!bag.claims['skill:'+c.uid]))),
      el('h3',{},'武器'),...(bag?.weapons||[]).map(w=>row('weapon',w.id,el('span',{},w.name+(bag.claims['weapon:'+w.id]?'（正被'+(bag.claims['weapon:'+w.id].characterName||bag.claims['weapon:'+w.id].team)+'使用）':'')),this.button('装备',()=>this.personal('equip',{id:w.id,character:char.value}),locked||!!bag.claims['weapon:'+w.id]))),this.button('卸下目标武器',()=>this.personal('unequip',{character:char.value}),locked),
      el('h3',{},'药水'),...(bag?.potions||[]).map(p=>{const claim=bag.claims['potion:'+p.id],mine=claim?.key===this.room.me&&!claim.consumed;return row('potion',p.id,el('span',{},(G.potionById(p.id)?.name||p.id)+' ×'+p.n),this.button(mine?'取消占用':'占用药水',()=>this.action('reserve-potion',{id:p.id,reserve:!mine}),me.spectator||me.done||p.n<=0||!!claim&&!mine));}),
      el('h3',{},'战术 · 每人最多 2 张'),...G.ownedTacticObjects(s).map(t=>row('tactic',t.id,el('span',{},t.name),this.button((s.run.tacticIds.includes(t.id)?'✓ 取消':'使用'),()=>this.personal('tactic',{id:t.id}),locked||!!bag.claims['tactic:'+t.id]&&bag.claims['tactic:'+t.id].key!==this.room.me))),
      el('h3',{},'全队遗物与能力'),el('p',{},'物品只有全队共享的一份。遗物获得后对全队生效，同一件遗物不会重复出现在多人的商店。'),...(s.relics||[]).map(id=>el('span',{class:'coop-tag'},G.rewardSummary({kind:'relic',relic:id}).label)),...(s.abilities||[]).map(a=>el('p',{},G.rewardSummary({kind:'ability',ability:a}).detail)));
  }
  functional(){const r=this.room,s=this.state,me=this.mine(),node=G.currentNode(s),kind=node.kind,box=el('div',{class:'coop-panel'},el('h2',{},nodeNames[kind]||'个人节点'));
    if(me.spectator||me.done){box.append(el('p',{},'等待仍在爬塔的成员完成个人节点。'));return box;}
    const char=this.characterSelect();box.append(char);
    if(r.receipt){box.append(UI.rewardReceipt(r.receipt.reward));if(r.receipt.points)box.append(UI.rewardReceipt({kind:'score',points:r.receipt.points}));}
    if(kind==='shop'||kind==='weaponMerchant')box.append(el('div',{class:'coop-stock'},(r.stock||[]).map(item=>{const summary=kind==='weaponMerchant'?{label:item.weapon.name,detail:'武器'}:G.rewardSummary(item);return el('article',{},el('b',{},summary.label),el('p',{},summary.detail),this.button(item.sold?'已购买':'购买 · '+item.price+' 分',()=>this.personal(kind==='shop'?'buy':'merchant-buy',{id:kind==='shop'?item.id:item.weapon.id}),item.sold||r.score<item.price));})));
    if(kind==='weaponMerchant')box.append(...s.weapons.map(w=>el('div',{class:'coop-actions'},el('span',{},w.name),this.button('出售',()=>this.personal('weapon-sell',{id:w.id})),this.button('重铸',()=>this.personal('weapon-reforge',{id:w.id})))));
    if(kind==='camp'){
      box.append(this.button('休息 · 下一场体力 +25%',()=>this.personal('rest',{character:char.value}),!!node.campUsed),el('p',{},'或选择属性 / 技能锻造：'));
      box.append(...Object.entries({hp:'体力',atk:'攻击',def:'防御',spd:'速度',agi:'敏捷',mag:'魔力',res:'抗性',wis:'智慧'}).map(([stat,label])=>this.button('锻造'+label,()=>this.personal('camp-stat',{character:char.value,stat}),!!node.campUsed)));
      const skill=el('select',{'aria-label':'篝火技能'},s.collection.flatMap(c=>c.skillList.map(k=>el('option',{value:c.id+'|'+k.id},c.name+' · '+skillMeta(k.id).name))));box.append(skill,this.button('锻造技能',()=>{const [character,id]=skill.value.split('|');this.personal('camp-skill',{character,skill:id});},!!node.campUsed));
    }
    if(kind==='cpu'){const prefix=el('input',{placeholder:'测号前缀',maxlength:40,'aria-label':'测号前缀'});box.append(el('p',{},'本人的电脑：'+node.payload.name+' · 速度 '+node.payload.speed),prefix,this.button(node.cpuScanUsed?'已测号':'测号',()=>this.personal('scan',{prefix:prefix.value,start:1000}),!!node.cpuScanUsed));if(node.cpuScanResult)box.append(el('p',{},'结果：'+node.cpuScanResult.name));}
    if(kind==='constructMerchant'){const amount=el('input',{type:'number',min:1,max:r.score,value:1000,'aria-label':'构造投入分数'});box.append(amount,this.button('投入共享分数构造',()=>this.personal('construct',{character:char.value,amount:Number(amount.value)})));}
    if(kind==='curseMerchant')box.append(...(r.stock||[]).flatMap(row=>row.offers.map(item=>el('article',{class:'coop-member'},el('div',{},el('b',{},G.rewardSummary(item).label),el('p',{},'代价：'+(item.cost.type==='skill'?'献祭 '+skillMeta(item.cost.skillId).name:item.cost.label+' -'+item.cost.amount))),this.button(item.sold?'已交易':'接受代价',()=>this.personal('curse',{character:row.character,id:item.id}),item.sold)))));
    box.append(el('div',{class:'coop-actions'},this.button('角色与物品',()=>{this.tab='inventory';this.renderRoom();}),this.button('本节点处理完成',()=>this.action('done'),false,'primary')));return box;
  }
  battle(){const b=this.room.battle;if(!b)return el('p',{},'正在等待战斗数据…');const shell=UI.battleShellEl({readOnly:true,onSpeed:()=>{},onSkip:()=>{}});shell.classList.add('coop-battle');shell.querySelector('#battle-round').textContent='合作战斗 · 第 '+b.rounds+' 回合';
    for(const [side,index] of [['player',0],['enemy',1]]){const target=shell.querySelector('#unit-'+side);target.tabIndex=0;target.setAttribute('role','region');target.setAttribute('aria-label',side==='player'?'玩家角色列表，可滚动':'敌方角色列表，可滚动');target.replaceChildren(...b.states.filter(s=>s.input_team_index===index).map(s=>{const row=duelUnitRow(s,side,{icon:s.icon});if(s.id===b.actor){row.classList.add('is-acting','coop-actor');row.prepend(el('span',{class:'coop-turn-ring','data-coop-clock':'',role:'timer','aria-label':'剩余出牌时间'}));}const owner=this.room.members.find(m=>m.key===s.coop_owner);if(owner)row.append(el('small',{},owner.team));return row;}));requestAnimationFrame(()=>{if(target.isConnected)target.scrollTop=this.battleScroll?.[side]||0;});}
    const bag=this.room.inventory;
    const potion=el('select',{'aria-label':'本次行动使用药水',onchange:event=>{const id=event.target.value;this.selectedPotion=id;if(id)this.action('reserve-potion',{id,reserve:true});}},el('option',{value:''},'不使用药水'),...(bag?.potions||[]).filter(p=>p.n>0).map(p=>{const claim=bag.claims['potion:'+p.id],other=claim&&claim.key!==this.room.me;return el('option',{value:p.id,disabled:!!other},(G.potionById(p.id)?.name||p.id)+' ×'+p.n+(other?'（正被'+claim.team+'占用）':''));}));
    potion.value=this.selectedPotion||'';if(b.your_turn)shell.querySelector('.battle__bar').append(potion);
    const log=shell.querySelector('#battle-log');log.replaceChildren(...b.log.map(text=>el('div',{class:'log__line'},text)));log.scrollTop=log.scrollHeight;
    shell.querySelector('#battle-hand').replaceChildren(...(b.your_turn?b.hand.map(c=>UI.handCardEl(c,{onPlay:()=>this.action('card',{card:c.id,turn:b.turn,potion:potion.value}),disabled:this.busy||!c.usable,locked:!c.usable})):[el('p',{class:'muted'},this.mine().spectator?'你正在旁观。':'等待 '+(this.room.members.find(m=>m.key===b.owner)?.team||'队友')+' 为自己的角色出牌…')]));requestAnimationFrame(()=>this.updateTimers());return shell;
  }
}
