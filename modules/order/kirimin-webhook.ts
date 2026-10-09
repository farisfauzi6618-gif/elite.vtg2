import { env } from '@/lib/env';
import { AppError,db,settings,encrypt,decrypt,hash,random,type Settings } from "@/modules/order/order-server";
import { kiriminClient } from "@/modules/order/shipping-settings";
import { processKiriminShipment } from "@/modules/order/kirimin-fulfilment";
import { record } from "@/modules/order/kiriminaja";
import type { Shipment } from "@/modules/order/fulfilment-types";

function provisionedWebhookToken(){
 const token=env.KIRIMINAJA_WEBHOOK_TOKEN;
 return typeof token==="string"&&/^[a-f0-9]{64}$/.test(token)?token:null;
}

export async function ensureKiriminWebhook(){
 const s=await settings();if(!s?.kirimin_cipher)throw new AppError(409,"Simpan API key KiriminAja dahulu.");
 if(s.kirimin_webhook_active&&s.kirimin_webhook_cipher)return;
 const origin=env.SITE_ORIGIN;if(!origin?.startsWith("https://"))throw new AppError(503,"Alamat callback belum tersedia.");
 const token=s.kirimin_webhook_cipher?await decrypt(s.kirimin_webhook_cipher):provisionedWebhookToken()||random();
 await db().prepare("UPDATE settings SET kirimin_webhook_cipher=?,kirimin_webhook_active=0 WHERE id=1").bind(await encrypt(token)).run();
 await (await kiriminClient()).request("/api/mitra/set_callback","POST",{url:origin+"/api/kiriminaja/webhook/"+token});
 await db().prepare("UPDATE settings SET kirimin_webhook_active=1 WHERE id=1").run();
}
export async function verifyKiriminWebhook(token:string,req?:Request){
 const s=await settings(),expected=s?.kirimin_webhook_cipher?await decrypt(s.kirimin_webhook_cipher):provisionedWebhookToken();
 // Registration can check the protected URL before issuing a key. Receiving
 // events still requires the owner's saved API key and activated callback.
 if(!s||!expected||!/^[a-f0-9]{64}$/.test(token)||await hash(token)!==await hash(expected))throw new AppError(403,"Callback tidak sah.");
 if(req&&(!s.kirimin_cipher||!s.kirimin_webhook_active||await hash(req.headers.get("authorization")||"")!==await hash("Bearer "+await decrypt(s.kirimin_cipher))))throw new AppError(403,"Callback tidak sah.");
 return s;
}
export async function receiveKiriminWebhook(value:unknown,s:Settings){
 const payload=record(value),events=new Set(["processed_packages","shipped_packages","canceled_packages","finished_packages","returned_packages","problem_packages","return_finished_packages"]);
 if(!events.has(String(payload.method)))return;
 const rows=Array.isArray(payload.data)?payload.data:[],ids=[...new Set(rows.map(x=>record(x).order_id).filter((id):id is string=>typeof id==="string"&&/^EV-\d{6}-[A-F0-9]{8}$/.test(id)))];
 if(ids.length>20)throw new AppError(413,"Terlalu banyak pesanan dalam callback.");
 for(const id of ids){
  const shipment=await db().prepare("SELECT s.* FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.order_id=? AND s.provider='kiriminaja' AND s.create_sent_at IS NOT NULL AND o.payment_state='payment_confirmed' AND o.proof_key IS NOT NULL AND o.confirmed_by=? AND o.delivery_chat=?").bind(id,s.chat_id,s.chat_id).first<Shipment>();
  if(!shipment)continue;
  // Event status, recipient details and AWB are untrusted hints. Tracking is read
  // from the provider again; a callback never submits create/pickup or confirms money.
  await db().prepare("UPDATE shipment_tracking SET next_attempt_at=0 WHERE order_id=?").bind(id).run();
  if(shipment.pdf_message&&shipment.png_message&&shipment.summary_message)continue;
  const result=await processKiriminShipment(id,false);if("ok" in result&&!result.ok)throw new AppError(503,"Resi atau label belum tersedia. Callback dapat dicoba ulang; booking yang sama dipertahankan.");
 }
}
