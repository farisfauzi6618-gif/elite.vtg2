import { env } from '@/lib/env';
import { AppError,db,hash,random,encrypt,decrypt,session } from "@/modules/order/order-server";
import { shippingClient,kiriminClient } from "@/modules/order/shipping-settings";
import type { Shipment } from "@/modules/order/fulfilment-types";
import type { Order } from "@/modules/order/order-types";
import { normalizeTrackingHistory,type TrackingHistory,type CustomerTracking } from "@/modules/order/tracking-types";

type Link={order_id:string;token_hash:string;token_cipher:string;expires_at:number;created_at:number};
type Cache={order_id:string;awb:string;payload:string|null;checked_at:number|null;next_attempt_at:number;lease:number;last_error:string|null};
const TOKEN_LIFE=180*86400000;
const invoicePattern=/^EV-\d{6}-[A-F0-9]{8}$/;
const validToken=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const phone=(v:string)=>v.replace(/[\s()+-]/g,"").replace(/^0/,"62");
const shipment=(id:string)=>db().prepare("SELECT * FROM shipments WHERE order_id=?").bind(id).first<Shipment>();

export async function trackingAccess(o:Order){
 if(!o.proof_key)throw new AppError(409,"Kirim bukti pembayaran sebelum membuka pelacakan.");
 let link=await db().prepare("SELECT * FROM tracking_links WHERE order_id=?").bind(o.id).first<Link>();
 if(!link||link.expires_at<=Date.now()){
  const token=random(),now=Date.now();
  await db().prepare("INSERT INTO tracking_links(order_id,token_hash,token_cipher,expires_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET token_hash=excluded.token_hash,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,created_at=excluded.created_at WHERE tracking_links.expires_at<=?").bind(o.id,await hash(token),await encrypt(token),now+TOKEN_LIFE,now,now).run();
  link=await db().prepare("SELECT * FROM tracking_links WHERE order_id=?").bind(o.id).first<Link>();
 }
 if(!link)throw new AppError(503,"Tautan pelacakan belum tersedia.");
 const token=await decrypt(link.token_cipher),origin=env.SITE_ORIGIN;
 if(!origin||!/^https:\/\//.test(origin))throw new AppError(503,"Tautan pelacakan belum tersedia.");
 return {token,url:origin+"/lacak#"+token,expiresAt:link.expires_at};
}
export async function trackingOrder(req:Request){
 const authorization=req.headers.get("authorization");
 if(authorization){const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";if(!validToken(token))throw new AppError(404,"Tautan pelacakan tidak berlaku.");
  const o=await db().prepare("SELECT orders.* FROM tracking_links JOIN orders ON orders.id=tracking_links.order_id WHERE tracking_links.token_hash=? AND tracking_links.expires_at>?").bind(await hash(token),Date.now()).first<Order>();
  if(!o||!o.proof_key)throw new AppError(404,"Tautan pelacakan tidak berlaku.");return o;
 }
 const token=session(req);if(!validToken(token))throw new AppError(404,"Buka tautan pelacakan atau masukkan nomor invoice dan nomor HP.");
 const o=await db().prepare("SELECT * FROM orders WHERE session_hash=? AND created_at>? AND proof_key IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(await hash(token),Date.now()-TOKEN_LIFE).first<Order>();
 if(!o)throw new AppError(404,"Pesanan belum ditemukan. Gunakan invoice dan nomor HP penerima.");return o;
}
export async function lookupTracking(invoice:unknown,receiverPhone:unknown){
 const id=typeof invoice==="string"?invoice.trim().toUpperCase():"",number=typeof receiverPhone==="string"?phone(receiverPhone):"";
 if(!invoicePattern.test(id)||!/^62\d{8,13}$/.test(number))throw new AppError(400,"Isi nomor invoice dan nomor HP penerima yang valid.");
 const o=await db().prepare("SELECT * FROM orders WHERE id=? AND created_at>? AND proof_key IS NOT NULL").bind(id,Date.now()-TOKEN_LIFE).first<Order>();
 if(!o||await hash(phone(o.phone))!==await hash(number))throw new AppError(404,"Invoice atau nomor HP penerima belum cocok.");return o;
}
function cacheHistory(c:Cache|null,awb:string):TrackingHistory|null{if(c?.awb!==awb||!c.payload)return null;try{return JSON.parse(c.payload) as TrackingHistory;}catch{return null;}}
export async function customerTracking(o:Order):Promise<CustomerTracking>{
 let s=await shipment(o.id);const confirmed=o.payment_state==="payment_confirmed";
 const base:CustomerTracking={invoice:o.id,awb:s?.awb||null,courier:"J&T Express",paymentConfirmed:confirmed,checkedAt:null,stale:false,simulation:s?.environment==="sandbox",stage:confirmed?s?.provider_no?"preparing":"payment_confirmed":"proof_received",lastStatus:"",events:[],message:confirmed?"Pesanan sedang disiapkan oleh ELITE.VTG.":"Bukti pembayaran sudah diterima dan menunggu pemeriksaan ELITE.VTG."};
 // Read-only provider lookup may discover a delayed AWB. Never create a booking or pickup here.
 if(confirmed&&s?.provider_no&&!s.awb){
  const now=Date.now();await db().prepare("INSERT INTO shipment_tracking(order_id,awb) VALUES(?,'') ON CONFLICT(order_id) DO NOTHING").bind(o.id).run();
  const lock=await db().prepare("UPDATE shipment_tracking SET lease=?,next_attempt_at=? WHERE order_id=? AND lease<? AND next_attempt_at<? RETURNING order_id").bind(now+45000,now+120000,o.id,now,now).first();
  if(lock){try{const detail=await (await (s.provider==="kiriminaja"?kiriminClient(s.environment||undefined):shippingClient(s.environment||undefined))).detail(s.provider_no);const details=s.provider==="kiriminaja"?detail.details as Record<string,unknown>:detail;
   if((s.provider==="kiriminaja"?details?.order_id===s.provider_no:detail.order_no===s.provider_no)&&typeof details.awb==="string"&&/^[A-Za-z0-9_-]{6,70}$/.test(details.awb)){
   await db().prepare("UPDATE shipments SET awb=?,state='awb_available',updated_at=? WHERE order_id=? AND provider_no=? AND awb IS NULL").bind(details.awb,Date.now(),o.id,s.provider_no).run();s=await shipment(o.id);base.awb=s?.awb||null;
  }}catch{/* The cached customer state is retained. */}finally{await db().prepare("UPDATE shipment_tracking SET lease=0 WHERE order_id=?").bind(o.id).run();}}
 }
 if(!confirmed||!s?.awb)return base;
 const awb=s.awb;await db().prepare("INSERT INTO shipment_tracking(order_id,awb) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET awb=excluded.awb,payload=NULL,checked_at=NULL,next_attempt_at=0,last_error=NULL WHERE shipment_tracking.awb!=excluded.awb").bind(o.id,awb).run();
 let c=await db().prepare("SELECT * FROM shipment_tracking WHERE order_id=?").bind(o.id).first<Cache>();const now=Date.now();
 if(c&&c.next_attempt_at<=now&&c.lease<now){
  const lock=await db().prepare("UPDATE shipment_tracking SET lease=? WHERE order_id=? AND awb=? AND lease<? AND next_attempt_at<=? RETURNING order_id").bind(now+45000,o.id,awb,now,now).first();
  if(lock){try{const history=normalizeTrackingHistory(await (await (s.provider==="kiriminaja"?kiriminClient(s.environment||undefined):shippingClient(s.environment||undefined))).history(awb),awb);await db().prepare("UPDATE shipment_tracking SET payload=?,checked_at=?,next_attempt_at=?,last_error=NULL WHERE order_id=? AND awb=?").bind(JSON.stringify(history),Date.now(),Date.now()+600000,o.id,awb).run();}
  catch{await db().prepare("UPDATE shipment_tracking SET last_error=?,next_attempt_at=? WHERE order_id=? AND awb=?").bind("Pembaruan kurir belum tersedia.",Date.now()+120000,o.id,awb).run();}
  finally{await db().prepare("UPDATE shipment_tracking SET lease=0 WHERE order_id=?").bind(o.id).run();}
  c=await db().prepare("SELECT * FROM shipment_tracking WHERE order_id=?").bind(o.id).first<Cache>();
 }
 }
 const history=cacheHistory(c,awb),events=history?.events||[];
 return {...base,awb,stage:history?.stage||"awb_available",lastStatus:history?.lastStatus||"",events,checkedAt:c?.checked_at||null,stale:!!c?.last_error,message:c?.last_error?events.length?"Pembaruan terbaru belum tersedia. Riwayat terakhir tetap ditampilkan.":"Resi tersedia. Riwayat perjalanan belum tersedia dari kurir.":events.length?"Status mengikuti pembaruan resmi kurir.":"Resi tersedia. Paket belum dianggap sudah dikirim sampai ada pembaruan dari kurir."};
}
