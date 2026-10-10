import type {Transaction,InValue} from '@libsql/client';
import {db,AppError,random,hash,publicOrder,json} from './order-server';
import type {Order} from './order-types';
import {currentCustomer} from '@/modules/catalog/customers';
import {firstPurchaseDiscount,type PurchasePromotion} from './first-purchase';
import {orderingLocked,scheduleLabel} from '@/modules/catalog/product-schedule';
import type {CheckoutLine} from '@/modules/catalog/checkout';

// A write transaction serializes eligibility, the invoice, and its single-use claim.
async function expireUnpaidClaim(tx:Transaction,customerId:string) {
 await tx.execute({sql:"UPDATE orders SET status='expired',payment_state='expired' WHERE customer_id=? AND status='awaiting_proof' AND proof_key IS NULL AND created_at<? AND id IN (SELECT order_id FROM first_purchase_discounts WHERE redeemed_at IS NULL)",args:[customerId,Date.now()-7*86400000]});
 await tx.execute({sql:"DELETE FROM first_purchase_discounts WHERE customer_id=? AND redeemed_at IS NULL AND order_id IN (SELECT id FROM orders WHERE status IN ('expired','cancelled') AND proof_key IS NULL)",args:[customerId]});
}
async function promotion(tx:Transaction,customerId:string):Promise<PurchasePromotion> {
 const claim=(await tx.execute({sql:'SELECT order_id,redeemed_at FROM first_purchase_discounts WHERE customer_id=?',args:[customerId]})).rows[0];
 const confirmed=(await tx.execute({sql:"SELECT id FROM orders WHERE customer_id=? AND (confirmed_at IS NOT NULL OR payment_state='payment_confirmed') LIMIT 1",args:[customerId]})).rows[0];
 if(claim?.redeemed_at||confirmed)return {state:'redeemed',percent:5};
 return claim?{state:'reserved',percent:5,orderId:String(claim.order_id)}:{state:'available',percent:5};
}
export async function purchasePromotion(cookie:string|null):Promise<PurchasePromotion> {
 const customer=await currentCustomer(cookie);if(!customer)return {state:'guest',percent:5};
 const tx=await db().client.transaction('write');
 try{await expireUnpaidClaim(tx,customer.id);const result=await promotion(tx,customer.id);await tx.commit();return result;}finally{tx.close();}
}
export type DiscountPricing={customerId:string|null;subtotal:number;discount:number;net:number};
export async function persistPurchase(request:Request,existing:Order|null,orderId:string,subtotal:number,lines:CheckoutLine[]|undefined,statement:(pricing:DiscountPricing)=>{sql:string;args:InValue[]}) {
 const customer=await currentCustomer(request.headers.get('cookie'));
 if(existing?.discount_amount&&existing.customer_id!==customer?.id)throw new AppError(409,'Masuk kembali ke akun yang digunakan untuk invoice diskon ini sebelum mengubahnya.');
 const tx=await db().client.transaction('write');
 try{
  // Recheck stock, price and release time under the same lock as invoice creation.
  for(const line of lines??[]){
   const row=(await tx.execute({sql:'SELECT p.status,p.orderable_at,p.price,g.price AS group_price,g.qty FROM products p JOIN size_groups g ON g.product_id=p.id WHERE p.id=? AND g.id=?',args:[line.productId,line.groupId]})).rows[0];
   if(!row||row.status!=='published'||Number(row.qty)<line.quantity||Number(row.group_price??row.price)!==line.unitPrice)throw new AppError(409,'Stok atau harga berubah. Pilih kembali di katalog.');
   if(orderingLocked({orderableAt:row.orderable_at as string|null}))throw new AppError(409,'Pemesanan dibuka '+scheduleLabel(String(row.orderable_at))+'.');
  }
  let discount=0;
  if(customer){
   await expireUnpaidClaim(tx,customer.id);
   const state=await promotion(tx,customer.id);
   if(state.state==='reserved'&&state.orderId!==orderId)throw new AppError(409,'Diskon 5% sudah ada pada invoice yang belum selesai. Klik “Lanjutkan pesanan diskon”, atau batalkan invoice itu jika belum dibayar.');
   if(state.state==='available'||(state.state==='reserved'&&state.orderId===orderId)||existing?.discount_amount)discount=firstPurchaseDiscount(subtotal);
  }
  const pricing={customerId:customer?.id??null,subtotal,discount,net:subtotal-discount};
  const saved=await tx.execute(statement(pricing));
  if(saved.rowsAffected!==1)throw new AppError(409,'Pesanan berubah dari tab lain. Muat ulang halaman sebelum melanjutkan.');
  if(discount)await tx.execute({sql:'INSERT INTO first_purchase_discounts(customer_id,order_id) VALUES(?,?) ON CONFLICT(customer_id) DO NOTHING',args:[customer!.id,orderId]});
  await tx.commit();return pricing;
 }catch(error){await tx.rollback();throw error;}finally{tx.close();}
}
export async function abandonPurchase(order:Order) {
 await db().batch([
  db().prepare("UPDATE orders SET status='cancelled',payment_state='cancelled' WHERE id=? AND session_hash=? AND status='awaiting_proof' AND proof_key IS NULL").bind(order.id,order.session_hash),
  db().prepare("DELETE FROM first_purchase_discounts WHERE order_id=? AND redeemed_at IS NULL AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='cancelled' AND proof_key IS NULL)").bind(order.id,order.id),
 ]);
}
export async function resumeFirstPurchase(request:Request) {
 const customer=await currentCustomer(request.headers.get('cookie'));if(!customer)throw new AppError(401,'Masuk ke akun pelanggan terlebih dahulu.');
 const token=random(),sessionHash=await hash(token),state=await purchasePromotion(request.headers.get('cookie'));
 if(state.state!=='reserved')throw new AppError(404,'Tidak ada invoice diskon yang menunggu diselesaikan.');
 const order=await db().prepare("UPDATE orders SET session_hash=? WHERE id=? AND customer_id=? AND status IN ('awaiting_proof','submitted') AND EXISTS (SELECT 1 FROM first_purchase_discounts WHERE customer_id=? AND order_id=orders.id AND redeemed_at IS NULL) RETURNING *").bind(sessionHash,state.orderId,customer.id,customer.id).first<Order>();
 if(!order)throw new AppError(409,'Invoice berubah. Muat ulang halaman.');
 return json(publicOrder(order),200,{'Set-Cookie':orderSessionCookie(request,token)});
}
export function orderSessionCookie(request:Request,token:string) {
 return `elite_order=${token}; Path=/; HttpOnly; ${new URL(request.url).protocol==='https:'?'Secure; ':''}SameSite=Strict; Max-Age=604800`;
}
