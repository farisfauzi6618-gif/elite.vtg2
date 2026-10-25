import {env} from '@/lib/env';
import {AppError,db,random,hash} from './order-server';
import {refreshCatalogInvoice} from './catalog-bridge';
import {orderSessionCookie} from './first-purchase-server';
import {PAYMENT_SESSION_LIFETIME} from './customer-orders';
import type {Order} from './order-types';

export const PAYMENT_INVOICE_PATTERN=/^EV-\d{6}-[A-F0-9]{8}$/;
const SIGNATURE_PATTERN=/^[a-f0-9]{64}$/;
const INVALID_LINK='Tautan pembayaran tidak berlaku. Buka tautan lengkap yang Anda simpan, atau gunakan Lacak pesanan jika bukti sudah dikirim.';
const bytes=(value:string)=>new TextEncoder().encode(value);

async function signingKey(){
 const secret=env.CONFIG_SECRET;
 if(!secret||secret.length<32)throw new AppError(503,'Tautan pembayaran belum dapat dibuat. Coba lagi.');
 return crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
function signatureInput(o:Order){return bytes(['elite.vtg:guest-payment:v1',o.id,String(o.created_at),'guest'].join('\n'))}
function liveInvoice(o:Order,now=Date.now()){
 return (o.order_type??'normal')==='normal'&&Number.isSafeInteger(o.created_at)&&o.created_at<=now&&o.created_at+PAYMENT_SESSION_LIFETIME>now;
}

// Stateless, purpose-scoped bearer link. Its signature lives in the URL fragment,
// never in a request URL/referrer, and cannot authenticate a customer/admin account.
export async function guestPaymentLink(o:Order){
 if(!liveInvoice(o)||o.customer_id||o.status!=='awaiting_proof'||o.proof_key)throw new AppError(409,'Tautan ini tersedia untuk pembayaran tamu yang belum selesai. Untuk akun, buka Pesanan saya.');
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(),signatureInput(o)));
 const token=Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('');
 const origin=env.SITE_ORIGIN;
 if(!origin||!/^https:\/\//.test(origin))throw new AppError(503,'Tautan pembayaran belum tersedia. Coba lagi.');
 return {url:origin+'/order/lanjutkan?invoice='+encodeURIComponent(o.id)+'#'+token,expiresAt:o.created_at+PAYMENT_SESSION_LIFETIME};
}

export async function guestPaymentInvoice(invoice:unknown,token:unknown){
 if(typeof invoice!=='string'||!PAYMENT_INVOICE_PATTERN.test(invoice)||typeof token!=='string'||!SIGNATURE_PATTERN.test(token))throw new AppError(400,'Tautan pembayaran tidak valid. Gunakan tautan yang disimpan dari halaman pembayaran.');
 const o=await db().prepare('SELECT * FROM orders WHERE id=?').bind(invoice).first<Order>();
 if(!o||!liveInvoice(o)||o.customer_id||['cancelled','expired'].includes(o.status))throw new AppError(404,INVALID_LINK);
 const signature=Uint8Array.from(token.match(/../g)!,s=>parseInt(s,16));
 if(!await crypto.subtle.verify('HMAC',await signingKey(),signature,signatureInput(o)))throw new AppError(404,INVALID_LINK);
 return o;
}

// Called only after verified account ownership or a valid guest payment capability.
export async function restorePaymentSession(request:Request,existing:Order){
 if(!liveInvoice(existing)||existing.status!=='awaiting_proof'||existing.proof_key)throw new AppError(409,'Pembayaran ini tidak dapat dilanjutkan. Periksa status pesanan Anda.');
 await refreshCatalogInvoice(existing);
 const token=random();
 const order=await db().prepare(`UPDATE orders SET session_hash=? WHERE id=? AND session_hash=? AND customer_id IS ?
  AND COALESCE(order_type,'normal')='normal' AND status='awaiting_proof' AND proof_key IS NULL AND created_at>?
  AND total=? AND catalog_checkout_id IS ? AND catalog_token IS ? AND items_json IS ? AND shipping_json IS ? RETURNING *`)
  .bind(await hash(token),existing.id,existing.session_hash,existing.customer_id??null,Date.now()-PAYMENT_SESSION_LIFETIME,
   existing.total,existing.catalog_checkout_id??null,existing.catalog_token??null,existing.items_json??null,existing.shipping_json??null).first<Order>();
 if(!order)throw new AppError(409,'Pesanan berubah dari tab lain. Buka kembali pesanan sebelum membayar.');
 return {order,cookie:orderSessionCookie(request,token)};
}
