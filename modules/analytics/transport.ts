type Payload=Record<string,unknown>;
type Reply='ready'|'excluded'|'retry';
type Item={payload:Payload;once?:string;created:number;attempts:number};
type Options={send:(payload:Payload)=>Promise<Reply>;visit:()=>Payload;now:()=>number;schedule:(fn:()=>void,delay:number)=>unknown};
// Memory only: bounded recovery must never retain customer data or block buying.
export function createAnalyticsTransport(options:Options){
 const queue:Item[]=[],seen=new Map<string,number>();
 let sessionAt:number|null=null,landing:Payload|null=null,excluded=false,running:Promise<void>|null=null,retryScheduled=false,blockedUntil=0,failures=0;
 const ttl=5*60_000,maxQueue=32,maxSeen=512;
 async function send(payload:Payload):Promise<Reply>{try{return await options.send(payload)}catch{return 'retry'}}
 function remember(key?:string){if(!key)return;if(seen.size>=maxSeen)seen.delete(seen.keys().next().value!);seen.set(key,options.now())}
 function prune(){const now=options.now();for(let i=queue.length-1;i>=0;i--)if(now-queue[i].created>=ttl)queue.splice(i,1);for(const [key,at] of seen)if(now-at>=20*60_000)seen.delete(key)}
 function clear(){excluded=true;queue.length=0;seen.clear()}
 function retry(){
  failures++;blockedUntil=options.now()+(failures<3?2000:60_000);
  if(failures>=3||retryScheduled)return;
  retryScheduled=true;options.schedule(()=>{retryScheduled=false;void flush()},2000);
 }
 async function drain(){
  prune();if(excluded||options.now()<blockedUntil)return;
  if(sessionAt===null||options.now()-sessionAt>=20*60_000){
   const state=await send(landing??=options.visit());if(state==='excluded'){clear();return}if(state!=='ready'){sessionAt=null;retry();return}sessionAt=options.now();landing=null;
  }
  while(queue.length&&!excluded){
   const item=queue[0];if(options.now()-item.created>=ttl){queue.shift();continue}
   const state=await send(item.payload);
   if(state==='excluded'){clear();return}
   if(state!=='ready'){
    item.attempts++;sessionAt=null;if(item.attempts>=3)queue.shift();retry();return;
   }
   queue.shift();remember(item.once);failures=0;blockedUntil=0;
  }
 }
 function flush(){
  if(running)return running;
  running=drain().finally(()=>{running=null});return running;
 }
 function track(payload:Payload,once?:string){
  prune();if(excluded||once&&(seen.has(once)||queue.some(item=>item.once===once)))return;
  if(queue.length>=maxQueue)return;
  queue.push({payload,once,created:options.now(),attempts:0});void flush();
 }
 return {init:flush,track,resume:()=>{if(failures<3)blockedUntil=0;return flush()}};
}
