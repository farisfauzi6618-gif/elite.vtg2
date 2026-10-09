import { api,json,owner,originCheck,body,db,bucket,AppError,decrypt,telegram } from "@/modules/order/order-server";
import { ensureTelegramWebhook } from "@/modules/order/telegram-actions";
import { shipment,shipmentSummary,processShipment,reconcileBooking } from "@/modules/order/fulfilment";
import { shippingClient,kiriminClient,validCoordinatePair,kiriminSettings } from "@/modules/order/shipping-settings";
import { orderQuote,type Order } from "@/modules/order/order-types";
import { normalize,pickupSchedule } from "@/modules/order/komship";
import { readShippingConfig } from "@/modules/order/shipping-settings";
import { settings } from "@/modules/order/order-server";
import type { KomshipLocation } from "@/modules/order/fulfilment-types";
export const GET=(r:Request,ctx:{params:Promise<{id:string}>})=>api(async()=>{await owner(r);const {id}=await ctx.params,s=await shipment(id);const format=new URL(r.url).searchParams.get("format");if(format!=="pdf"&&format!=="png")return json({shipment:shipmentSummary(s)});const key=format==="pdf"?s?.label_pdf:s?.label_png;if(!key)throw new AppError(404,"Label belum tersedia.");const file=await bucket().get(key);if(!file)throw new AppError(404,"Label tidak ditemukan.");return new Response(file.body,{headers:{"Content-Type":format==="pdf"?"application/pdf":"image/png","Content-Disposition":`attachment; filename="ELITE-${s?.awb||id}.${format}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});});
export const POST=(r:Request,ctx:{params:Promise<{id:string}>})=>api(async()=>{originCheck(r);await owner(r);const {id}=await ctx.params,v=await body(r);const o=await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Order>();if(!o)throw new AppError(404,"Pesanan tidak ditemukan.");
 if(v.action==="retry")return json(await processShipment(id));
 if(v.action==="confirmation-button"){
  const config=await settings();if(!o.proof_key||!o.invoice_message||!config?.bot_cipher||config.chat_id!==o.delivery_chat)throw new AppError(409,"Invoice dan bukti pesanan harus tersedia pada chat Telegram pemilik yang terhubung.");
  if(o.payment_state==="payment_confirmed")throw new AppError(409,"Pembayaran sudah dikonfirmasi.");await ensureTelegramWebhook(config);
  await telegram(await decrypt(config.bot_cipher),"editMessageReplyMarkup",{chat_id:config.chat_id,message_id:Number(o.invoice_message),reply_markup:{inline_keyboard:[[{text:"Konfirmasi pembayaran & buat resi",callback_data:"confirm:"+id}]]}});return json({ok:true});
 }
 if(v.action==="reconcile"){await reconcileBooking(id,String(v.providerNo||""));return json(await processShipment(id));}
 if(v.action==="package"){
  const s=await shipment(id);if(s&&(s.lease>Date.now()||s.create_sent_at||s.provider_no))throw new AppError(409,"Berat dan batas biaya dikunci setelah permintaan booking dikirim.");
  const grams=Number(v.grams),max=Number(v.maxCost);if(!Number.isSafeInteger(grams)||grams<100||grams>30000||!Number.isSafeInteger(max)||max<0||max>2000000)throw new AppError(400,"Berat 100–30.000 gram dan batas ongkir dan asuransi maksimal Rp2.000.000.");
  let destination:KomshipLocation|null=null;if(v.destinationId){const rows=await (await kiriminClient()).search(o.postcode);destination=rows.find(x=>x.id===Number(v.destinationId))||null;const q=orderQuote(o);if(!destination||!q||destination.postcode!==o.postcode||normalize(destination.district)!==normalize(q.destination.district)||normalize(destination.city)!==normalize(q.destination.city))throw new AppError(409,"Wilayah tujuan tidak sesuai invoice.");}
  if(v.latitude!=null||v.longitude!=null){if(!validCoordinatePair(v.latitude,v.longitude))throw new AppError(400,"Koordinat penerima belum valid.");if(!destination){const q=orderQuote(o);if(!q)throw new AppError(409,"Wilayah invoice belum lengkap.");destination=await (await kiriminClient()).destination(q.destination);}destination={...destination,latitude:Number(v.latitude),longitude:Number(v.longitude)};}
  await db().prepare("INSERT INTO shipments(order_id,state,weight_grams,max_cost,destination_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET weight_grams=excluded.weight_grams,max_cost=excluded.max_cost,destination_json=excluded.destination_json,config_json=NULL WHERE shipments.create_sent_at IS NULL AND shipments.provider_no IS NULL AND shipments.lease<?").bind(id,o.payment_state==="payment_confirmed"?"payment_confirmed":"awaiting_confirmation",grams,max,destination?JSON.stringify(destination):null,Date.now(),Date.now()).run();return json({ok:true});
 }
 if(v.action==="pickup"){
  const s=await shipment(id);if(s?.provider==="kiriminaja")throw new AppError(409,"Pickup KiriminAja sudah diminta bersama booking. Ubah jadwal melalui dashboard KiriminAja.");if(!s?.provider_no||s.lease>Date.now()||["scheduled","sending","unknown"].includes(s.pickup_state))throw new AppError(409,"Pickup tidak dapat diubah saat sudah dijadwalkan atau responsnya belum pasti.");const config=readShippingConfig((await settings())?.shipping_config);const schedule=pickupSchedule(config);await db().prepare("UPDATE shipments SET pickup_json=?,pickup_state='pending' WHERE order_id=? AND lease<?").bind(JSON.stringify(schedule),id,Date.now()).run();return json({ok:true});
 }
 throw new AppError(400,"Tindakan tidak valid.");
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
