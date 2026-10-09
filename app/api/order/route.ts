import { api,json,body,validateOrder,originCheck,settings,ready,AppError,rate,db,random,hash,myOrder,publicOrder,session } from "@/modules/order/order-server";
import { catalogQuote,catalogItems } from "@/modules/order/catalog-bridge";
import { loadQuote } from "@/modules/order/checkout-shipping";
import { orderShippingGrams } from "@/modules/order/order-items";
import { paymentConfig,paymentAvailable } from "@/modules/order/payment-config";
import { isPaymentMethod,storedPaymentMethod } from "@/modules/order/payment-types";
export const GET=(r:Request)=>api(async()=>json(publicOrder(await myOrder(r))));
export const POST=(r:Request)=>api(async()=>{
 originCheck(r);await rate(r,"order",12);const raw=await body(r);if(Object.keys(raw).some(k=>!allowedOrderFields.has(k)))throw new AppError(400,"Formulir memuat nilai yang tidak boleh diubah. Muat ulang halaman.");const linked=raw.catalogToken?await catalogQuote(raw.catalogToken):null;const v=validateOrder(linked?{...raw,...catalogItems(linked)}:raw),quote=await loadQuote(raw.quoteId,v.postcode);
 if(quote.grams!==orderShippingGrams(v.quantity))throw new AppError(409,"Jumlah barang berubah. Perbarui ongkir sesuai berat paket sebelum melanjutkan.");
 if(linked){const used=await db().prepare("SELECT session_hash FROM orders WHERE catalog_checkout_id=?").bind(linked.id).first<{session_hash:string}>();if(used&&(!session(r)||used.session_hash!==await hash(session(r)!)))throw new AppError(409,"Pilihan barang ini sudah digunakan pesanan lain. Buat pilihan baru di katalog.");}
 const total=v.itemAmount+quote.amount;if(total>10000000)throw new AppError(400,"Total pembayaran maksimal Rp10.000.000.");
 const payment=await paymentConfig();if(!await ready(await settings(),payment))throw new AppError(409,"Pembayaran belum tersedia. Hubungi ELITE.VTG.");
 const values={name:v.name,phone:v.phone,address:v.address,postcode:v.postcode,item:v.item,quantity:v.quantity,items:v.items,item_amount:v.itemAmount,shipping_amount:quote.amount,total,quote,catalog_checkout_id:linked?.id||null,catalog_token:linked?String(raw.catalogToken):null,stock_sync_state:linked?"pending":"unlinked"};
 try{const existing=await myOrder(r);if(existing.status==="awaiting_proof"){
 const updated=await db().prepare("UPDATE orders SET name=?,phone=?,address=?,postcode=?,item=?,quantity=?,items_json=?,total=?,item_amount=?,shipping_amount=?,shipping_json=?,catalog_checkout_id=?,catalog_token=?,catalog_items_json=?,stock_sync_state=?,stock_sync_error=NULL WHERE id=? AND status='awaiting_proof' AND proof_key IS NULL RETURNING id").bind(v.name,v.phone,v.address,v.postcode,v.item,v.quantity,JSON.stringify(v.items),total,v.itemAmount,quote.amount,JSON.stringify(quote),linked?.id||null,linked?String(raw.catalogToken):null,linked?JSON.stringify(linked.lines):null,linked?"pending":"unlinked",existing.id).first();
 if(!updated)throw new AppError(409,"Bukti sudah dikirim dari tab lain. Muat ulang halaman.");return json({...publicOrder(existing),...values});
 }if(session(r))throw new AppError(409,"Pesanan sebelumnya telah dikirim. Kembali ke katalog untuk memilih barang berikutnya.");}catch(e){if(!(e instanceof AppError)||e.status!==404)throw e;}
 const token=random(),now=Date.now(),id="EV-"+new Date(now).toISOString().slice(2,10).replaceAll("-","")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
 await db().prepare("INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,quantity,items_json,total,item_amount,shipping_amount,shipping_json,catalog_checkout_id,catalog_token,catalog_items_json,stock_sync_state,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,await hash(token),now,v.name,v.phone,v.address,v.postcode,v.item,v.quantity,JSON.stringify(v.items),total,v.itemAmount,quote.amount,JSON.stringify(quote),linked?.id||null,linked?String(raw.catalogToken):null,linked?JSON.stringify(linked.lines):null,linked?"pending":"unlinked",payment.defaultMethod).run();
 return json({id,created_at:now,...values,payment_method:payment.defaultMethod,payment_state:"awaiting_proof",status:"awaiting_proof",notify_status:"pending"},201,{"Set-Cookie":`elite_order=${token}; Path=/; HttpOnly; ${new URL(r.url).protocol==="https:"?"Secure; ":""}SameSite=Strict; Max-Age=604800`});
});
export const DELETE=(r:Request)=>api(async()=>{originCheck(r);return json({ok:true},200,{"Set-Cookie":"elite_order=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"});});

const allowedOrderFields=new Set(["name","phone","address","postcode","item","items","quantity","itemAmount","quoteId","consent","catalogToken","grams"]);
export const PATCH=(r:Request)=>api(async()=>{
 originCheck(r);const o=await myOrder(r),raw=await body(r);
 if(Object.keys(raw).length!==1||!isPaymentMethod(raw.paymentMethod))throw new AppError(400,"Pilih metode pembayaran yang tersedia. Nominal dan tujuan pembayaran tidak boleh diubah.");
 const method=raw.paymentMethod;
 if(o.status!=="awaiting_proof"||o.proof_key)throw new AppError(409,"Metode pembayaran tidak dapat diganti setelah bukti dikirim.");
 if(!paymentAvailable(await paymentConfig(),method))throw new AppError(409,"Metode pembayaran ini sedang tidak tersedia. Hubungi ELITE.VTG.");
 const changed=await db().prepare("UPDATE orders SET payment_method=? WHERE id=? AND session_hash=? AND status='awaiting_proof' AND proof_key IS NULL AND payment_method=? RETURNING *").bind(method,o.id,o.session_hash,storedPaymentMethod(o.payment_method)).first<import("@/modules/order/order-types").Order>();
 if(!changed)throw new AppError(409,"Pesanan berubah dari tab lain. Muat ulang halaman sebelum membayar.");
 return json(publicOrder(changed));
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
