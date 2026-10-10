'use client';
// Capture attribution before the catalogue removes filter/UTM query parameters.
let ready:Promise<void>|null=null,bootAt=0;
const dedupe=new Set<string>();
const publicPath=()=>/^(\/$|\/produk\/|\/recently-sold\/?$|\/order\/?$|\/ongkir\/?$)/.test(location.pathname);
async function send(value:Record<string,unknown>){try{await fetch('/api/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),keepalive:true,signal:AbortSignal.timeout(4000)});}catch{/* Analytics cannot interrupt shopping. */}}
export function initAnalytics(){
 if(typeof window==='undefined'||!publicPath())return Promise.resolve();
 if(!ready||Date.now()-bootAt>20*60000){bootAt=Date.now();const p=new URLSearchParams(location.search),payload:Record<string,unknown>={event:'visit',path:location.pathname};for(const k of ['utm_source','utm_medium','utm_campaign','utm_content'])payload[k]=p.get(k);try{payload.referrer=document.referrer?new URL(document.referrer).origin:''}catch{}ready=send(payload);}
 return ready;
}
export function track(event:string,details:Record<string,unknown>={},once?:string){
 if(typeof window==='undefined'||!publicPath())return;
 if(once){if(dedupe.has(once))return;dedupe.add(once)}
 const pending=initAnalytics();void pending.then(()=>send({event,id:crypto.randomUUID(),...details}));
}
export function trackError(code:string,productId?:string){track('error',{code,productId})}
