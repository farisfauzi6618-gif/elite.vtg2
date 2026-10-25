import {currentCustomer} from '@/modules/catalog/customers';
import {api,json,body,originCheck,rate,db,AppError,publicOrder} from '@/modules/order/order-server';
import {restorePaymentSession} from '@/modules/order/payment-recovery';
import {PAYMENT_SESSION_LIFETIME} from '@/modules/order/customer-orders';
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
 const {order,cookie}=await restorePaymentSession(r,existing);
 return json(publicOrder(order),200,{'Set-Cookie':cookie});
});
