import {db} from '@/modules/catalog/server';
import {currentCustomer} from '@/modules/catalog/customers';
import {analyticsSession} from './server';
export const CHECKOUT_STEPS=['checkout_viewed','recipient_info_completed','shipping_quote_success','shipping_option_selected','payment_method_selected'] as const;
const ID=/^[a-f0-9-]{36}$/;
type Context={id:string;visitor_id:string;user_id:string|null;traffic_source:string;utm_source:string|null;utm_medium:string|null;utm_campaign:string|null;utm_content:string|null};
async function write(s:Context,name:string,checkoutId:string,entry:string,actor:string,device:string,orderId:string|null=null){
 await db().prepare(`INSERT OR IGNORE INTO analytics_events(id,dedupe_key,event_name,timestamp,session_id,visitor_id,user_id,order_id,traffic_source,utm_source,utm_medium,utm_campaign,utm_content,checkout_id,checkout_entry,checkout_actor,device_class) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),'checkout-ux-v1:'+checkoutId+':'+name,name,Date.now(),s.id,s.visitor_id,s.user_id,orderId,s.traffic_source,s.utm_source,s.utm_medium,s.utm_campaign,s.utm_content,checkoutId,entry,actor,device).run();
}
export async function checkoutProgress(request:Request,value:Record<string,unknown>){
 const s=await analyticsSession(request),id=value.checkoutId;if(!s||typeof id!=='string'||!ID.test(id)||!Array.isArray(value.steps)||!value.steps.length||value.steps.length>CHECKOUT_STEPS.length||value.steps.some(step=>!(CHECKOUT_STEPS as readonly unknown[]).includes(step)))return;
 if(value.manual!==true&&!await db().prepare('SELECT checkout_id FROM analytics_checkout_context WHERE checkout_id=? AND session_id=?').bind(id,s.id).first())return;
 if(value.manual===true){if(await db().prepare('SELECT checkout_id FROM analytics_checkout_context WHERE checkout_id=?').bind(id).first())return;const previous=await db().prepare("SELECT session_id FROM analytics_events WHERE checkout_id=? AND event_name='checkout_viewed'").bind(id).first<{session_id:string}>();if(previous&&previous.session_id!==s.id)return;}
 const customer=await currentCustomer(request.headers.get('cookie')),actor=customer?'member':'guest',ua=request.headers.get('user-agent')??'',device=!ua?'unknown':/mobile|android|iphone|ipad/i.test(ua)?'mobile':'desktop';
 const entry=value.manual===true?'manual':value.entry==='buy_now'?'buy_now':value.entry==='cart'?'cart':'unknown';
 // Always write the view first. Retries/refreshes cannot create another view or
 // overwrite the original attribution, account kind, device or entry method.
 for(const step of new Set(['checkout_viewed',...value.steps]))await write({...s,user_id:customer?.id??null},String(step),id,entry,actor,device);
}
export async function checkoutOrderSubmitted(request:Request,orderId:string){
 const o=await db().prepare('SELECT catalog_checkout_id,customer_id FROM orders WHERE id=?').bind(orderId).first<{catalog_checkout_id:string|null;customer_id:string|null}>();if(!o)return;
 const id=o.catalog_checkout_id??request.headers.get('x-checkout-flow');if(!id||!ID.test(id))return;
 const view=await db().prepare("SELECT session_id,checkout_entry,checkout_actor,device_class FROM analytics_events WHERE checkout_id=? AND event_name='checkout_viewed' LIMIT 1").bind(id).first<{session_id:string;checkout_entry:string;checkout_actor:string;device_class:string}>();if(!view)return;
 const s=await db().prepare('SELECT * FROM analytics_sessions WHERE id=?').bind(view.session_id).first<Context>();if(!s)return;
 if(!o.catalog_checkout_id&&(await analyticsSession(request))?.id!==s.id)return;
 await write({...s,user_id:o.customer_id},'order_submitted',id,view.checkout_entry,view.checkout_actor,view.device_class,orderId);
}

export async function checkoutFlowReport(start:number,end:number){
 const rows=(await db().prepare(`SELECT v.checkout_id,v.timestamp AS viewed,v.checkout_entry AS entry,v.checkout_actor AS actor,v.device_class AS device,v.traffic_source AS source,
 MIN(CASE WHEN e.event_name='order_submitted' THEN e.timestamp END) AS submitted,
 MIN(CASE WHEN e.event_name='payment_reached' THEN e.timestamp END) AS payment,
 MIN(CASE WHEN e.event_name='payment_proof_uploaded' THEN e.timestamp END) AS proof,
 MIN(CASE WHEN e.event_name='order_completed' AND o.payment_state='payment_confirmed' AND o.status NOT IN ('cancelled','expired','refunded','failed') THEN e.timestamp END) AS confirmed,
 MAX(CASE WHEN e.event_name='shipping_quote_success' THEN 1 ELSE 0 END) AS shipping,
 MAX(CASE WHEN e.event_name='recipient_info_completed' THEN 1 ELSE 0 END) AS recipient
 FROM analytics_events v LEFT JOIN analytics_events submitted ON submitted.checkout_id=v.checkout_id AND submitted.event_name='order_submitted'
 LEFT JOIN analytics_events e ON (e.checkout_id=v.checkout_id OR (e.order_id=submitted.order_id AND e.event_name IN ('payment_reached','payment_proof_uploaded','order_completed'))) AND e.timestamp>=v.timestamp
 LEFT JOIN orders o ON o.id=e.order_id WHERE v.event_name='checkout_viewed' AND v.timestamp>=? AND v.timestamp<? GROUP BY v.checkout_id`).bind(start,end).all<{checkout_id:string;viewed:number;entry:string;actor:string;device:string;source:string;submitted:number|null;payment:number|null;proof:number|null;confirmed:number|null;shipping:number;recipient:number}>()).results;
 const stages=[{key:'viewed',label:'Checkout ditampilkan',count:rows.length},{key:'submitted',label:'Order tersimpan',count:rows.filter(r=>r.submitted!=null&&r.submitted>=r.viewed).length},{key:'payment',label:'Instruksi pembayaran dibuka',count:rows.filter(r=>r.submitted!=null&&r.payment!=null&&r.payment>=r.submitted).length},{key:'proof',label:'Bukti tersimpan',count:rows.filter(r=>r.submitted!=null&&r.payment!=null&&r.proof!=null&&r.payment>=r.submitted&&r.proof>=r.payment).length},{key:'confirmed',label:'Pembayaran dikonfirmasi',count:rows.filter(r=>r.submitted!=null&&r.payment!=null&&r.proof!=null&&r.confirmed!=null&&r.payment>=r.submitted&&r.proof>=r.payment&&r.confirmed>=r.proof).length}];
 const durations=rows.filter(r=>r.submitted!=null&&r.submitted>=r.viewed).map(r=>r.submitted!-r.viewed);
 const segments=(['entry','actor','device','source'] as const).map(dimension=>({dimension,rows:[...new Set(rows.map(r=>r[dimension]))].map(value=>{const selected=rows.filter(r=>r[dimension]===value);return {value,viewed:selected.length,submitted:selected.filter(r=>r.submitted!=null&&r.submitted>=r.viewed).length}})}));
 return {version:'checkout-ux-v1',cohort:'First checkout_viewed within selected dates; progression observed as of report time',stages,shippingSuccess:rows.filter(r=>r.shipping).length,recipientCompleted:rows.filter(r=>r.recipient).length,averageSubmitSeconds:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length/1000):null,segments};
}
