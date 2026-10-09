import { db,settings,encrypt,decrypt,AppError,bucket } from "@/modules/order/order-server";
import { orderQuote,rupiah,type Order } from "@/modules/order/order-types";
import { kiriminClient,kiriminPin,kiriminSettings,validCoordinatePair } from "@/modules/order/shipping-settings";
import { pickupSchedule,normalize } from "@/modules/order/komship";
import { KiriminError,KiriminPinError,record,validKiriminOrigin,selectedKiriminRate,type KiriminLocation,type KiriminRate } from "@/modules/order/kiriminaja";
import { shipment,shipmentSummary,shipmentNotice,sendLabels } from "@/modules/order/fulfilment";
import type { Shipment,ShippingConfig } from "@/modules/order/fulfilment-types";
import { orderItems } from "@/modules/order/order-items";

const phone=(v:unknown)=>String(v||"").replace(/[\s()+-]/g,"").replace(/^0/,"62");
const validAwb=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{6,70}$/.test(v);
async function update(id:string,sql:string,...values:unknown[]){await db().prepare("UPDATE shipments SET "+sql+",updated_at=? WHERE order_id=?").bind(...values,Date.now(),id).run();}
async function loadOrder(id:string){const o=await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Order>();if(!o)throw new AppError(404,"Pesanan tidak ditemukan.");return o;}

export function kiriminPayload(o:Order,c:ShippingConfig,d:KiriminLocation,grams:number,r:KiriminRate,schedule:{date:string;time:string}){
 if(!validKiriminOrigin(c.origin)||!o.item_amount||!Number.isSafeInteger(o.item_amount)||o.item_amount<=0||r.insurance<=0||r.insurancePercent<=0)throw new AppError(409,"Asuransi wajib belum tersedia untuk nilai barang yang sebenarnya. Booking ditahan; periksa layanan ini dengan KiriminAja.");
 if(r.useGeolocation&&(!validCoordinatePair(c.senderLatitude,c.senderLongitude)||!validCoordinatePair(d.latitude,d.longitude)))throw new AppError(409,"Layanan ini mewajibkan titik lokasi. Lengkapi koordinat pengirim dan penerima pada pengaturan pesanan.");
 const address=o.address+", "+d.label,items=orderItems(o),itemName=items.join("; ");
 if(o.name.length>40||address.length>250)throw new AppError(409,"Nama atau alamat melebihi batas KiriminAja (40/250 karakter). Periksa data pesanan sebelum booking; aplikasi tidak memotong alamat.");
 const dimensions={length:Math.ceil(c.length),width:Math.ceil(c.width),height:Math.ceil(c.height)},name=itemName.length<=60?itemName:`Paket ${items.length} pakaian ELITE.VTG`;
 // Zero means unavailable, never an invented map coordinate. Geolocation-required
 // services are blocked above. Validate this sentinel during account UAT.
 return {address:c.senderAddress+", "+c.senderPostcode,phone:phone(c.senderPhone),name:c.senderName,zipcode:c.senderPostcode,kecamatan_id:c.origin.districtId,kelurahan_id:c.origin.id,latitude:c.senderLatitude??0,longitude:c.senderLongitude??0,platform_name:"ELITE.VTG",schedule:schedule.date+" "+schedule.time,packages:[{order_id:o.id,destination_name:o.name,destination_phone:phone(o.phone),destination_address:address,destination_kecamatan_id:d.districtId,destination_kelurahan_id:d.id,destination_zipcode:o.postcode,destination_latitude:d.latitude??0,destination_longitude:d.longitude??0,weight:grams,...dimensions,qty:1,item_value:o.item_amount,shipping_cost:r.gross,service:"jnt",service_type:r.service,insurance_amount:r.insurance,cod:0,package_type_id:7,item_name:name,drop:false,note:`Invoice ${o.id}; ${items.length} barang: ${itemName}`,items:[{name,price:o.item_amount,weight:grams,...dimensions,qty:1,metadata:{sku:o.id,variant_label:itemName}}]}]};
}

export function matchesKiriminBooking(value:unknown,o:Order,p:Record<string,unknown>,expectedPremium:number){
 const data=record(value),d=record(data.details),recipient=record(d.destination),origin=record(d.origin),costs=record(d.costs),pack=record((p.packages as unknown[])?.[0]);
 return d.order_id===o.id&&String(d.service).toLowerCase()==="jnt"&&String(d.service_name).toUpperCase()===String(pack.service_type).toUpperCase()&&phone(recipient.phone)===phone(o.phone)&&normalize(String(recipient.name||""))===normalize(o.name)&&String(recipient.zip_code)===o.postcode&&normalize(String(recipient.address||""))===normalize(String(pack.destination_address))&&phone(origin.phone)===phone(p.phone)&&normalize(String(origin.name||""))===normalize(String(p.name))&&normalize(String(origin.address||""))===normalize(String(p.address))&&Number(costs.cod)===0&&Number(costs.insurance_amount)===expectedPremium&&Number(costs.insurance_percent)>0;
}

export async function processKiriminShipment(id:string,allowCreate=true){
 const o=await loadOrder(id),current=await kiriminSettings(),owner=current.settings;
 if(o.payment_state!=="payment_confirmed"||!o.proof_key)throw new AppError(409,"Konfirmasi pembayaran melalui Telegram dahulu.");
 if(!owner?.chat_id||owner.chat_id!==o.confirmed_by||owner.chat_id!==o.delivery_chat)throw new AppError(409,"Akun Telegram penerima berubah. Periksa pemilik pesanan ini.");
 const now=Date.now(),locked=await db().prepare("UPDATE shipments SET lease=?,updated_at=? WHERE order_id=? AND lease<? RETURNING *").bind(now+240000,now,id,now).first<Shipment>();if(!locked)return {busy:true,shipment:shipmentSummary(await shipment(id))};
 let s=locked;
 try{
  const c=s.config_json?JSON.parse(await decrypt(s.config_json)) as ShippingConfig:current.config;
  if(!s.provider_no&&!s.create_sent_at&&(!allowCreate||!current.config.enabled||!owner.kirimin_cipher||!owner.kirimin_pin_cipher))throw new AppError(409,"Booking KiriminAja belum aktif. Lengkapi API key, PIN KA Credit, wilayah asal, ukuran, dan pickup pada pengaturan pemilik.");
  const client=await kiriminClient(s.environment||c.environment);
  // An uncertain submission is reconciled by a read-only merchant-ID lookup.
  // A provider timeout, unknown shape, or duplicate-ID error never triggers a new create.
  if(s.create_sent_at&&!s.provider_no){await reconcileKiriminBooking(id,o.id,true);s=(await shipment(id))!;}
  if(!s.provider_no){
   if(!allowCreate)throw new AppError(409,"Callback hanya dapat melanjutkan booking yang sudah diajukan pemilik.");
   if(!validKiriminOrigin(c.origin)||![c.length,c.width,c.height].every(n=>n>=1))throw new AppError(409,"Lengkapi wilayah asal dan ukuran paket KiriminAja.");
   const q=orderQuote(o);if(!q||!o.item_amount)throw new AppError(409,"Pesanan ini belum memiliki wilayah dan berat yang terverifikasi.");
   const grams=s.weight_grams||q.grams||c.defaultGrams;if(!Number.isSafeInteger(grams)||grams<100||grams>30000)throw new AppError(409,"Berat paket belum valid.");
   const d=s.destination_json?JSON.parse(s.destination_json) as KiriminLocation:await client.destination(q.destination);
   const match=(await client.search(o.postcode,true)).find(x=>x.id===d.id&&x.districtId===d.districtId);
   if(!match||match.postcode!==o.postcode||normalize(match.district)!==normalize(q.destination.district)||normalize(match.city)!==normalize(q.destination.city)||normalize(match.village)!==normalize(q.destination.village))throw new AppError(409,"Wilayah KiriminAja tidak sesuai alamat invoice.");
   const destination={...match,latitude:d.latitude,longitude:d.longitude},r=selectedKiriminRate(await client.rates(c.origin,destination,grams,o.item_amount,true,c),q.service),cap=s.max_cost??((o.shipping_amount||0)+r.insurance);
   // Enforce the cap before discounts: eligibility/settlement may change at the provider.
   if(r.gross+r.insurance>cap)throw new AppError(409,`Ongkir dan asuransi KiriminAja ${rupiah(r.gross+r.insurance)} melebihi batas biaya ${rupiah(cap)}. Perbarui batas pesanan sebelum mencoba ulang.`);
   const planned=pickupSchedule(c),payload=kiriminPayload(o,c,destination,grams,r,planned),pin=await kiriminPin();
   await client.validatePin(pin);if(await client.balance()<r.gross+r.insurance)throw new AppError(409,"Saldo KA Credit belum cukup untuk ongkir dan asuransi. Isi saldo pada dashboard KiriminAja lalu coba ulang.");
   await update(id,"provider='kiriminaja',state='booking_processing',environment=?,config_json=?,weight_grams=?,destination_json=?,request_json=?,pickup_json=?,insurance_state='requested',insured_value=?,insurance_fee=?,last_error=NULL",c.environment,await encrypt(JSON.stringify(c)),grams,JSON.stringify(destination),await encrypt(JSON.stringify(payload)),JSON.stringify(planned),o.item_amount,r.insurance);
   await update(id,"create_sent_at=?",Date.now());
   try{
    const result=await client.create(payload,pin);
    // v6.2 has no stable published success shape. status=true establishes acceptance;
    // store the merchant ID and confirm all details using the documented tracking API.
    await update(id,"provider_no=?,provider_id=?,state='booked',pickup_state='scheduled'",o.id,typeof result.pickup_number==="string"?result.pickup_number:null);
   }catch(e){if(e instanceof KiriminError&&e.rejected)await update(id,"create_sent_at=NULL,state='booking_failed'");else await update(id,"state='booking_unknown'");throw e;}
   s=(await shipment(id))!;
  }
  const payload=JSON.parse(await decrypt(s.request_json!)) as Record<string,unknown>,detail=await client.detail(s.provider_no!);
  if(!matchesKiriminBooking(detail,o,payload,s.insurance_fee!)){await update(id,"insurance_state='unverified'");throw new AppError(409,"Booking sudah tersimpan. Data penerima atau premi asuransi belum terverifikasi KiriminAja; periksa booking yang sama lalu coba ulang.");}
  await update(id,"insurance_state='verified'");const awb=record(detail.details).awb;
  if(!validAwb(awb))throw new AppError(409,"Booking tersimpan. Nomor resi belum tersedia; tekan Cek ulang resi & label nanti.");
  if(s.awb&&s.awb!==awb)throw new AppError(409,"Nomor resi pada penyedia berubah. Periksa booking ini sebelum memakai atau mengirim label lama.");
  await update(id,"awb=?,state='awb_available'",awb);s=(await shipment(id))!;
  if(!s.label_pdf){const bytes=await client.label(awb),key="labels/"+id+"/official.pdf";await bucket().put(key,bytes,{httpMetadata:{contentType:"application/pdf"}});await update(id,"label_pdf=?",key);s=(await shipment(id))!;}
  if(!s.label_png){const pdf=await bucket().get(s.label_pdf!);if(!pdf)throw new AppError(503,"PDF label belum tersedia.");const {pdfToPng}=await import("./label-render"),bytes=await pdfToPng(new Uint8Array(await pdf.arrayBuffer())),key="labels/"+id+"/official.png";await bucket().put(key,bytes,{httpMetadata:{contentType:"image/png"}});await update(id,"label_png=?",key);s=(await shipment(id))!;}
  await sendLabels(o,s);await update(id,"last_error=NULL");return {ok:true,shipment:shipmentSummary(await shipment(id))};
 }catch(e){
  if(e instanceof KiriminPinError)await db().prepare("UPDATE settings SET kirimin_pin_cipher=NULL WHERE id=1").run();
  s=(await shipment(id))!;const message=e instanceof AppError?e.message:"Pemrosesan KiriminAja terhenti. Coba ulang untuk melanjutkan booking yang sama.";
  if(!s.provider_no&&!s.create_sent_at)await update(id,"state='booking_failed'");await update(id,"last_error=?",message);await shipmentNotice(id,`ELITE.VTG · ${id}\n${o.name}\n${s.awb?"Resi: "+s.awb+"\n":""}${message}`);return {ok:false,error:message,shipment:shipmentSummary(await shipment(id))};
 }finally{await update(id,"lease=0");}
}

export async function reconcileKiriminBooking(id:string,no:string,withinLease=false){
 const s=await shipment(id),o=await loadOrder(id);if(!s||(!withinLease&&s.lease>Date.now())||s.provider_no||!s.create_sent_at||!s.request_json||no!==o.id)throw new AppError(409,"Gunakan nomor invoice ini untuk memeriksa booking KiriminAja yang responsnya belum pasti.");
 const p=JSON.parse(await decrypt(s.request_json)),detail=await (await kiriminClient(s.environment!)).detail(o.id);
 if(!matchesKiriminBooking(detail,o,p,s.insurance_fee!))throw new AppError(409,"Booking KiriminAja belum dapat dicocokkan. Booking baru tetap ditahan; periksa dashboard atau hubungi KiriminAja dengan nomor invoice ini.");
 await update(id,"provider='kiriminaja',provider_no=?,state='booked',pickup_state='scheduled',last_error=NULL",o.id);return shipmentSummary(await shipment(id));
}
