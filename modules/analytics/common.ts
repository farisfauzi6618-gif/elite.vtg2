export const SOURCES=['Instagram','Instagram Ads','Threads','Google','Direct','Referral','Other'] as const;
export const STAGES=['visit','product_view','add_to_cart','checkout_started','payment_reached','payment_proof_uploaded','order_completed'] as const;
export const STAGE_LABELS=['Unique Visitors','Product View','Add to Cart','Checkout Started','Payment Reached','Payment Proof Uploaded','Order Completed'];
export const ERROR_CODES=['checkout_error','proof_upload_error','shipping_api_error','add_to_cart_error','sold_attempt','critical_image','critical_404'] as const;
export const ERROR_LABELS:Record<string,string>={checkout_error:'Checkout Error',proof_upload_error:'Payment Proof Upload Error',shipping_api_error:'Shipping API Error',add_to_cart_error:'Add to Cart Error',sold_attempt:'Attempt to purchase SOLD item',critical_image:'Broken critical image',critical_404:'Critical 404'};
export const percent=(n:number,d:number)=>d>0?n/d*100:0;
export function normalizeSearch(value:unknown){return typeof value==='string'?value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ').replace(/[\x00-\x1f]/g,'').slice(0,120):''}
// Never collect the full landing URL or referrer: these may contain order capabilities.
export function traffic(input:Record<string,unknown>,origin:string){
 const clean=(v:unknown)=>typeof v==='string'?v.replace(/[\x00-\x1f]/g,'').trim().slice(0,100)||null:null;
 const utm_source=clean(input.utm_source),utm_medium=clean(input.utm_medium),utm_campaign=clean(input.utm_campaign),utm_content=clean(input.utm_content);
 const source=utm_source?.toLowerCase()||'',medium=utm_medium?.toLowerCase()||'';
 let host='';try{host=new URL(String(input.referrer)).hostname.toLowerCase()}catch{}
 const matches=(domain:string)=>host===domain||host.endsWith('.'+domain);
 let traffic_source:typeof SOURCES[number]='Other';
 if(/^(instagram|ig)$/.test(source)||(!source&&matches('instagram.com')))traffic_source=/^(paid|paid_social|cpc|ppc|ads)$/.test(medium)?'Instagram Ads':'Instagram';
 else if(/^(threads|thread)$/.test(source)||(!source&&(matches('threads.net')||matches('threads.com'))))traffic_source='Threads';
 else if(source==='google'||(!source&&/(^|\.)google\.[a-z.]+$/.test(host)))traffic_source='Google';
 else if(!source)traffic_source=!host||host===new URL(origin).hostname?'Direct':'Referral';
 return {traffic_source,utm_source,utm_medium,utm_campaign,utm_content};
}
const DAY=86400000;
export function dateRange(params:URLSearchParams,now=Date.now()){
 const today=new Date(now+7*3600000).toISOString().slice(0,10),preset=params.get('range')||'7d';
 const day=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00+07:00'))||new Date(Date.parse(v+'T00:00:00+07:00')+7*3600000).toISOString().slice(0,10)!==v)throw new Error('Tanggal tidak valid.');return Date.parse(v+'T00:00:00+07:00')};
 let start=day(today),end=start+DAY;
 if(preset==='7d')start-=6*DAY;else if(preset==='30d')start-=29*DAY;
 else if(preset==='custom'){start=day(params.get('start')||'');end=day(params.get('end')||'')+DAY;if(end<=start||end-start>366*DAY)throw new Error('Pilih rentang maksimal 366 hari, tanggal akhir setelah tanggal awal.');}
 else if(preset!=='today')throw new Error('Rentang tanggal tidak valid.');
 return {preset,start,end,startDate:new Date(start+7*3600000).toISOString().slice(0,10),endDate:new Date(end-DAY+7*3600000).toISOString().slice(0,10)};
}
