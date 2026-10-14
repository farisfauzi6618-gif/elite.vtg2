import {db,AppError} from './order-server';
import {synchronizeCatalogStock} from './catalog-bridge';
import {progressStatus,orderProgress} from './order-progress';
import type {Order} from './order-types';
export async function updateManualProgress(id:string,input:Record<string,unknown>,actor:string){
 if(!/^EV-\d{6}-[A-F0-9]{8}$/.test(id)||Object.keys(input).some(k=>!['action','revision','courier','trackingNumber'].includes(k))||!['confirm','prepare','ship'].includes(String(input.action))||!Number.isSafeInteger(input.revision)||Number(input.revision)<0)throw new AppError(400,'Perubahan status tidak valid.');
 const o=await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>();if(!o?.proof_key||o.status!=='submitted')throw new AppError(409,'Bukti pembayaran pesanan belum tersedia.');
 const stage=progressStatus(o),revision=o.post_purchase_revision??0,action=input.action;
 if(revision!==input.revision)throw new AppError(409,'Pesanan berubah. Perbarui halaman sebelum menyimpan.');
 const now=Date.now();
 if(action==='confirm'){if(o.order_type==='reserve'&&o.reservation_status!=='PAID')throw new AppError(409,'Konfirmasi setiap pembayaran melalui panel Reserve terlebih dahulu.');
  if(stage!=='PAYMENT_RECEIVED')return orderProgress(o);
  const result=await db().batch([
   db().prepare("UPDATE orders SET payment_state='payment_confirmed',confirmed_at=COALESCE(confirmed_at,?),confirmed_by=COALESCE(confirmed_by,?),post_purchase_revision=post_purchase_revision+1,post_purchase_updated_by=? WHERE id=? AND proof_key IS NOT NULL AND status='submitted' AND payment_state!='payment_confirmed' AND post_purchase_revision=?").bind(now,actor,actor,id,revision),
   db().prepare("UPDATE first_purchase_discounts SET redeemed_at=COALESCE(redeemed_at,?) WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_state='payment_confirmed' AND post_purchase_revision=?)").bind(now,id,id,revision+1),
   db().prepare("INSERT INTO shipments(order_id,updated_at) SELECT id,? FROM orders WHERE id=? AND payment_state='payment_confirmed' AND post_purchase_revision=? ON CONFLICT(order_id) DO NOTHING").bind(now,id,revision+1),
  ]);if(!result[0].meta.changes)throw new AppError(409,'Pesanan berubah. Perbarui halaman.');
  await synchronizeCatalogStock(id);
 }else{
  if(o.payment_state!=='payment_confirmed')throw new AppError(409,'Konfirmasi pembayaran dahulu.');
  if(o.catalog_checkout_id&&o.stock_sync_state!=='applied')throw new AppError(409,'Sinkronkan stok pesanan dahulu.');
  if(action==='prepare'){
   if(stage==='PREPARING')return orderProgress(o);if(stage!=='PAYMENT_CONFIRMED')throw new AppError(409,'Status pesanan tidak dapat dimundurkan.');
   const result=await db().prepare("UPDATE orders SET preparing_at=?,post_purchase_revision=post_purchase_revision+1,post_purchase_updated_by=? WHERE id=? AND payment_state='payment_confirmed' AND preparing_at IS NULL AND shipped_at IS NULL AND post_purchase_revision=? RETURNING id").bind(now,actor,id,revision).first();if(!result)throw new AppError(409,'Pesanan berubah. Perbarui halaman.');
  }else{
   const courier=typeof input.courier==='string'?input.courier.trim():'',number=typeof input.trackingNumber==='string'?input.trackingNumber.trim():'';
   if(!courier||courier.length>100||/[\x00-\x1f\x7f<>]/.test(courier)||! /^[A-Za-z0-9][A-Za-z0-9_-]{5,69}$/.test(number))throw new AppError(400,'Isi kurir dan nomor resi yang valid.');
   if(stage!=='PREPARING'&&stage!=='SHIPPED')throw new AppError(409,'Tandai Preparing order dahulu.');
   const result=await db().prepare("UPDATE orders SET courier_name=?,tracking_number=?,shipped_at=COALESCE(shipped_at,?),post_purchase_revision=post_purchase_revision+1,post_purchase_updated_by=? WHERE id=? AND payment_state='payment_confirmed' AND preparing_at IS NOT NULL AND post_purchase_revision=? RETURNING id").bind(courier,number,now,actor,id,revision).first();if(!result)throw new AppError(409,'Pesanan berubah. Perbarui halaman.');
  }
 }
 return orderProgress((await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>())!);
}
