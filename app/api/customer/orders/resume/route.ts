import {currentCustomer} from '@/modules/catalog/customers';
import {api,json,body,originCheck,rate,db,AppError,random,hash,publicOrder} from '@/modules/order/order-server';
import {orderSessionCookie} from '@/modules/order/first-purchase-server';
import {PAYMENT_SESSION_LIFETIME} from '@/modules/order/customer-orders';
import {catalogQuote} from '@/modules/order/catalog-bridge';
import type {Order} from '@/modules/order/order-types';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export const POST=(r:Request)=>api(async()=>{
 originCheck(r);
 const customer=await currentCustomer(r.headers.get('cookie'));
 if(!customer)throw new AppError(401,'Masuk ke akun pemilik pesanan untuk melanjutkan pembayaran.');
 await rate(r,'customer_order_resume',30);
 const value=await body(r);
 if(Object.keys(value).length!==1||typeof value.invoice!=='string'||!/^EV-\d{6}-[A-F0-9]{8}$/.test(value.invoice))throw new AppError(400,'Nomor invoice tidak valid.');
 const existing=await db().prepare("SELECT * FROM orders WHERE id=? AND customer_id=? AND COALESCE(order_type,'normal')='normal' AND status='awaiting_proof' AND proof_key IS NULL AND created_at>?").bind(value.invoice,customer.id,Date.now()-PAYMENT_SESSION_LIFETIME).first<Order>();
 if(!existing)throw new AppError(409,'Pembayaran ini tidak dapat dilanjutkan. Buka Pesanan saya untuk melihat status terbaru.');
 // Reuse the catalog's stock/price/expiry checks before showing payment again.
 if(existing.catalog_checkout_id){if(!existing.catalog_token)throw new AppError(409,'Pilihan barang perlu diperbarui. Pilih kembali di katalog.');await catalogQuote(existing.catalog_token);}
 const token=random();
 // Explicit member action restores only their existing unpaid invoice. Prices,
 // vouchers, stock and recipient data are untouched; guest orders stay unlinked.
 const order=await db().prepare(`UPDATE orders SET session_hash=? WHERE id=? AND customer_id=?
  AND COALESCE(order_type,'normal')='normal' AND status='awaiting_proof' AND proof_key IS NULL
  AND created_at>? RETURNING *`).bind(await hash(token),value.invoice,customer.id,Date.now()-PAYMENT_SESSION_LIFETIME).first<Order>();
 if(!order)throw new AppError(409,'Pembayaran ini tidak dapat dilanjutkan. Buka Pesanan saya untuk melihat status terbaru.');
 return json(publicOrder(order),200,{'Set-Cookie':orderSessionCookie(r,token)});
});
