import {attachOrder,observe} from '@/modules/analytics/server';
import {watch} from '@/modules/analytics/errors';
import { api,json,body,validateOrder,originCheck,settings,ready,AppError,rate,db,random,hash,myOrder,publicOrder,session } from "@/modules/order/order-server";
import { catalogQuote,catalogItems } from "@/modules/order/catalog-bridge";
import { loadQuote } from "@/modules/order/checkout-shipping";
import { orderShippingGrams } from "@/modules/order/order-items";
import { paymentConfig,paymentAvailable } from "@/modules/order/payment-config";
import { isPaymentMethod,storedPaymentMethod } from "@/modules/order/payment-types";
import {persistPurchase,abandonPurchase,orderSessionCookie} from '@/modules/order/first-purchase-server';
export const GET=(r:Request)=>api(async()=>json(publicOrder(await myOrder(r))));
export const POST=(r:Request)=>watch(r,'checkout_error',()=>api(async()=>{
 originCheck(r);await rate(r,"order",12);const raw=await body(r);if(Object.keys(raw).some(k=>!allowedOrderFields.has(k)))throw new AppError(400,"Formulir memuat nilai yang tidak boleh diubah. Muat ulang halaman.");const linked=raw.catalogToken?await catalogQuote(raw.catalogToken):null;const v=validateOrder(linked?{...raw,...catalogItems(linked)}:raw),quote=await loadQuote(raw.quoteId,v.postcode);
 if(quote.grams!==orderShippingGrams(v.quantity))throw new AppError(409,"Jumlah barang berubah. Perbarui ongkir sesuai berat paket sebelum melanjutkan.");
 if(linked){const used=await db().prepare("SELECT session_hash FROM orders WHERE catalog_checkout_id=?").bind(linked.id).first<{session_hash:string}>();if(used&&(!session(r)||used.session_hash!==await hash(session(r)!)))throw new AppError(409,"Pilihan barang ini sudah digunakan pesanan lain. Buat pilihan baru di katalog.");}
 const total=v.itemAmount+quote.amount;if(total>10000000)throw new AppError(400,"Total pembayaran maksimal Rp10.000.000.");
 const payment=await paymentConfig();if(!await ready(await settings(),payment))throw new AppError(409,"Pembayaran belum tersedia. Hubungi ELITE.VTG.");
 const values={name:v.name,phone:v.phone,address:v.address,postcode:v.postcode,item:v.item,quantity:v.quantity,items:v.items,shipping_amount:quote.amount,quote,catalog_checkout_id:linked?.id||null,catalog_token:linked?String(raw.catalogToken):null,stock_sync_state:linked?"pending":"unlinked"};
 try{const existing=await myOrder(r);if(existing.status==="awaiting_proof"){
 const pricing=await persistPurchase(r,existing,existing.id,v.itemAmount,linked?.lines,p=>({sql:"UPDATE orders SET name=?,phone=?,address=?,postcode=?,item=?,quantity=?,items_json=?,total=?,item_amount=?,shipping_amount=?,shipping_json=?,catalog_checkout_id=?,catalog_token=?,catalog_items_json=?,stock_sync_state=?,stock_sync_error=NULL,customer_id=?,item_subtotal=?,discount_amount=?,discount_voucher_id=?,discount_label=? WHERE id=? AND session_hash=? AND status='awaiting_proof' AND proof_key IS NULL",args:[v.name,v.phone,v.address,v.postcode,v.item,v.quantity,JSON.stringify(v.items),p.net+quote.amount,p.net,quote.amount,JSON.stringify(quote),linked?.id||null,linked?String(raw.catalogToken):null,linked?JSON.stringify(linked.lines):null,linked?"pending":"unlinked",p.customerId,p.subtotal,p.discount,p.voucherId,p.voucherLabel,existing.id,existing.session_hash!]}),raw.rewardChoice);
 await observe(()=>attachOrder(r,existing.id));
 return json({...publicOrder(existing),...values,item_amount:pricing.net,item_subtotal:pricing.subtotal,discount_amount:pricing.discount,discount_voucher_id:pricing.voucherId,discount_label:pricing.voucherLabel,total:pricing.net+quote.amount});
 }if(session(r))throw new AppError(409,"Pesanan sebelumnya telah dikirim. Kembali ke katalog untuk memilih barang berikutnya.");}catch(e){if(!(e instanceof AppError)||e.status!==404)throw e;}
 const token=random(),now=Date.now(),id="EV-"+new Date(now).toISOString().slice(2,10).replaceAll("-","")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
 const sessionHash=await hash(token);
 const pricing=await persistPurchase(r,null,id,v.itemAmount,linked?.lines,p=>({sql:"INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,quantity,items_json,total,item_amount,shipping_amount,shipping_json,catalog_checkout_id,catalog_token,catalog_items_json,stock_sync_state,payment_method,customer_id,item_subtotal,discount_amount,discount_voucher_id,discount_label) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",args:[id,sessionHash,now,v.name,v.phone,v.address,v.postcode,v.item,v.quantity,JSON.stringify(v.items),p.net+quote.amount,p.net,quote.amount,JSON.stringify(quote),linked?.id||null,linked?String(raw.catalogToken):null,linked?JSON.stringify(linked.lines):null,linked?"pending":"unlinked",payment.defaultMethod,p.customerId,p.subtotal,p.discount,p.voucherId,p.voucherLabel]}),raw.rewardChoice);
 await observe(()=>attachOrder(r,id));
 return json({id,created_at:now,...values,item_amount:pricing.net,item_subtotal:pricing.subtotal,discount_amount:pricing.discount,discount_voucher_id:pricing.voucherId,discount_label:pricing.voucherLabel,total:pricing.net+quote.amount,payment_method:payment.defaultMethod,payment_state:"awaiting_proof",status:"awaiting_proof",notify_status:"pending"},201,{"Set-Cookie":orderSessionCookie(r,token)});
}));
export const DELETE=(r:Request)=>api(async()=>{originCheck(r);try{await abandonPurchase(await myOrder(r));}catch(e){if(!(e instanceof AppError)||e.status!==404)throw e;}return json({ok:true},200,{"Set-Cookie":"elite_order=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"});});

const allowedOrderFields=new Set(["name","phone","address","postcode","item","items","quantity","itemAmount","quoteId","consent","catalogToken","grams","rewardChoice"]);
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
