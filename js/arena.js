// 多人生存界面：只发送意图，角色、手牌、倒计时与胜负均以服务器结果为准。
import {el,fullCharRow,handCardEl,qualityBadge} from './ui.js';
import {iconFor,battleDisplayStats} from './engine.js';
import {skillMeta} from './skills.js';

export class ArenaView {
  constructor(root,{onHome}){
    this.root=root;this.onHome=onHome;this.room=null;this.csrf='';this.user=null;this.busy=false;this.closed=false;this.message='';this.version=-1;this.epoch=0;
    this.timer=setInterval(()=>this.updateTimers(),200);
  }
  dispose(){this.closed=true;this.epoch++;clearInterval(this.timer);clearTimeout(this.pollTimer);}
  async call(path,body,retry=true){
    const response=await fetch('/api/cards'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',...(this.csrf?{'X-CSRFToken':this.csrf}:{})}});
    let data;try{data=await response.json();}catch{throw Error('多人模式需要 cards 后端服务。当前页面可能只有静态文件。');}
    if(data.csrf_token)this.csrf=data.csrf_token;
    if(response.status===400&&data.error?.code==='csrf_failed'&&retry){await this.call('/session');return this.call(path,body,false);}
    if(!response.ok||!data.ok)throw Error(data.error?.message||'请求失败，请稍后重试');
    return data;
  }
  async open(){
    this.root.replaceChildren(el('p',{},'正在连接多人房间…'));
    try{const session=await this.call('/session');if(this.closed)return;this.user=session.logged_in?session.teamname:null;await this.lobby();const code=new URLSearchParams(location.hash.slice(1)).get('arena');if(code&&this.user)await this.openRoom(code);}
    catch(error){if(!this.closed)this.root.replaceChildren(el('section',{class:'arena-mode'},el('h1',{},'名字生存战'),el('p',{class:'error',role:'alert'},error.message),this.button('重试',()=>this.open()),this.button('返回首页',this.onHome)));}
  }
  button(text,action,disabled=false,kind='ghost'){return el('button',{class:kind,type:'button',disabled:disabled||this.busy,'data-arena-base-disabled':String(!!disabled),onclick:action},text);}
  async lobby(){
    clearTimeout(this.pollTimer);this.room=null;this.signature=null;this.version=-1;const epoch=++this.epoch;
    const data=await this.call('/arena/rooms');if(this.closed||epoch!==this.epoch)return;
    const code=el('input',{placeholder:'输入六位房间号',maxlength:6,'aria-label':'房间号',autocomplete:'off'});
    const tools=el('div',{class:'arena-mode__actions'},this.button('创建房间',()=>this.create(),!this.user,'primary'),data.my_room?this.button('返回我的房间',()=>this.openRoom(data.my_room)):null,this.button('返回首页',this.onHome));
    const list=el('div',{class:'arena-mode__rooms'});
    const paintRooms=rows=>list.replaceChildren(...(rows.length?rows.map(r=>el('article',{class:'arena-mode__room'},el('b',{},r.id+' · '+r.host),el('p',{},r.status==='waiting'?r.count+' / 12 人 · 等待开始':r.alive+' 人存活 · 进行中'),this.button(r.status==='waiting'?'进入房间':'查看对局',()=>this.openRoom(r.id),!this.user))):[el('p',{class:'muted'},'暂时没有房间，创建一个邀请朋友吧。')]));
    paintRooms(data.rooms);
    this.root.replaceChildren(el('section',{class:'arena-mode'},el('h1',{},'名字生存战'),
      el('p',{class:'muted'},'移动、搜索、补给，与试炼敌人和其他玩家交战，争夺最终存活。'),
      !this.user?el('p',{},'加入对局需要登录主站战队账号。',el('a',{href:'/',target:'_blank',rel:'noopener'},'前往主站登录')):el('p',{},'当前战队：'+this.user),
      tools,el('form',{class:'arena-mode__actions',onsubmit:event=>{event.preventDefault();if(code.value.trim())this.openRoom(code.value.trim());}},code,el('button',{type:'submit',class:'ghost',disabled:!this.user},'按房间号进入')),
      el('p',{class:'error',role:'alert','data-arena-message':''},this.message),list,
      el('details',{},el('summary',{},'玩法'),el('p',{},'2～12 人，房主开始。每人获得一个随机名字，不能带入单人模式物品。每 90 秒新增危险区域，危险区域每 10 秒造成生命损失。只能移动到相邻安全区域；搜索可能遇到随机 @! 试炼敌人，或获得天梯分数、药水与技能成长。补给站可购买武器、技能与药水，武器立即替换当前装备。'),el('p',{},'每次出牌有 10 秒，超时由系统随机打出可用手牌；普通攻击始终可用。离开页面可重新进入，退出进行中的房间会立即淘汰。最后存活者获胜，本局不改动你的单人存档。'))));
    const poll=async()=>{if(this.closed||this.room||epoch!==this.epoch)return;try{const fresh=await this.call('/arena/rooms');if(!this.closed&&!this.room&&epoch===this.epoch)paintRooms(fresh.rooms);}catch{}if(!this.closed&&!this.room&&epoch===this.epoch)this.pollTimer=setTimeout(poll,4000);};this.pollTimer=setTimeout(poll,4000);
  }
  async create(){await this.perform(async()=>{const epoch=++this.epoch;const data=await this.call('/arena/rooms',{});if(epoch===this.epoch)this.accept(data.room);});}
  async openRoom(code){
    await this.perform(async()=>{const epoch=++this.epoch;clearTimeout(this.pollTimer);const data=await this.call('/arena/rooms/'+encodeURIComponent(code.toUpperCase()));if(epoch===this.epoch)this.accept(data.room);});
  }
  async perform(fn){
    if(this.busy||this.closed)return;this.busy=true;this.message='';
    try{await fn();}catch(error){this.message=error.message;const msg=this.root.querySelector('[data-arena-message]');if(msg)msg.textContent=this.message;}
    finally{this.busy=false;this.root.querySelectorAll('[data-arena-base-disabled]').forEach(b=>b.disabled=b.dataset.arenaBaseDisabled==='true');if(this.room&&!this.closed){this.signature=null;this.renderRoom();this.schedule();}}
  }
  accept(room){
    if(this.closed||(this.room?.id===room.id&&room.version<this.version))return;
    this.room=room;this.version=room.version;this.received=performance.now();
    history.replaceState(null,'','#arena='+room.id);
    if(!this.busy)this.renderRoom();
    this.schedule();
  }
  schedule(){
    clearTimeout(this.pollTimer);if(this.closed||!this.room)return;
    const epoch=this.epoch,id=this.room.id;
    this.pollTimer=setTimeout(async()=>{try{const data=await this.call('/arena/rooms/'+id);if(epoch===this.epoch)this.accept(data.room);}catch(error){this.message=error.message;const node=this.root.querySelector('[data-arena-message]');if(node)node.textContent=this.message;}finally{if(epoch===this.epoch)this.schedule();}},2000);
  }
  async action(kind,extra={}){
    await this.perform(async()=>{const data=await this.call('/arena/rooms/'+this.room.id+'/actions',{kind,action_id:crypto.randomUUID(),...extra});this.accept(data.room);if(kind==='leave'){history.replaceState(null,'',location.pathname+location.search);await this.lobby();}});
  }
  updateTimers(){
    if(!this.room||this.closed)return;
    const now=this.room.server_now+(performance.now()-this.received)/1000;
    const b=this.room.battle,node=this.root.querySelector('[data-arena-timer]');
    if(node&&b){const left=Math.max(0,Math.ceil(b.deadline-now));node.textContent=(b.your_turn?'你的出牌时间：':'等待对手出牌：')+left+' 秒';node.classList.toggle('is-urgent',left<=3);if(left===0)this.root.querySelectorAll('.arena-mode__hand button').forEach(button=>button.disabled=true);}
    const ready=this.root.querySelector('[data-arena-cooldown]');if(ready)ready.textContent=this.room.me?.ready_at>now?'操作冷却 '+Math.ceil(this.room.me.ready_at-now)+' 秒':'';
    this.root.querySelectorAll('[data-arena-map-action]').forEach(button=>{if(!this.busy)button.disabled=button.dataset.arenaUnavailable==='true'||!!this.room.battle||!this.room.me?.alive||this.room.me.ready_at>now;});
  }
  renderRoom(){
    const r=this.room;if(!r||this.closed)return;
    // 轮询没有实际变化时保留按钮 DOM，避免触屏按下/抬起之间被重绘吞掉点击。
    const signature=JSON.stringify([r.status,r.me,r.players,r.battle,r.phase,r.stock,r.log,this.message]);if(signature===this.signature)return;this.signature=signature;
    const me=r.me,waiting=r.status==='waiting',finished=r.status==='finished';
    const header=el('header',{class:'arena-mode__header'},el('div',{},el('h1',{},'名字生存战'),el('b',{},'房间 '+r.id)),el('div',{class:'arena-mode__actions'},
      this.button('复制邀请',async()=>{try{await navigator.clipboard.writeText(location.href);this.message='邀请链接已复制';}catch{this.message='房间号：'+r.id;}this.signature=null;this.renderRoom();}),
      this.button('返回大厅',()=>this.perform(async()=>{history.replaceState(null,'',location.pathname+location.search);await this.lobby();})),
      me&&!me.left?this.button(waiting?'退出房间':'退出本局（淘汰）',()=>this.action('leave'),finished):null));
    let main;
    if(waiting){
      main=el('section',{class:'panel'},el('h2',{},'等待参赛者'),el('p',{},r.players.length+' / 12 人，至少两人加入后由房主开始。'),
        !me||me.left?this.button('加入房间',()=>this.action('join'),false,'primary'):r.host===me.key?this.button('开始对局',()=>this.action('start'),r.players.length<2,'primary'):el('p',{class:'muted'},'等待房主开始…'),me?fullCharRow({...me.card,icon:iconFor(me.card.name,me.card.clan)}):null);
    }else if(finished){
      const winner=r.players.find(p=>p.key===r.winner);
      main=el('section',{class:'result '+(r.ending?'end--gold':'')},el('h2',{},!r.started?'房间已关闭':winner?'最终存活':'无人存活'),el('p',{},winner?winner.team+' · 天梯分数 '+winner.score:'这片区域已没有存活者。'),
        r.ending?el('p',{},'存活者的天梯分数超越了 1A 天梯榜首。'):null,
        r.ending&&r.ladder?el('small',{class:'muted'},'判定榜首：'+r.ladder.score+' 分'+(r.ladder.source==='snapshot'?'（实时天梯暂不可用，使用已有快照）':'')):null,this.button('回到大厅',()=>this.perform(async()=>{history.replaceState(null,'',location.pathname+location.search);await this.lobby();})));
    }else if(!me||me.left){main=el('p',{class:'muted'},'本局已开始，无法中途加入。');}
    else{
      const inBattle=!!r.battle,closed=r.closed.includes(me.zone);
      const mapButtons=r.zones.map(z=>{const distance=Math.abs(z.id%3-me.zone%3)+Math.abs(Math.floor(z.id/3)-Math.floor(me.zone/3));const button=this.button(z.name+(z.shop?' · 补给站':'')+(z.id===me.zone?' · 当前位置':'')+(r.closed.includes(z.id)?' · 危险':''),()=>this.action('move',{zone:z.id}),!me.alive||inBattle||distance!==1||r.closed.includes(z.id),'arena-zone'+(z.id===me.zone?' is-current':'')+(r.closed.includes(z.id)?' is-closed':''));button.dataset.arenaMapAction='';button.dataset.arenaUnavailable=String(distance!==1||r.closed.includes(z.id));return button;});
      const controls=el('div',{class:'arena-mode__actions'},...[
        ['搜索',()=>this.action('search'),false],['生命药水（'+me.potions+'）',()=>this.action('heal'),me.potions<1||me.hp>=me.card.stats.hp],['休整 · 100 分',()=>this.action('rest'),me.score<100||me.hp>=me.card.stats.hp]
      ].map(([text,fn,unavailable])=>{const b=this.button(text,fn,!me.alive||inBattle||unavailable);b.dataset.arenaMapAction='';b.dataset.arenaUnavailable=String(unavailable);return b;}));
      const enemies=r.players.filter(p=>p.key!==me.key&&p.alive&&p.zone===me.zone);
      main=el('div',{class:'arena-mode__layout'},el('section',{class:'panel'},el('h2',{},r.zones[me.zone].name),
        el('p',{class:closed?'error':'muted'},closed?'当前区域危险，请尽快离开！':'存活 '+r.players.filter(p=>p.alive).length+' 人 · 天梯分数 '+me.score),
        r.next_close!=null?el('p',{class:'muted small'},'下一危险区域：'+r.zones[r.next_close].name):el('p',{class:'error'},'所有区域均已危险。'),
        el('div',{class:'arena-map'},mapButtons),controls,el('span',{'data-arena-cooldown':'',class:'muted small'}),
        !me.alive?el('p',{class:'error'},'你已被淘汰：'+me.death):null,
        fullCharRow({...me.card,stats:{...me.card.stats,hp:me.hp},icon:iconFor(me.card.name,me.card.clan)}),
        el('p',{class:'muted small'},'当前生命 '+me.hp+' / '+me.card.stats.hp),
        enemies.length?el('div',{},el('h3',{},'同区域玩家'),enemies.map(p=>el('div',{class:'arena-mode__actions'},el('b',{},p.team),(()=>{const button=this.button(p.busy?'对手正在交战':'交战',()=>this.action('attack',{target:p.key}),inBattle||!me.alive||p.busy);button.dataset.arenaMapAction='';button.dataset.arenaUnavailable=String(p.busy);return button;})()))):null),
        el('section',{class:'panel'},inBattle?this.battlePanel(r.battle):this.shopPanel(r.stock,me)));
    }
    const roster=el('div',{class:'arena-mode__roster'},r.players.map(p=>el('div',{class:p.alive?'':'is-eliminated'},el('b',{},p.team),el('span',{},p.alive?r.zones[p.zone].name+' · HP '+p.hp:'已淘汰'),el('small',{},p.kills+' 次击败玩家 · '+p.score+' 分'))));
    this.root.replaceChildren(el('section',{class:'arena-mode'},header,el('p',{class:'error',role:'alert','data-arena-message':''},this.message),main,el('details',{},el('summary',{},'参赛者'),roster),el('section',{class:'arena-mode__log','aria-label':'对局动态'},r.log.slice().reverse().map(e=>el('p',{},e.text)))));
    const log=this.root.querySelector('.arena-mode__battle-log');if(log)log.scrollTop=log.scrollHeight;
    this.updateTimers();
  }
  shopPanel(stock,me){
    return el('div',{},el('h2',{},'补给'),stock.length?el('div',{class:'arena-mode__stock'},stock.map(item=>{
      const label=item.kind==='weapon'?'武器 · '+item.weapon.name:item.kind==='skill'?skillMeta(item.skill.id).name+' +'+item.skill.lv:'生命药水 ×'+item.potion.n;
      return el('article',{class:'arena-mode__item'},qualityBadge(item.rarity),el('b',{},label),this.button(item.sold?'已购买':'购买 · '+item.price+' 分',()=>this.action('buy',{item:item.id}),!me.alive||item.sold||me.score<item.price));
    })):el('p',{class:'muted'},'前往地图中标注的补给站购买武器、技能和药水。'));
  }
  battlePanel(b){
    return el('div',{},el('h2',{},b.pvp?'玩家交战':'试炼'),el('p',{'data-arena-timer':'',class:'arena-mode__timer'}),
      el('div',{class:'arena-mode__combatants'},b.states.map(s=>el('article',{class:'arena-mode__unit'+(s.id===b.actor?' is-acting':'')},el('b',{},s.display_name+(s.minion_kind?' · '+({clone:'分身',summon:'使魔',shadow:'幻影',zombie:'丧尸'}[s.minion_kind]||'召唤物'):'')),el('span',{},'HP '+s.hp+' / '+s.max_hp+' · MP '+s.magic_point),el('small',{},Object.entries(battleDisplayStats(s)).filter(([k])=>k!=='hp').map(([k,v])=>({atk:'攻',def:'防',spd:'速',agi:'敏',mag:'魔',res:'抗',wis:'智'}[k])+' '+v).join(' · ')),el('small',{},s.status_labels.join(' · '))))),
      b.your_turn?el('div',{class:'arena-mode__hand'},b.hand.map(c=>handCardEl(c,{onPlay:()=>this.action('card',{card:c.id,turn:b.turn}),disabled:this.busy||!c.usable}))):el('p',{class:'muted'},'对手正在选择手牌，超时会由系统出牌。'),
      el('div',{class:'arena-mode__battle-log'},b.log.map(text=>el('p',{},text))));
  }
}
