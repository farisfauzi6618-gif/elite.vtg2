import { db,settings,encrypt,decrypt,AppError,bucket,telegram } from "@/modules/order/order-server";
import { orderQuote,rupiah,type Order } from "@/modules/order/order-types";
import { readShippingConfig,shippingClient,validOrigin } from "@/modules/order/legacy-shipping-settings";
import { pickupSchedule,KomshipError,normalize } from "@/modules/order/komship";
import type { Shipment,ShipmentSummary,ShippingConfig,KomshipLocation } from "@/modules/order/fulfilment-types";
import type { RegularRate } from "@/modules/order/komship";
import { jntInsuranceQuote,insuranceMatches,JNT_INSURANCE_MINIMUM } from "@/modules/order/shipping-insurance";
import { orderItems } from "@/modules/order/order-items";
import { jntServiceName } from "@/modules/order/shipping-types";
import { trackingAccess } from "@/modules/order/customer-tracking";
import { env } from '@/lib/env';
import { synchronizeCatalogStock } from '@/modules/order/catalog-bridge';

export async function shipment(id:string){return db().prepare("SELECT * FROM shipments WHERE order_id=?").bind(id).first<Shipment>();}
export function shipmentSummary(s:Shipment|null):ShipmentSummary|null{return s?{provider:s.provider||(s.create_sent_at||s.provider_no?"komship":"kiriminaja"),state:s.state,weight_grams:s.weight_grams,max_cost:s.max_cost,provider_no:s.provider_no,awb:s.awb,pickup_state:s.pickup_state,last_error:s.last_error,insurance_state:s.insurance_state,insured_value:s.insured_value,insurance_fee:s.insurance_fee,updated_at:s.updated_at,pdfReady:!!s.label_pdf,pngReady:!!s.label_png,labelsSent:!!(s.pdf_message&&s.png_message)}:null;}
async function order(id:string){const o=await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Order&{payment_state:string;confirmed_by:string|null}>();if(!o)throw new AppError(404,"Pesanan tidak ditemukan.");return o;}
const phone=(s:string)=>s.replace(/^\+/,"").replace(/^0/,"62");
const validAwb=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9_-]{6,70}$/.test(v)&&!/[{}]/.test(v);
export async function confirmPayment(id:string,telegramId:string,messageId:number){
 const o=await order(id),s=await settings();if(!s?.chat_id||telegramId!==s.chat_id||o.delivery_chat!==s.chat_id||String(messageId)!==o.invoice_message)throw new AppError(403,"Konfirmasi harus berasal dari invoice di chat Telegram pemilik.");if(!o.proof_key)throw new AppError(409,"Bukti pembayaran belum diterima.");
 await db().batch([db().prepare("UPDATE orders SET payment_state='payment_confirmed',confirmed_at=COALESCE(confirmed_at,?),confirmed_by=COALESCE(confirmed_by,?) WHERE id=? AND proof_key IS NOT NULL").bind(Date.now(),telegramId,id),db().prepare("INSERT INTO shipments(order_id,updated_at) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET state='payment_confirmed',updated_at=excluded.updated_at WHERE shipments.state='awaiting_confirmation'").bind(id,Date.now())]);
 await synchronizeCatalogStock(id);
}
async function refresh(s:Shipment){return (await shipment(s.order_id))!;}
async function update(id:string,sql:string,...values:unknown[]){await db().prepare("UPDATE shipments SET "+sql+",updated_at=? WHERE order_id=?").bind(...values,Date.now(),id).run();}
function requiredInsurance(o:Order){const q=jntInsuranceQuote(o.item_amount||0);if(!q.eligible)throw new AppError(409,`Asuransi wajib. Komship mensyaratkan harga barang minimal ${rupiah(JNT_INSURANCE_MINIMUM)}; booking ditahan. Hubungi Komship untuk pilihan asuransi pada nilai barang sebenarnya.`);return q;}
export function storePayload(o:Order,c:ShippingConfig,destination:KomshipLocation,grams:number,rate:RegularRate){const amount=o.item_amount;if(!amount)throw new AppError(409,"Pesanan lama belum mempunyai harga barang dan wilayah yang lengkap.");const insurance=requiredInsurance(o),items=orderItems(o);return {order_date:new Date(Date.now()+7*3600000).toISOString().slice(0,19).replace("T"," "),brand_name:c.senderName,shipper_name:c.senderName,shipper_phone:phone(c.senderPhone),shipper_destination_id:c.origin!.id,shipper_address:c.senderAddress+", "+c.senderPostcode,shipper_email:c.senderEmail,receiver_name:o.name,receiver_phone:phone(o.phone),receiver_destination_id:destination.id,receiver_address:o.address+", "+destination.label,shipping:rate.courier,shipping_type:rate.service,payment_method:"BANK TRANSFER",shipping_cost:rate.gross,shipping_cashback:rate.cashback,service_fee:0,additional_cost:0,grand_total:amount+rate.gross,cod_value:0,insurance_value:insurance.premium,notes:"ELITE invoice "+o.id+" · "+items.length+" barang",order_details:[{product_name:items.join("; "),product_variant_name:items.length>1?"Paket "+items.length+" barang":"",product_price:amount,product_weight:grams,product_length:c.length,product_width:c.width,product_height:c.height,qty:1,subtotal:amount}]};}
export async function processKomshipShipment(id:string){
 const o=await order(id),settingsNow=await settings();if(o.payment_state!=="payment_confirmed"||!o.proof_key)throw new AppError(409,"Konfirmasi pembayaran melalui Telegram dahulu.");if(!settingsNow?.chat_id||settingsNow.chat_id!==o.confirmed_by||settingsNow.chat_id!==o.delivery_chat)throw new AppError(409,"Akun Telegram penerima berubah. Periksa pemilik pesanan ini.");
 const now=Date.now(),lock=await db().prepare("UPDATE shipments SET lease=?,updated_at=? WHERE order_id=? AND lease<? RETURNING *").bind(now+240000,now,id,now).first<Shipment>();if(!lock)return {busy:true,shipment:shipmentSummary(await shipment(id))};
 let s=lock;
 try{
  const live=readShippingConfig(settingsNow.shipping_config);let config=s.config_json?JSON.parse(await decrypt(s.config_json)) as ShippingConfig:live;
  if(!live.enabled||!settingsNow.shipping_cipher)throw new AppError(409,"Booking belum aktif. Lengkapi key Shipping Delivery, wilayah asal, berat, ukuran, dan pickup di pengaturan pemilik.");
  if(!validOrigin(config.origin)||!config.senderEmail||!config.length||!config.width||!config.height)throw new AppError(409,"Pengaturan pengirim belum lengkap.");
  if(s.provider_no&&live.environment!==s.environment)throw new AppError(409,"Kembalikan lingkungan API sesuai booking yang sudah dibuat.");
  const client=await shippingClient(s.environment||config.environment);
  const insurance=requiredInsurance(o);
  if(!s.provider_no){
   if(s.create_sent_at){await update(id,"state='booking_unknown'");throw new AppError(409,"Respons booking belum pasti. Periksa dashboard Komship dan hubungkan nomor booking yang sudah ada; aplikasi menahan booking baru.");}
   const q=orderQuote(o);if(!q)throw new AppError(409,"Pesanan ini belum memiliki wilayah dan berat yang terverifikasi.");
   const grams=s.weight_grams||q.grams||config.defaultGrams;if(!Number.isSafeInteger(grams)||grams<100||grams>30000)throw new AppError(409,"Berat paket belum valid.");
   const destination=s.destination_json?JSON.parse(s.destination_json) as KomshipLocation:await client.destination(q.destination);
   if(destination.postcode!==o.postcode||normalize(destination.district)!==normalize(q.destination.district)||normalize(destination.city)!==normalize(q.destination.city))throw new AppError(409,"Wilayah Komship tidak sesuai alamat invoice.");
   const tariff=await client.tariff(config.origin!.id,destination.id,grams,o.item_amount!,q.service);
   const cost=tariff.net+insurance.premium,cap=s.max_cost??((o.shipping_amount||0)+Math.ceil(insurance.premium));
   if(cost>cap)throw new AppError(409,`Ongkir dan asuransi Komship ${rupiah(cost)} melebihi batas biaya ${rupiah(cap)}. Perbarui batas biaya pesanan sebelum mencoba ulang.`);
   const payload=storePayload(o,config,destination,grams,tariff);
   await update(id,"state='booking_processing',environment=?,config_json=?,weight_grams=?,destination_json=?,request_json=?,insurance_state='requested',insured_value=?,insurance_fee=?,last_error=NULL",config.environment,await encrypt(JSON.stringify(config)),grams,JSON.stringify(destination),await encrypt(JSON.stringify(payload)),insurance.declaredValue,insurance.premium);
   // Persist BEFORE sending. A crash/time-out can never cause another blind create.
   await update(id,"create_sent_at=?",Date.now());
   try{const booked=await client.store(payload);await update(id,"provider_id=?,provider_no=?,state='booked'",booked.id,booked.no);}catch(e){if(e instanceof KomshipError&&e.rejected)await update(id,"create_sent_at=NULL,state='booking_failed'");else await update(id,"state='booking_unknown'");throw e;}
   s=await refresh(s);
  }
  if(!s.pickup_json){const schedule=pickupSchedule(config);await update(id,"pickup_json=?",JSON.stringify(schedule));s=await refresh(s);}
  let detail=await client.detail(s.provider_no!);
  if(!insuranceMatches(detail,insurance)){await update(id,"insurance_state='unverified'");throw new AppError(409,"Booking tersimpan, tetapi Komship belum mencatat premi dan harga barang yang sesuai. Pickup ditahan. Periksa asuransi pada booking yang sama di Komship, lalu coba ulang.");}
  await update(id,"insurance_state='verified',insured_value=?,insurance_fee=?",insurance.declaredValue,insurance.premium);s=await refresh(s);
  if(validAwb(detail.awb)){await update(id,"awb=?,state='awb_available'",detail.awb);s=await refresh(s);}
  if(s.pickup_state!=="scheduled"){
   if(s.pickup_state==="sending"||s.pickup_state==="unknown"){
    if(/pickup|dijemput|diproses|dikirim|diterima/i.test(String(detail.order_status))&&s.awb){await update(id,"pickup_state='scheduled'");}
    else throw new AppError(409,"Respons pickup belum pasti. Periksa status di Komship; gunakan tombol Periksa ulang tanpa membuat booking baru.");
   }else{
    const planned=JSON.parse(s.pickup_json!) as {date:string;time:string;vehicle:string};if(Date.parse(planned.date+"T"+planned.time+"+07:00")<=Date.now())throw new AppError(409,"Jadwal pickup telah lewat. Atur ulang jadwal pada pengaturan pesanan.");
    await update(id,"pickup_state='sending'");try{const awb=await client.pickup(s.provider_no!,planned);await update(id,"pickup_state='scheduled'");if(validAwb(awb))await update(id,"awb=?,state='awb_available'",awb);}catch(e){await update(id,"pickup_state=?",e instanceof KomshipError&&e.rejected?"failed":"unknown");throw e;}
   }
   s=await refresh(s);
  }
  if(!s.awb){detail=await client.detail(s.provider_no!);if(!validAwb(detail.awb))throw new AppError(409,"Booking tersimpan. Nomor resi belum tersedia; tekan Cek ulang resi & label nanti.");await update(id,"awb=?,state='awb_available'",detail.awb);s=await refresh(s);}
  if(!s.label_pdf){const bytes=await client.label(s.provider_no!,config.labelPage);const key="labels/"+id+"/official.pdf";await bucket().put(key,bytes,{httpMetadata:{contentType:"application/pdf"}});await update(id,"label_pdf=?",key);s=await refresh(s);}
  if(!s.label_png){const pdf=await bucket().get(s.label_pdf!);if(!pdf)throw new AppError(503,"PDF label belum tersedia. Coba lagi.");const {pdfToPng}=await import("./label-render");const bytes=await pdfToPng(new Uint8Array(await pdf.arrayBuffer()));const key="labels/"+id+"/official.png";await bucket().put(key,bytes,{httpMetadata:{contentType:"image/png"}});await update(id,"label_png=?",key);s=await refresh(s);}
  await sendLabels(o,s);await update(id,"last_error=NULL");return {ok:true,shipment:shipmentSummary(await shipment(id))};
 }catch(e){const message=e instanceof AppError?e.message:"Pemrosesan pengiriman terhenti. Tekan Coba ulang untuk melanjutkan booking yang sama.";s=await refresh(s);if(!s.provider_no&&!s.create_sent_at)await update(id,"state='booking_failed'");await update(id,"last_error=?",message);await shipmentNotice(id,`ELITE.VTG · ${id}\n${o.name}\n${s.awb?"Resi: "+s.awb+"\n":""}${message}`);return {ok:false,error:message,shipment:shipmentSummary(await shipment(id))};
 }finally{await update(id,"lease=0");}
}
export async function shipmentNotice(id:string,message:string){const s=await settings();if(!s?.bot_cipher||!s.chat_id)return;try{await telegram(await decrypt(s.bot_cipher),"sendMessage",{chat_id:s.chat_id,text:message,reply_markup:{inline_keyboard:[[{text:"Coba ulang / cek resi & label",callback_data:"retry:"+id}]]}});}catch{/* Durable last_error remains available in the owner dashboard. */}}
export async function sendLabels(o:Order,s:Shipment){const settingsNow=await settings();if(!settingsNow?.bot_cipher||settingsNow.chat_id!==o.delivery_chat)throw new AppError(409,"Penerima label Telegram belum sesuai pemilik pesanan.");const token=await decrypt(settingsNow.bot_cipher),chat=settingsNow.chat_id!;
 const rawPayload=s.request_json?JSON.parse(await decrypt(s.request_json)):null;
 const payload=s.provider==="kiriminaja"&&rawPayload?{shipping_cost:rawPayload.packages[0].shipping_cost,shipping_cashback:0,shipping_type:rawPayload.packages[0].service_type}:rawPayload as {shipping_cost:number;shipping_cashback:number;shipping_type?:string;insurance_value?:number}|null;
 const provider=s.provider==="kiriminaja"?"KiriminAja":"Komship";
 if(!s.summary_message){let trackingUrl="";try{trackingUrl=(await trackingAccess(o)).url;}catch{/* Label delivery remains available if a tracking link cannot be created. */}const result=await telegram(token,"sendMessage",{chat_id:chat,text:`${s.environment==="sandbox"?"SIMULASI SANDBOX · ":""}ELITE.VTG · RESI TERSEDIA\nInvoice: ${o.id}\nPembeli: ${o.name}\nJumlah barang: ${orderItems(o).length}\nResi ${jntServiceName(payload?.shipping_type||orderQuote(o)?.service||"EZ")}: ${s.awb}\nBooking ${provider}: ${s.provider_id||s.provider_no}\n${payload?"Ongkir "+provider+": "+rupiah(payload.shipping_cost-payload.shipping_cashback)+(s.provider==="kiriminaja"?"":" · Cashback tarif: "+rupiah(payload.shipping_cashback))+"\n":""}${s.insurance_state==="verified"?"Nilai barang untuk asuransi: "+rupiah(s.insured_value!)+" · Premi tercatat "+provider+": "+rupiah(s.insurance_fee!)+" (ditanggung toko)\n":""}Resi tersedia; paket belum dianggap sudah dikirim.`,reply_markup:{inline_keyboard:[[{text:"Buka label & cetak",url:env.SITE_ORIGIN+"/admin/order/print/"+o.id}],...(trackingUrl?[[{text:"Pelacakan untuk pembeli",url:trackingUrl}]]:[]),[{text:"Cek ulang / kirim label yang belum terkirim",callback_data:"retry:"+o.id}]]}});await update(o.id,"summary_message=?",String(result.message_id));}
 for(const format of ["pdf","png"] as const){if(format==="pdf"?s.pdf_message:s.png_message)continue;const file=await bucket().get(format==="pdf"?s.label_pdf!:s.label_png!);if(!file)throw new AppError(503,"Label belum tersedia.");const form=new FormData();form.set("chat_id",chat);form.set("caption",`${s.environment==="sandbox"?"SIMULASI SANDBOX · ":""}${o.name} · ${s.awb} · ${format==="pdf"?"PDF label resmi siap cetak":"PNG dari PDF label resmi"}`);form.set("document",new Blob([await file.arrayBuffer()],{type:format==="pdf"?"application/pdf":"image/png"}),`ELITE-${s.awb}.${format}`);const sent=await telegram(token,"sendDocument",form);await update(o.id,format==="pdf"?"pdf_message=?":"png_message=?",String(sent.message_id));}
}
export async function reconcileKomshipBooking(id:string,no:string){const s=await shipment(id),o=await order(id);if(!s||s.lease>Date.now()||s.provider_no||!s.create_sent_at||!s.request_json)throw new AppError(409,"Hanya booking dengan respons belum pasti yang bisa dihubungkan.");if(!/^[A-Za-z0-9_-]{5,90}$/.test(no))throw new AppError(400,"Nomor booking Komship belum valid.");const p=JSON.parse(await decrypt(s.request_json)),detail=await (await shippingClient(s.environment!)).detail(no);
 if(detail.order_no!==no||phone(String(detail.receiver_phone))!==phone(o.phone)||normalize(String(detail.receiver_name))!==normalize(o.name)||String(detail.shipper_destination_id)!==String(p.shipper_destination_id)||String(detail.receiver_destination_id)!==String(p.receiver_destination_id)||detail.payment_method!=="BANK TRANSFER"||detail.shipping!==p.shipping||detail.shipping_type!==p.shipping_type||Number(detail.grand_total)!==p.grand_total||normalize(String(detail.receiver_address))!==normalize(p.receiver_address)||detail.notes!==p.notes||!insuranceMatches(detail,requiredInsurance(o))||Number(p.insurance_value)!==requiredInsurance(o).premium)throw new AppError(409,"Booking Komship ini tidak cocok dengan data pesanan.");
 const used=await db().prepare("SELECT order_id FROM shipments WHERE provider_no=? AND order_id!=?").bind(no,id).first();if(used)throw new AppError(409,"Booking telah dipakai pesanan lain.");await update(id,"provider_no=?,state='booked',last_error=NULL",no);return shipmentSummary(await shipment(id));
}

export async function processShipment(id:string){await synchronizeCatalogStock(id);const s=await shipment(id);if(s?.provider==="komship"||(!s?.provider&&(s?.create_sent_at||s?.provider_no)))return processKomshipShipment(id);const {processKiriminShipment}=await import("./kirimin-fulfilment");return processKiriminShipment(id);}
export async function reconcileBooking(id:string,no:string){const s=await shipment(id);if(s?.provider==="komship"||(!s?.provider&&(s?.create_sent_at||s?.provider_no)))return reconcileKomshipBooking(id,no);const {reconcileKiriminBooking}=await import("./kirimin-fulfilment");return reconcileKiriminBooking(id,no);}
