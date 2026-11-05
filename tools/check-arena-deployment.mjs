// 验收真实同源 API、WASM 和公房时钟；不以静态资源或 CI 构建成功判断已部署。
const origin=process.argv[2]||'https://shenjack.top:10007';
const noTimer=process.argv.includes('--no-timer-check');
async function get(path){
 const url=new URL('/api/cards/arena/'+path,origin),r=await fetch(url,{signal:AbortSignal.timeout(12000),cache:'no-store'});
 let data;try{data=await r.json();}catch{throw Error(url.pathname+' 返回非 JSON（HTTP '+r.status+'）；主站尚未接入多人 API 或路由错误。');}
 if(!r.ok||!data.ok)throw Error(url.pathname+' HTTP '+r.status+'：'+(data.error?.message||'接口异常'));
 return data;
}
try{
 const session=await get('session');if(typeof session.logged_in!=='boolean'||!session.csrf_token)throw Error('多人会话接口不完整');
 const health=await get('health');if(health.protocol!==3||!health.runtime_ready)throw Error('Node/WASM 版本不匹配或未启动');
 if(!noTimer&&!health.timer_ready)throw Error('公房计时进程未运行或心跳超过 15 秒');
 const rooms=await get('rooms');if(!rooms.rooms?.some(r=>r.id==='PUBLIC'&&r.mode==='public'))throw Error('公房没有自动创建');
 console.log(JSON.stringify({ready:true,protocol:health.protocol,runtime:true,timer:health.timer_ready,publicRoom:true}));
}catch(error){console.error(String(error.message||error));process.exitCode=1;}
