import {db,AppError,requireAdmin} from '@/modules/catalog/server';
import {currentCustomer} from '@/modules/catalog/customers';
import {myOrder} from '@/modules/order/order-server';
import {traffic,normalizeSearch,ERROR_CODES} from './common';
type Session={id:string;visitor_id:string;user_id:string|null;started_at:number;last_seen_at:number;traffic_source:string;utm_source:string|null;utm_medium:string|null;utm_campaign:string|null;utm_content:string|null};
const ID=/^[a-f0-9-]{36}$/;
const cookie=(r:Request,name:string)=>r.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
export async function requireAnalytics(r?:Request){const user=await requireAdmin(r);if(user.role!=='owner'&&!user.analyticsAllowed)throw new AppError(403,'Akses Analytics belum diberikan oleh pemilik.');return user}
// Best-effort observers never turn a successful business operation into a failure.
export async function observe(action:()=>Promise<unknown>){try{await action()}catch{console.warn('Analytics observer unavailable');}}
export async function analyticsSession(r:Request){if(cookie(r,'elite_admin')||cookie(r,'elite_team'))return null;const id=cookie(r,'elite_visit');if(!ID.test(id))return null;return db().prepare('SELECT * FROM analytics_sessions WHERE id=? AND last_seen_at>?').bind(id,Date.now()-1800000).first<Session>()}
export async function startVisit(r:Request,input:Record<string,unknown>){
 // Exclude authenticated staff, automated agents and prefetches. No IP/UA stored.
 if(/bot|spider|crawler|headless/i.test(r.headers.get('user-agent')||'')||r.headers.get('purpose')==='prefetch')return [];
 try{await requireAdmin(r);return []}catch(e){if(!(e instanceof AppError)||![401,403].includes(e.status))throw e}
 const now=Date.now(),customer=await currentCustomer(r.headers.get('cookie'));let s=await analyticsSession(r);
 let visitor=cookie(r,'elite_visitor');if(!ID.test(visitor))visitor=crypto.randomUUID();
 if(s){await db().prepare('UPDATE analytics_sessions SET last_seen_at=?,user_id=COALESCE(?,user_id) WHERE id=?').bind(now,customer?.id??null,s.id).run();s={...s,user_id:customer?.id??s.user_id};visitor=s.visitor_id;}
 else {s={id:crypto.randomUUID(),visitor_id:visitor,user_id:customer?.id??null,started_at:now,last_seen_at:now,...traffic(input,new URL(r.url).origin)};await db().prepare('INSERT INTO analytics_sessions(id,visitor_id,user_id,started_at,last_seen_at,traffic_source,utm_source,utm_medium,utm_campaign,utm_content) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(s.id,s.visitor_id,s.user_id,now,now,s.traffic_source,s.utm_source,s.utm_medium,s.utm_campaign,s.utm_content).run();}
 // Each visitor contributes once per WIB day, including returning sessions.
 await event(s,'visit','visit:'+s.id+':'+Math.floor((now+25200000)/86400000));
 const secure=new URL(r.url).protocol==='https:'?'Secure; ':'';
 return [`elite_visitor=${visitor}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=31536000`,`elite_visit=${s.id}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=1800`];
}
type Detail={productId?:string;orderId?:string;query?:string;resultCount?:number;errorCode?:string;userId?:string|null};
export async function event(s:Session|null,name:string,key:string,v:Detail={},products:string[]=[]){
 const id=crypto.randomUUID(),d=db();await d.batch([d.prepare('INSERT OR IGNORE INTO analytics_events(id,dedupe_key,event_name,timestamp,session_id,visitor_id,user_id,product_id,order_id,search_query,result_count,traffic_source,utm_source,utm_medium,utm_campaign,utm_content,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,key,name,Date.now(),s?.id,s?.visitor_id,v.userId??s?.user_id,v.productId,v.orderId,v.query,v.resultCount,s?.traffic_source??'Other',s?.utm_source,s?.utm_medium,s?.utm_campaign,s?.utm_content,v.errorCode),...products.map(p=>d.prepare('INSERT OR IGNORE INTO analytics_event_products(event_id,product_id) SELECT id,? FROM analytics_events WHERE dedupe_key=?').bind(p,key))]);
}
export async function collect(r:Request,v:Record<string,unknown>){
 const s=await analyticsSession(r);if(!s)return;
 await db().prepare('UPDATE analytics_sessions SET last_seen_at=? WHERE id=?').bind(Date.now(),s.id).run();
 const customer=await currentCustomer(r.headers.get('cookie'));if(customer)s.user_id=customer.id;
 const productId=typeof v.productId==='string'&&v.productId.length<=100?v.productId:undefined;
 if(v.event==='product_view'||v.event==='add_to_cart'){
  const p=productId?await db().prepare("SELECT p.id,EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND g.qty>0) AS stocked,p.orderable_at FROM products p WHERE p.id=? AND p.status='published'").bind(productId).first<{id:string;stocked:number;orderable_at:string|null}>():null;if(!p)return;
  if(v.event==='add_to_cart'&&(!p.stocked||(p.orderable_at&&Date.parse(p.orderable_at)>Date.now())))return;
  const nonce=typeof v.id==='string'&&ID.test(v.id)?v.id:'';if(v.event==='add_to_cart'&&!nonce)return;
  await event(s,String(v.event),v.event==='product_view'?'view:'+s.id+':'+p.id:'cart:'+s.id+':'+nonce,{productId:p.id});return;
 }
 if(v.event==='search'){const query=normalizeSearch(v.query);if(!query||!Number.isSafeInteger(v.resultCount)||Number(v.resultCount)<0||Number(v.resultCount)>100000)return;const nonce=typeof v.id==='string'&&ID.test(v.id)?v.id:'';if(!nonce)return;await event(s,'search','search:'+s.id+':'+nonce,{query,resultCount:Number(v.resultCount)});return;}
 if(v.event==='checkout_started'&&v.manual===true){await event(s,'checkout_started','manual:'+s.id);return;}
 if(v.event==='payment_reached'){
  const o=await myOrder(r);if(o.status!=='awaiting_proof'||o.proof_key)return;
  await attachOrder(r,o.id);const context=await orderSession(o.id);await event(context,'payment_reached','payment:'+o.id,{orderId:o.id,userId:o.customer_id});return;
 }
 if(v.event==='error'&&typeof v.code==='string'&&(ERROR_CODES as readonly string[]).includes(v.code))await event(s,'error','error:'+s.id+':'+v.code+':'+(productId??'')+':'+Math.floor(Date.now()/300000),{productId,errorCode:v.code});
 // Client-supplied completion, proof, money, metadata and source fields are ignored.
}
export async function checkoutObserved(r:Request,checkoutId:string,products:string[]){const s=await analyticsSession(r);if(!s)return;await db().prepare('INSERT OR IGNORE INTO analytics_checkout_context VALUES(?,?)').bind(checkoutId,s.id).run();await event(s,'checkout_started','checkout:'+checkoutId,{},products)}
export async function attachOrder(r:Request,id:string){const o=await db().prepare('SELECT catalog_checkout_id FROM orders WHERE id=?').bind(id).first<{catalog_checkout_id:string|null}>();if(!o)return;const c=o.catalog_checkout_id?await db().prepare('SELECT session_id FROM analytics_checkout_context WHERE checkout_id=?').bind(o.catalog_checkout_id).first<{session_id:string}>():null;const s=c?await db().prepare('SELECT * FROM analytics_sessions WHERE id=?').bind(c.session_id).first<Session>():await analyticsSession(r);if(s)await db().prepare('INSERT INTO analytics_order_context VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET session_id=excluded.session_id').bind(id,s.id).run();}
async function orderSession(id:string){return db().prepare('SELECT s.* FROM analytics_order_context c JOIN analytics_sessions s ON s.id=c.session_id WHERE c.order_id=?').bind(id).first<Session>()}
export async function proofObserved(id:string){const o=await db().prepare('SELECT proof_key,customer_id FROM orders WHERE id=?').bind(id).first<{proof_key:string|null;customer_id:string|null}>();if(o?.proof_key)await event(await orderSession(id),'payment_proof_uploaded','proof:'+id,{orderId:id,userId:o.customer_id})}
