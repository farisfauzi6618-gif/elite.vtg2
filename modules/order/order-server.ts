import {sameOrigin,clientIp} from '@/lib/request-security';
import { readLimitedText,readLimitedForm } from '@/modules/order/request-limits';
import { env } from '@/lib/env';
import { getOwnerUser } from "@/lib/auth/owner";
import { invoiceText, recipientMessage, orderQuote, type Order } from "@/modules/order/order-types";
import { normalizeOrderItems, orderItems } from "@/modules/order/order-items";
import { paymentConfig } from '@/modules/order/payment-config';
import type { PaymentConfig } from '@/modules/order/payment-types';
import { storedPaymentMethod } from '@/modules/order/payment-types';
export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export const db=()=>{if(!env.DB)throw new AppError(503,"Penyimpanan sedang tidak tersedia. Coba lagi sebentar.");return env.DB;};
export const bucket=()=>{if(!env.BUCKET)throw new AppError(503,"Penyimpanan gambar sedang tidak tersedia.");return env.BUCKET;};
export const random=()=>crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
export async function hash(s:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
export type Settings={id:number;owner_id:string|null;merchant:string;qris_key:string|null;qris_mime:string|null;bot_cipher:string|null;bot_username:string|null;chat_id:string|null;chat_name:string|null;pair_nonce:string|null;pair_expires:number|null;candidate_id:string|null;candidate_name:string|null;shipping_cipher?:string|null;shipping_config?:string|null;kirimin_cipher?:string|null;kirimin_config?:string|null;kirimin_pin_cipher?:string|null;kirimin_webhook_cipher?:string|null;kirimin_webhook_active?:number;webhook_cipher?:string|null;webhook_active?:number};
export async function settings(){return await db().prepare("SELECT * FROM settings WHERE id=1").first<Settings>();}
export async function ready(s:Settings|null,payment?:PaymentConfig){return !!(s?.bot_cipher&&s.chat_id&&(payment||await paymentConfig()).defaultMethod);}
export async function owner(request?:Request){const u=await getOwnerUser(request);if(!u)throw new AppError(401,"Masuk sebagai pemilik untuk mengelola pesanan.");let s=await settings();if(!s?.owner_id){if(!env.OWNER_EMAIL||u.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())throw new AppError(403,"Halaman ini khusus pemilik ELITE.VTG.");await db().prepare("INSERT INTO settings(id,owner_id) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET owner_id=COALESCE(settings.owner_id,excluded.owner_id)").bind(u.userId).run();s=await settings();}if(s?.owner_id!==u.userId)throw new AppError(403,"Halaman ini khusus pemilik ELITE.VTG.");return u;}
export function originCheck(req:Request){if(!sameOrigin(req))throw new AppError(403,"Sesi tidak valid. Buka ulang halaman ini.");}
export function json(v:unknown,status=200,extra:HeadersInit={}){return Response.json(v,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extra}});}
export async function api(fn:()=>Promise<Response>){try{return await fn();}catch(e){if(e instanceof AppError)return json({error:e.message},e.status);console.error("Order operation failed",e instanceof Error?e.name:"unknown");return json({error:"Terjadi kendala. Data Anda tetap ada di formulir; coba lagi."},503);}}
export async function body(req:Request){if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError(415,'Gunakan formulir aplikasi untuk mengirim data.');const raw=await readLimitedText(req,12000);try{const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v as Record<string,unknown>;}catch{throw new AppError(400,'Formulir tidak valid.');}}
export function text(v:unknown,label:string,min=2,max=120){if(typeof v!=="string"||v.trim().length<min||v.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw new AppError(400,`${label} belum valid.`);return v.trim();}
export function validateOrder(v:Record<string,unknown>){const name=text(v.name,"Nama");const phone=text(v.phone,"Nomor telepon",9,20).replace(/[\s()-]/g,"");if(!/^(?:\+62|62|0)\d{8,13}$/.test(phone))throw new AppError(400,"Gunakan nomor telepon Indonesia yang valid.");const address=text(v.address,"Alamat lengkap",15,650),postcode=text(v.postcode,"Kode pos",5,5);if(!/^\d{5}$/.test(postcode))throw new AppError(400,"Kode pos harus 5 angka.");let products;try{products=normalizeOrderItems(v);}catch(e){throw new AppError(400,e instanceof Error?e.message:"Nama barang belum valid.");}const itemAmount=Number(v.itemAmount);if(!Number.isSafeInteger(itemAmount)||itemAmount<1000||itemAmount>10000000)throw new AppError(400,"Harga barang harus Rp1.000 sampai Rp10.000.000, tanpa desimal.");if(v.consent!==true)throw new AppError(400,"Setujui pengiriman data pesanan terlebih dahulu.");return {name,phone,address,postcode,...products,itemAmount};}
export async function rate(req:Request,action:string,max:number){const ip=clientIp(req);const window=Math.floor(Date.now()/3600000);const key=await hash((env.CONFIG_SECRET||"")+ip+action+window);const row=await db().prepare("INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=MIN(count+1,1000) RETURNING count").bind(key,Date.now()+3600000).first<{count:number}>();if((row?.count||0)>max)throw new AppError(429,"Terlalu banyak percobaan. Coba lagi dalam satu jam.");if(Math.random()<.03)await db().prepare("DELETE FROM limits WHERE expires<?").bind(Date.now()).run();}
export function session(req:Request){return req.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("elite_order="))?.slice(12)||null;}
export async function myOrder(req:Request){const token=session(req);if(!token||! /^[a-f0-9]{64}$/.test(token))throw new AppError(404,"Pesanan tidak ditemukan di perangkat ini.");const o=await db().prepare("SELECT * FROM orders WHERE session_hash=? ORDER BY created_at DESC LIMIT 1").bind(await hash(token)).first<Order>();if(!o||Date.now()-o.created_at>7*86400000)throw new AppError(404,"Sesi pesanan telah berakhir. Hubungi penjual dengan nomor invoice Anda.");return o;}
export function publicOrder(o:Order){const items=orderItems(o);return {payment_method:storedPaymentMethod(o.payment_method),payment_state:o.payment_state,confirmed_at:o.confirmed_at,id:o.id,created_at:o.created_at,name:o.name,phone:o.phone,address:o.address,postcode:o.postcode,item:o.item,quantity:items.length,items,total:o.total,item_amount:o.item_amount,shipping_amount:o.shipping_amount,status:o.status,notify_status:o.notify_status,catalog_checkout_id:o.catalog_checkout_id,catalog_token:o.catalog_token,stock_sync_state:o.stock_sync_state,quote:orderQuote(o)};}
export async function image(req:Request){if(Number(req.headers.get("content-length")||0)>4*1024*1024+10000)throw new AppError(413,"Ukuran gambar maksimal 4 MB.");const form=await readLimitedForm(req,4*1024*1024+10000);const file=form.get("file");if(!(file instanceof File)||file.size<32||file.size>4*1024*1024)throw new AppError(400,"Pilih gambar JPG, PNG, atau WebP, maksimal 4 MB.");const bytes=await file.arrayBuffer();const b=new Uint8Array(bytes);let mime="";if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)mime="image/png";if(b[0]===255&&b[1]===216&&b[2]===255)mime="image/jpeg";if(new TextDecoder().decode(b.slice(0,4))==="RIFF"&&new TextDecoder().decode(b.slice(8,12))==="WEBP")mime="image/webp";if(!mime)throw new AppError(400,"Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.");return {bytes,mime,form};}
async function aesKey(){if(!env.CONFIG_SECRET||env.CONFIG_SECRET.length<32)throw new AppError(503,"Pengaturan keamanan belum tersedia.");const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(env.CONFIG_SECRET));return crypto.subtle.importKey("raw",digest,"AES-GCM",false,["encrypt","decrypt"]);}
export async function encrypt(value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(),new TextEncoder().encode(value));return btoa(String.fromCharCode(...iv))+"."+btoa(String.fromCharCode(...new Uint8Array(data)));}
export async function decrypt(value:string){const [a,b]=value.split(".");const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(a),x=>x.charCodeAt(0))},await aesKey(),Uint8Array.from(atob(b),x=>x.charCodeAt(0)));return new TextDecoder().decode(data);}
type TelegramResult={message_id:number;username:string;url:string;is_bot:boolean};
export type TelegramUpdate={message?:{text?:string;chat:{id:number;type:string;first_name?:string;last_name?:string;username?:string};from?:{id:number;is_bot:boolean}}};
export async function telegram<T=TelegramResult>(token:string,method:string,payload:Record<string,unknown>|FormData){let r:Response;try{r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",redirect:"manual",headers:payload instanceof FormData?{}:{"Content-Type":"application/json"},body:payload instanceof FormData?payload:JSON.stringify(payload),signal:AbortSignal.timeout(18000)});}catch{throw new AppError(502,"Telegram belum dapat dihubungi. Coba lagi.");}if(r.status>=300&&r.status<400)throw new AppError(502,"Telegram memberikan respons tidak valid.");const data=await r.json() as {ok:boolean;result:T;error_code?:number};if(!data.ok)throw new AppError(502,data.error_code===409?"Bot sedang menggunakan webhook atau dipakai aplikasi lain. Gunakan bot khusus ELITE.VTG.":"Telegram menolak permintaan. Periksa token dan pastikan bot tidak diblokir.");return data.result;}
export async function notify(id:string){
 const s=await settings();if(!s?.bot_cipher||!s.chat_id)return false;
 const lease=Date.now()+120000;
 const claimed=await db().prepare("UPDATE orders SET notify_lease=?,notify_status='sending',delivery_chat=COALESCE(delivery_chat,?) WHERE id=? AND proof_key IS NOT NULL AND notify_status!='sent' AND notify_lease<? RETURNING *").bind(lease,s.chat_id,id,Date.now()).first<Order>();
 if(!claimed)return false;
 try{
  const {ensureTelegramWebhook}=await import("./telegram-actions");await ensureTelegramWebhook(s).catch(()=>{});
  const token=await decrypt(s.bot_cipher),chat=claimed.delivery_chat||s.chat_id;
  if(chat!==s.chat_id)throw new AppError(409,"Penerima Telegram berubah; periksa pesanan lama sebelum mengirim ulang.");
  if(!claimed.proof_message){
   const proof=await bucket().get(claimed.proof_key!);if(!proof)throw new AppError(503,"Bukti pembayaran belum tersedia.");
   const form=new FormData();form.set("chat_id",chat);form.set("caption",`Bukti pembayaran ${id} · Pesanan berhasil dikirim`);
   if(claimed.invoice_message)form.set("reply_parameters",JSON.stringify({message_id:Number(claimed.invoice_message)}));
   form.set("document",new Blob([await proof.arrayBuffer()],{type:claimed.proof_mime||"image/jpeg"}),`bukti-${id}.${claimed.proof_mime==="image/png"?"png":claimed.proof_mime==="image/webp"?"webp":"jpg"}`);
   const sent=await telegram(token,"sendDocument",form);await db().prepare("UPDATE orders SET proof_message=? WHERE id=?").bind(String(sent.message_id),id).run();
  }
  if(!claimed.invoice_message){
   const sent=await telegram(token,"sendMessage",{chat_id:chat,text:invoiceText(claimed,{includeRecipient:false})+(claimed.catalog_checkout_id?"\nStok katalog: otomatis dikurangi setelah konfirmasi pembayaran.":"\nPesanan manual: harga diisi pembeli. Cocokkan dengan harga yang disepakati sebelum konfirmasi. Stok katalog tidak terhubung otomatis."),reply_markup:{inline_keyboard:[[{text:"Konfirmasi pembayaran & buat resi",callback_data:"confirm:"+id}]]}});
   await db().prepare("UPDATE orders SET invoice_message=? WHERE id=?").bind(String(sent.message_id),id).run();
  }
  if(!claimed.recipient_message){
   const sent=await telegram(token,"sendMessage",{chat_id:chat,...recipientMessage(claimed)});
   await db().prepare("UPDATE orders SET recipient_message=? WHERE id=?").bind(String(sent.message_id),id).run();
  }
  await db().prepare("UPDATE orders SET notify_status='sent',notify_lease=0 WHERE id=?").bind(id).run();return true;
 }catch{await db().prepare("UPDATE orders SET notify_status='failed',notify_lease=0 WHERE id=?").bind(id).run();return false;}
}
