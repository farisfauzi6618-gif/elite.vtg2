import {createHmac} from 'node:crypto';
import {env} from '@/lib/env';
import {currentCustomer} from '@/modules/catalog/customers';
import {AppError,db,hash,json,publicOrder,session} from './order-server';
import {orderSessionCookie} from './first-purchase-server';
import {PAYMENT_SESSION_LIFETIME} from './customer-orders';
import type {Order} from './order-types';
export type Submission={hash:string;fingerprint:string;token:string};
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value}
export async function submissionAttempt(request:Request,raw:Record<string,unknown>):Promise<Submission|null>{
 const key=request.headers.get('idempotency-key');if(!key||Object.hasOwn(raw,'depositAmount'))return null;
 if(!/^[a-f0-9]{64}$/.test(key))throw new AppError(400,'Permintaan checkout tidak valid. Muat ulang halaman.');
 if(!env.CONFIG_SECRET)throw new AppError(503,'Pesanan belum dapat disimpan. Coba lagi.');
 return {hash:await hash('checkout:'+key),fingerprint:await hash(JSON.stringify(canonical(raw))),token:createHmac('sha256',env.CONFIG_SECRET).update('checkout-session:'+key).digest('hex')};
}
async function saved(request:Request,attempt:Submission){
 const order=await db().prepare('SELECT * FROM orders WHERE checkout_request_hash=?').bind(attempt.hash).first<Order&{checkout_request_fingerprint:string}>();if(!order)return null;
 if(order.checkout_request_fingerprint!==attempt.fingerprint)throw new AppError(409,'Pesanan ini sudah tersimpan dengan detail berbeda. Buka kembali pesanan sebelum mengubahnya.');
 const customer=await currentCustomer(request.headers.get('cookie'));
 if((order.customer_id??null)!==(customer?.id??null))throw new AppError(409,'Masuk kembali ke akun yang digunakan untuk pesanan ini.');
 if(order.order_type==='reserve'||['cancelled','expired'].includes(order.status)||order.created_at<=Date.now()-PAYMENT_SESSION_LIFETIME)throw new AppError(409,'Pesanan ini sudah berakhir. Mulai pesanan baru dari katalog.');
 const current=session(request),token=current&&order.session_hash===await hash(current)?current:attempt.token;
 if(order.session_hash!==await hash(token))throw new AppError(409,'Pesanan sudah dibuka dari sesi lain. Buka melalui Pesanan saya atau tautan pembayaran yang disimpan.');
 return json(publicOrder(order),200,{'Set-Cookie':orderSessionCookie(request,token)});
}
export async function submitOrderOnce(request:Request,raw:Record<string,unknown>,action:(attempt:Submission|null)=>Promise<Response>){
 const attempt=await submissionAttempt(request,raw);if(!attempt)return action(null);
 const existing=await saved(request,attempt);if(existing)return existing;
 try{return await action(attempt)}catch(error){
  // Concurrent inserts, a dropped response and retries share one durable key.
  // A failed operation is never converted into success unless that exact order exists.
  const recovered=await saved(request,attempt);if(recovered)return recovered;throw error;
 }
}
