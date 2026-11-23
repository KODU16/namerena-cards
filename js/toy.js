import {TOY} from './platform.js';

// 平台身份只来自官方 SDK；本地或未登录时不伪造用户名。
let sdkTask, profileTask;
const timeout = (task, ms=12000) => new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Bilibili 响应超时，请在 Toy 中重试')),ms);
  Promise.resolve(task).then(resolve,reject).finally(()=>clearTimeout(timer));
});
export async function toySdk() {
  if(!TOY) throw new Error('此功能仅在 Cards Toy 中提供');
  if(globalThis.toy) return globalThis.toy;
  if(!sdkTask) sdkTask=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    script.onload=()=>globalThis.toy?resolve(globalThis.toy):reject(new Error('Toy SDK 未就绪'));
    script.onerror=()=>{script.remove();reject(new Error('无法加载 Toy SDK'));};
    document.head.append(script);
  });
  try{return await timeout(sdkTask);}catch(error){sdkTask=null;throw error;}
}
export async function toyProfile() {
  if(!profileTask) profileTask=(async()=>{
    const sdk=await toySdk(),profile=await timeout(sdk.getUserProfile());
    if(typeof profile?.nickname!=='string'||!profile.nickname.trim()) throw new Error('请先登录 Bilibili，再开始挑战');
    return profile;
  })();
  try{return await profileTask;}catch(error){profileTask=null;throw error;}
}

// 每局只在完整通关后上传最终分数；失败保留重试，重绘共享同一个请求。
const submissions=new WeakMap();
export function submitVictory(run,persist) {
  if(!TOY||run?.status!=='won') return Promise.resolve(null);
  if(run.toyRank?.status==='sent'&&run.toyRank.score===run.score) return Promise.resolve(run.toyRank);
  if(submissions.has(run)) return submissions.get(run);
  const task=(async()=>{
    const score=run.score;
    if(!Number.isInteger(score)||score<-(2**24)||score>2**24-1) throw new Error('通关分数超出平台范围，无法原样上传');
    const retryAt=run.toyRank?.retryAt||0;
    if(Date.now()<retryAt) throw new Error('请求较频繁，请稍后再试');
    try{
      const sdk=await toySdk();
      await timeout(sdk.submitScore({board:1,score}));
      run.toyRank={status:'sent',score};persist();return run.toyRank;
    }catch(error){
      run.toyRank={status:'failed',score,retryAt:Date.now()+(Number(error.code)===307044?60000:5000)};
      persist();throw error;
    }
  })();
  submissions.set(run,task);task.finally(()=>submissions.delete(run)).catch(()=>{});return task;
}
export async function toyRanks() {
  const sdk=await toySdk();
  return timeout(Promise.all([sdk.getRankList({board:1,period:'all',limit:50}),sdk.getMyRank({board:1,period:'all'})]));
}
