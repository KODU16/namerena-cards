// 多人生存界面：只发送意图，角色、手牌、倒计时与胜负均以服务器结果为准。
import {battleShellEl,el,fullCharRow,handCardEl,qualityBadge} from './ui.js';
import {iconFor} from './engine.js';
import {duelIconForState,duelUnitRow} from './duel.js';
import {skillMeta} from './skills.js';

const ARENA_SAYS=['风会记住最后仍在移动的名字。','地图很大，但危险总会按时抵达。','别急着庆祝，下一格也许有人。','安全区从不承诺安全。','你的脚步声，可能已经被谁听见。','补给能救命，路线才决定结局。','最后留下的名字，才配被地图记住。'];

export class ArenaView {
  constructor(root,{onHome}){
    this.root=root;this.onHome=onHome;this.room=null;this.csrf='';this.user=null;this.guest=false;this.busy=false;this.closed=false;this.message='';this.version=-1;this.epoch=0;this.tab='status';this.resultDismissed=null;this.battleMinimized=false;this.logCache=new Map();this.logIdentity='';this.zoom=false;this.battleHandKey='';this.mapSay=ARENA_SAYS[0];
    // 浏览器持久化访客标识，使未登录玩家刷新页面后仍能回到同一局。
    this.guestId=localStorage.getItem('cards-arena-guest');if(!this.guestId){this.guestId=crypto.randomUUID();localStorage.setItem('cards-arena-guest',this.guestId);}
    this.timer=setInterval(()=>this.updateTimers(),200);
  }
  dispose(){this.closed=true;this.epoch++;clearInterval(this.timer);clearTimeout(this.pollTimer);}
  async call(path,body,retry=true){
    const response=await fetch('/api/cards'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json','X-Cards-Arena-Guest':this.guestId,...(this.csrf?{'X-CSRFToken':this.csrf}:{})}});
    let data;try{data=await response.json();}catch{
      // 主站只更新静态网页时返回 HTML 404，明确区分 API 未接通与网络/引擎故障。
      if(response.status===404)throw Error('多人服务尚未接通（HTTP 404）。网页已更新，主站还需要接入多人后端。');
      throw Error('多人服务返回异常内容（HTTP '+response.status+'），请稍后重试。');
    }
    if(data.csrf_token)this.csrf=data.csrf_token;
    if(response.status===400&&data.error?.code==='csrf_failed'&&retry){await this.call('/arena/session');return this.call(path,body,false);}
    if(!response.ok||!data.ok)throw Error(data.error?.message||'请求失败，请稍后重试');
    return data;
  }
  async open(){
    this.root.replaceChildren(el('p',{},'正在连接多人房间…'));
    try{const session=await this.call('/arena/session');if(this.closed)return;this.guest=!!session.guest;this.user=session.logged_in?session.teamname:(this.guest?'随机访客':null);await this.lobby();const code=new URLSearchParams(location.hash.slice(1)).get('arena');if(code&&this.user)await this.openRoom(code);}
    catch(error){if(!this.closed)this.root.replaceChildren(el('section',{class:'arena-mode'},el('h1',{},'名字生存战'),el('p',{class:'error',role:'alert'},error.message),this.button('重试',()=>this.open()),this.button('返回首页',this.onHome)));}
  }
  button(text,action,disabled=false,kind='ghost'){return el('button',{class:kind,type:'button',disabled:disabled||this.busy,'data-arena-base-disabled':String(!!disabled),onclick:action},text);}
  async lobby(){
    clearTimeout(this.pollTimer);this.room=null;this.signature=null;this.version=-1;const epoch=++this.epoch;
    const data=await this.call('/arena/rooms');if(this.closed||epoch!==this.epoch)return;
    const name=el('input',{placeholder:'角色：名字@战队（留空随机）',maxlength:181,'aria-label':'创建角色名'});
    const key=el('input',{type:'password',placeholder:'私房密钥（4～80 字符）',minlength:4,maxlength:80,autocomplete:'off','aria-label':'创建私房密钥'});
    const code=el('input',{placeholder:'六位私房号',maxlength:6,'aria-label':'房间号'});
    const rooms=el('div',{class:'arena-mode__rooms'}),publicInfo=el('section',{class:'arena-public-info'});
    const paint=rows=>rooms.replaceChildren(...rows.filter(r=>r.mode==='private').map(r=>el('article',{class:'arena-mode__room'},el('b',{},r.id+' · '+r.host),el('span',{},r.count+' 人 · '+(r.status==='waiting'?'等待开局':'进行中')),this.button('输入密钥加入',()=>this.openRoom(r.id),!this.user))));paint(data.rooms);
    // 公房只公开战局概况，保留位置与目标的迷雾信息。
    const paintPublic=rows=>{const room=rows.find(r=>r.id==='PUBLIC');publicInfo.replaceChildren(room
      ? el('div',{},el('h2',{},'公房概况'),el('div',{class:'arena-public-info__grid'},
        el('span',{},`地图 ${room.map_cells || 400} 格 · 已封锁 ${room.closed_count || 0} 格`),
        el('span',{},`第 ${room.round} 局 · ${room.status==='active'?'进行中':room.status==='cooldown'?'结算冷却':'等待开局'}`),
        el('span',{},`参赛 ${room.count} 人 · 存活 ${room.alive} 人`),
        el('span',{},`存活 AI ${room.ai_alive ?? '—'} · 第 ${Math.min(9,(room.phase || 0)+1)} 次缩圈`)))
      : el('p',{class:'muted'},'公房正在准备下一局。'));};paintPublic(data.rooms);
    this.root.replaceChildren(el('section',{class:'arena-mode arena-lobby'},el('h1',{},'名字生存战'),
      el('p',{},this.guest?'当前身份：随机访客（仅可使用系统随机名字）':this.user?'当前战队：'+this.user:'请先登录主站战队账号。'),
      el('div',{class:'arena-mode__actions'},this.button('进入公房',()=>this.openRoom('PUBLIC'),!this.user,'primary'),data.my_room?this.button('返回我的房间',()=>this.openRoom(data.my_room)):null,this.button('返回首页',this.onHome),this.button('历史对局',()=>this.history())),
      publicInfo,el('p',{},'公房持续开局，可中途加入；结算后冷却 1 分钟自动开始下一局。'),
      el('form',{class:'arena-mode__actions',onsubmit:e=>{e.preventDefault();if(key.reportValidity()&&key.value.length>=4)this.create(key.value,name.value);}},name,key,el('button',{type:'submit',disabled:!this.user||this.guest},'创建私房')),
      el('form',{class:'arena-mode__actions',onsubmit:e=>{e.preventDefault();if(code.value.trim())this.openRoom(code.value.trim());}},code,el('button',{type:'submit',disabled:!this.user||this.guest},'进入私房')),
      el('p',{class:'error',role:'alert','data-arena-message':''},this.message),rooms,
      el('p',{class:'muted'},'手机请横屏游玩。地图点击只移动，搜索在右侧行动栏进行；区域内可跨格相遇，野外必须同格；移动与搜索均有机会遇见角色或尸体。')));
    const poll=async()=>{if(this.closed||this.room||epoch!==this.epoch)return;try{const fresh=await this.call('/arena/rooms');if(!this.closed&&!this.room&&epoch===this.epoch){paint(fresh.rooms);paintPublic(fresh.rooms);}}catch{}if(!this.closed&&!this.room&&epoch===this.epoch)this.pollTimer=setTimeout(poll,4000);};this.pollTimer=setTimeout(poll,4000);
  }
  async history(){
    await this.perform(async()=>{
      clearTimeout(this.pollTimer);this.room=null;const data=await this.call('/arena/history');
      const format=at=>at?new Date(at*1000).toLocaleString('zh-CN',{hour12:false}):'—';
      const rows=(data.matches||[]).map(match=>el('tr',{},el('td',{},match.victory),el('td',{},String(match.score)),el('td',{},match.name),el('td',{},match.clan),el('td',{},format(match.finished_at))));
      const table=el('table',{},
        el('thead',{},el('tr',{},...['胜利方式','分数','优胜者名','战队名','游戏结束时间'].map(text=>el('th',{},text)))),
        el('tbody',{},...rows));
      this.root.replaceChildren(el('section',{class:'arena-mode arena-history'},el('h1',{},'历史对局'),el('div',{class:'arena-mode__actions'},this.button('返回大厅',()=>this.lobby()),this.button('返回首页',this.onHome)),rows.length?el('div',{class:'arena-history__scroll'},table):el('p',{class:'muted'},'尚无已结算的公房对局。')));
    });
  }
  async create(key,name){await this.perform(async()=>{const epoch=++this.epoch;const data=await this.call('/arena/rooms',{key,name});if(epoch===this.epoch)this.accept(data.room);});}
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
    if(this.room?.battle?.id!==room.battle?.id){this.battleMinimized=false;this.battleHandKey='';}
    const identity=room.id+':'+room.round;if(identity!==this.logIdentity){this.logIdentity=identity;this.logCache=new Map();this.mapSay=ARENA_SAYS[Math.floor(Math.random()*ARENA_SAYS.length)];}
    for(const entry of room.log||[])this.logCache.set(entry.seq,entry);
    if(room.log)room.log=[...this.logCache.values()].sort((a,b)=>a.seq-b.seq);
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
    const now=this.room.server_now+(performance.now()-this.received)/1000,b=this.room.battle;
    const node=this.root.querySelector('[data-arena-timer]');
    if(node&&b){const left=Math.max(0,Math.ceil(b.deadline-now));node.textContent=(b.your_turn?'你的出牌时间：':'等待对手出牌：')+left+' 秒';node.classList.toggle('is-urgent',left<=3);if(left===0)this.root.querySelectorAll('.arena-mode__hand button').forEach(button=>button.disabled=true);}
    const ready=this.root.querySelector('[data-arena-cooldown]');if(ready)ready.textContent=this.room.me?.ready_at>now?'行动冷却 '+Math.ceil(this.room.me.ready_at-now)+' 秒':'';
    const cycle=this.root.querySelector('[data-arena-cycle]');if(cycle)cycle.textContent=this.room.status==='cooldown'?'下一局倒计时 '+Math.max(0,Math.ceil(this.room.next_start-now))+' 秒':this.room.next_close_at?'下次缩圈 '+Math.max(0,Math.ceil(this.room.next_close_at-now))+' 秒':'';
    this.root.querySelectorAll('[data-arena-map-action]').forEach(button=>{if(!this.busy)button.disabled=button.dataset.arenaUnavailable==='true'||!!b||!this.room.me?.alive||this.room.status!=='active'||this.room.me.ready_at>now;});
  }
  mapAction(text,fn,unavailable=false){const b=this.button(text,fn,unavailable);b.dataset.arenaMapAction='';b.dataset.arenaUnavailable=String(unavailable);return b;}
  async earlierLogs(){await this.perform(async()=>{const first=Math.min(...this.logCache.keys());const result=await this.call('/arena/rooms/'+this.room.id+'/log?before='+first);for(const e of result.log)this.logCache.set(e.seq,e);this.room.log=[...this.logCache.values()].sort((a,b)=>a.seq-b.seq);});}
  regionName(cell){return String.fromCharCode(65+cell.row)+(cell.col+1)+' · '+cell.name;}
  chooseTab(tab){this.tab=tab;this.signature=null;this.renderRoom();}
  renderRoom(){
    const r=this.room;if(!r||this.closed)return;
    const oldLog=this.root.querySelector('[data-arena-log]'),follow=!oldLog||oldLog.scrollHeight-oldLog.scrollTop-oldLog.clientHeight<25,logOffset=oldLog?.scrollTop||0;
    const signature=JSON.stringify([this.zoom,r.locked,r.status,r.round,r.me,r.players,r.battle,r.phase,r.stock,r.log,this.message,this.tab,this.battleMinimized,this.resultDismissed]);if(signature===this.signature)return;this.signature=signature;
    const goLobby=()=>this.perform(async()=>{history.replaceState(null,'',location.pathname+location.search);await this.lobby();});
    const header=el('header',{class:'arena-mode__header'},el('b',{},(r.mode==='public'?'公房':'私房 '+r.id)+' · 第 '+r.round+' 局'),el('span',{'data-arena-cycle':'',class:'small'}),el('div',{class:'arena-mode__actions'},this.button('大厅',goLobby),this.button('首页',this.onHome),r.me&&!r.me.left&&r.status!=='finished'&&r.status!=='cooldown'?this.button(r.status==='waiting'?'退出房间':'退出参赛',()=>this.action('leave')):null));
    if(r.locked){
      const name=el('input',{placeholder:'角色：名字@战队（留空随机）',maxlength:181,'aria-label':'加入角色名'});
      const key=el('input',{type:'password',placeholder:'输入私房密钥',maxlength:80,'aria-label':'私房密钥',autocomplete:'off'});
      this.root.replaceChildren(el('section',{class:'arena-mode'},header,el('h2',{},'此房间需要密钥'),el('form',{class:'arena-mode__actions',onsubmit:e=>{e.preventDefault();this.action('join',{key:key.value,name:name.value});}},name,key,el('button',{type:'submit'},'加入房间')),el('p',{class:'error','data-arena-message':''},this.message)));return;
    }
    const me=r.me,ended=r.status==='finished'||r.status==='cooldown';
    const rotate=el('div',{class:'arena-rotate'},el('b',{},'请将手机横屏'),el('p',{},'地图在左，状态与操作在右，横屏后继续游玩。'),this.button('返回首页',this.onHome));
    const map=el('div',{class:'arena-map'+(this.zoom?' is-zoomed':''),'aria-label':'20×20 生存地图'},r.zones.map(z=>{
      const closed=r.closed.includes(z.id),current=me?.zone===z.id,upcoming=r.next_close.includes(z.id);
      const tile=this.mapAction('',()=>this.action('move',{zone:z.id}),closed||current||!me);
      tile.className='arena-zone loot-'+z.loot+(closed?' is-closed':'')+(current?' is-current':'')+(upcoming?' is-next':'');
      tile.title=this.regionName(z)+(closed?' · 已封锁':upcoming?' · 下次封锁':'')+'；点击移动，到达后在行动栏搜索';
      tile.setAttribute('aria-label',tile.title);tile.dataset.cell=z.id;
      tile.append(el('small',{},String.fromCharCode(65+z.row)+(z.col+1)),el('span',{},closed?'×':current?'●':z.region!=null?z.name.slice(0,1):'·'));return tile;
    }));
    const tabs=el('nav',{class:'arena-right-tabs','aria-label':'角色信息切换'},...[[ 'status','状态'],['inventory','物品栏'],['players','参赛者'],['rules','玩法']].map(([id,text])=>this.button(text,()=>this.chooseTab(id),false,this.tab===id?'primary':'ghost')));
    let panel;
    if(ended){const winner=r.players.find(p=>p.key===r.winner);panel=el('div',{class:r.ending?'end--gold':''},el('h2',{},r.winner_name?'最终存活':'本局结束'),el('p',{},winner?winner.team+' · '+winner.score+' 天梯分数':r.winner_name||r.finish_reason||'本局无人最终存活。'),r.ending?el('p',{},'天梯分数超越了 1A 榜首。'):null,r.ending&&r.ladder?.source==='snapshot'?el('small',{},'实时天梯不可用，按已有快照判定。'):null,r.mode==='public'?el('p',{},'冷却结束后自动开始下一局，请重新加入参赛。'):this.button('回到大厅',goLobby));}
    else if(!me||me.left){const name=el('input',{placeholder:'角色：名字@战队（留空随机）',maxlength:181,'aria-label':'加入角色名'});panel=el('div',{},el('h2',{},'公房正在进行'),el('p',{},'开局含 20 个天梯 1A AI 和 20 个随机试炼 AI。'),el('form',{onsubmit:e=>{e.preventDefault();this.action('join',{name:name.value});}},name,el('button',{type:'submit',class:'primary'},'加入本局')));}
    else if(this.tab==='inventory'){
      panel=el('div',{class:'arena-inventory'},el('h3',{},'药水'),this.mapAction('生命药水 ×'+me.potions+' · 恢复 35%',()=>this.action('heal'),!me.potions||me.hp>=me.card.stats.hp),this.mapAction('大瓶生命药水 ×'+me.large_potions+' · 恢复 60%',()=>this.action('heal',{large:true}),!me.large_potions||me.hp>=me.card.stats.hp),el('h3',{},'武器'),me.card.weapon?this.mapAction('卸下当前武器',()=>this.action('equip',{item:null})):null,...me.weapons.map(w=>el('article',{class:'arena-inventory__weapon'},el('span',{},w.name),this.mapAction(me.card.weaponItem?.id===w.id?'已装备':'装备',()=>this.action('equip',{item:w.id}),me.card.weaponItem?.id===w.id))),!me.weapons.length?el('p',{class:'muted'},'搜索废铸工坊、落日矿场，或前往补给站购买武器。'):null,this.shopPanel(r.stock,me));
    }else if(this.tab==='players'){
      // 己方固定置顶；AI 仅公开身份与战绩，不泄露其地图位置。
      const contestants=[...(r.players||[]).map(p=>({...p,type:'player'})),...(r.ai||[]).map(ai=>({...ai,type:'ai',team:ai.kind==='ladder'?'天梯 AI':'试炼 AI'}))].sort((a,b)=>(b.key===me?.key)-(a.key===me?.key)||Number(b.alive)-Number(a.alive)||b.score-a.score);
      panel=el('div',{class:'arena-mode__roster'},contestants.map(p=>el('article',{class:(p.alive?'':'is-eliminated')+(p.key===me?.key?' is-self':'')},el('img',{class:'arena-roster__icon',src:iconFor(p.name,p.clan),alt:''}),el('div',{class:'arena-roster__who'},el('b',{},p.name+'@'+p.clan),el('small',{},p.type==='ai'?(p.kind==='ladder'?'天梯 AI':'试炼 AI'):(p.alive?'存活':'已淘汰'))),el('span',{class:'arena-roster__score'},Math.round(p.score||0)+' 分'))));
    }else if(this.tab==='rules'){
      panel=el('div',{class:'small'},el('p',{},'点击任一安全格移动；行动栏点击搜索才会遇敌或获得物品。每 90 秒缩圈，危险格每 10 秒扣血；第九轮封锁最后一格并结算。'),el('p',{},'同一命名区域内可跨格相遇；野外玩家与 NPC 只能在同格相遇。两处补给站可买武器、技能与药水。'),el('p',{},'公房可中途加入，结束后冷却 60 秒自动开下一局。私房需密钥，至少两人由房主开局，时间独立。'),el('p',{},'每次出牌 10 秒，超时随机选择可用牌。普通攻击不受负 MP 限制；交战期间不能移动、换装或喝地图药水。'),el('p',{},'最终存活者获胜；分数严格超过 1A 天梯榜首时获得金色胜利。'));
    }else{
      const cell=r.zones[me.zone];
      panel=el('div',{},el('div',{class:'arena-status-line'},el('b',{},this.regionName(cell)),el('span',{},me.score+' 分 · 玩家 '+r.players.filter(p=>p.alive).length+' / AI '+r.ai_alive)),!me.alive?el('p',{class:'error'},'你已被淘汰：'+me.death):null,
        r.status==='waiting'?el('div',{class:'arena-mode__actions'},r.host===me.key?this.button('开始对局',()=>this.action('start'),r.players.length<2,'primary'):el('span',{},'等待房主开局')):el('div',{class:'arena-mode__actions arena-actions'},this.mapAction('搜索',()=>this.action('search')),this.mapAction('生命药水（'+me.potions+'）',()=>this.action('heal'),!me.potions||me.hp>=me.card.stats.hp),this.mapAction('休整 · 100 分',()=>this.action('rest'),me.score<100||me.hp>=me.card.stats.hp),r.battle?this.button('返回战斗',()=>{this.battleMinimized=false;this.signature=null;this.renderRoom();}):null),
        fullCharRow({...me.card,stats:{...me.card.stats,hp:me.hp},icon:iconFor(me.card.name,me.card.clan)}),el('small',{},'当前生命 '+me.hp+' / '+me.card.stats.hp),
        ...(r.corpses||[]).map(c=>this.mapAction('搜刮 '+c.name+' 的尸体',()=>this.action('loot',{corpse:c.id}))),el('small',{'data-arena-cooldown':''}),el('p',{class:'muted small'},'此区域偏向：'+({wild:'分数与普通补给',supplies:'生命药水',healing:'生命药水、大瓶药水',skill:'技能成长',weapon:'武器',mixed:'多种补给'}[cell.loot])),cell.shop?this.button('查看补给站',()=>this.chooseTab('inventory')):null);
    }
    const actors=[...(r.players||[]),...(r.ai||[])];
    const broadcastLine=e=>{const actor=actors.find(a=>e.text.includes(a.name+'@'+a.clan)||e.text.startsWith(a.team));return el('p',{class:'arena-broadcast__line'},actor?el('img',{class:'arena-log__icon',src:iconFor(actor.name,actor.clan),alt:''}):null,e.text);};
    const broadcast=el('section',{class:'arena-broadcast','aria-label':'战斗结果与系统广播'},el('div',{class:'arena-log-heading'},el('b',{},'战斗结果 / 系统广播'),r.log.length<r.log_count?this.button('更早消息',()=>this.earlierLogs()):null),el('div',{'data-arena-log':''},r.log.map(broadcastLine)));
    const workspace=el('div',{class:'arena-workspace'},el('section',{class:'arena-map-panel'},el('div',{class:'arena-map-tools'},el('span',{},this.mapSay),this.button(this.zoom?'全图':'放大',()=>{this.zoom=!this.zoom;this.signature=null;this.renderRoom();})),el('div',{class:'arena-map-scroll'},map),el('div',{class:'arena-map-legend'},el('span',{},'● 当前位置　斜纹：下次封锁　红色：已封锁'),el('small',{},'林：药水　台/库：技能　坊/场：武器　集/驿：补给站'))),el('aside',{class:'arena-right'},tabs,el('section',{class:'arena-right-content'},panel),el('p',{class:'error',role:'alert','data-arena-message':'',hidden:!this.message},this.message),broadcast));
    const section=el('section',{class:'arena-mode arena-game'},header,rotate,workspace);
    // 多人战斗复用尖塔的战斗骨架；收起仅查看地图，不暂停服务器倒计时。
    if(r.battle&&!this.battleMinimized){section.append(el('div',{class:'arena-battle-modal',role:'dialog','aria-modal':'true','aria-label':'手牌战斗'},el('section',{class:'arena-battle-sheet'},el('div',{class:'arena-mode__actions'},el('b',{},r.battle.pvp?'玩家交战':'试炼交战'),this.button('收起查看地图',()=>{this.battleMinimized=true;this.signature=null;this.renderRoom();})),this.battlePanel(r.battle))));}
    else if(!r.battle&&me?.last_battle&&this.resultDismissed!==me.last_battle.id){const result=me.last_battle;const dismiss=()=>{this.resultDismissed=result.id;this.action('ack_battle',{battle:result.id});};section.append(el('div',{class:'arena-battle-modal',role:'dialog','aria-modal':'true','aria-label':'战斗结果'},el('section',{class:'arena-battle-sheet'},el('h2',{},result.won?'交战获胜':'交战失利'),el('div',{class:'arena-mode__battle-log'},result.log.map(t=>el('p',{},t))),this.button('返回地图',dismiss))));}
    this.root.replaceChildren(section);const logView=this.root.querySelector('[data-arena-log]');if(logView)logView.scrollTop=follow?logView.scrollHeight:logOffset;this.updateTimers();
  }
  shopPanel(stock,me){
    return el('div',{},el('h2',{},'补给'),stock.length?el('div',{class:'arena-mode__stock'},stock.map(item=>{
      const label=item.kind==='weapon'?'武器 · '+item.weapon.name:item.kind==='skill'?skillMeta(item.skill.id).name+' +'+item.skill.lv:'生命药水 ×'+item.potion.n;
      return el('article',{class:'arena-mode__item'},qualityBadge(item.rarity),el('b',{},label),this.mapAction(item.sold?'已购买':'购买 · '+item.price+' 分',()=>this.action('buy',{item:item.id}),!me.alive||item.sold||me.score<item.price));
    })):el('p',{class:'muted'},'前往地图中标注的补给站购买武器、技能和药水。'));
  }
  battlePanel(b){
    // 同一 tswn 状态直接交给尖塔的单位组件，不在浏览器重算伤害、属性或胜负。
    const shell=battleShellEl({readOnly:true,onSpeed:()=>{},onSkip:()=>{}});
    shell.classList.add('arena-battle');
    shell.querySelector('#battle-round').textContent='第 '+b.rounds+' 回合 · '+(b.pvp?'玩家交战':'试炼交战');
    const timer=el('span',{'data-arena-timer':'',class:'arena-mode__timer'});
    shell.querySelector('.battle__bar').append(timer);
    const roots=b.states.filter(s=>s.owner_id==null),mine=roots.find(s=>s.input_team_index===b.your_side)||roots[0],enemy=roots.find(s=>s!==mine)||roots[0];
    const mount=(state,side)=>{
      if(!state)return;
      const wrap=shell.querySelector('#unit-'+side),node=duelUnitRow(state,side,{icon:duelIconForState(iconFor,state)});
      if(state.id===b.actor)node.classList.add('is-acting');
      wrap.append(node);
      b.states.filter(s=>s.owner_id===state.id).forEach(minion=>wrap.append(duelUnitRow(minion,side,{icon:duelIconForState(iconFor,minion)})));
    };
    mount(mine,'player');mount(enemy,'enemy');
    const log=shell.querySelector('#battle-log');
    // 服务端战报也沿用尖塔中栏的语义色，不另起一套多人配色。
    const tone=text=>/恢复|治疗|吸血|苏生/.test(text)?'tone-heal':/冰冻|中毒|诅咒|迟缓|魅惑|狂暴|护盾|铁壁/.test(text)?'tone-status':/召唤|分身|使魔/.test(text)?'tone-summon':/击败|胜利|淘汰/.test(text)?'tone-win':/伤害|攻击|反弹|死亡/.test(text)?'tone-damage':'tone-system';
    log.replaceChildren(...b.log.map(text=>/^第\s*\d+\s*回合/.test(text)?el('div',{class:'log__round'},text):el('div',{class:'log__line '+tone(text)},text)));log.scrollTop=log.scrollHeight;
    const hand=shell.querySelector('#battle-hand');
    const handKey=[b.id,b.turn,b.your_turn,b.hand.map(c=>[c.id,c.cost,c.usable]).join('|')].join(':');
    const stable=handKey===this.battleHandKey;this.battleHandKey=handKey;
    if(b.your_turn){hand.classList.toggle('hand--stable',stable);hand.replaceChildren(...b.hand.map(c=>handCardEl(c,{onPlay:()=>this.action('card',{card:c.id,turn:b.turn}),disabled:this.busy||!c.usable,locked:!c.usable})));}
    else hand.replaceChildren(el('p',{class:'muted'},'对手正在选择手牌，超时会由系统出牌。'));
    return shell;
  }
}
