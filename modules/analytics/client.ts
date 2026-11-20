'use client';
import {analyticsPath} from './paths';
import {createAnalyticsTransport} from './transport';

const allowed=()=>typeof window!=='undefined'&&analyticsPath(location.pathname);
const transport=createAnalyticsTransport({
 now:Date.now,schedule:(fn,delay)=>setTimeout(fn,delay),
 async send(value){
  const response=await fetch('/api/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),keepalive:true,signal:AbortSignal.timeout(4000)});
  if(!response.ok)return 'retry';
  const state=response.headers.get('X-Analytics-State');return state==='ready'||state==='excluded'?state:'retry';
 },
 visit(){
  const p=new URLSearchParams(location.search),payload:Record<string,unknown>={event:'visit',path:location.pathname};
  for(const k of ['utm_source','utm_medium','utm_campaign','utm_content'])payload[k]=p.get(k);
  try{payload.referrer=document.referrer?new URL(document.referrer).origin:''}catch{}
  return payload;
 }
});
export function initAnalytics(){return allowed()?transport.init():Promise.resolve()}
export function resumeAnalytics(){return allowed()?transport.resume():Promise.resolve()}
export function track(event:string,details:Record<string,unknown>={},once?:string){
 if(allowed())transport.track({event,id:crypto.randomUUID(),...details},once);
}
export function trackError(code:string,productId?:string,once?:string){track('error',{code,productId},once)}
