import {quoteCheckout,applyCheckoutSale} from '@/modules/catalog/checkout';
import {db as catalogDb,AppError as CatalogError} from '@/modules/catalog/server';
import { env } from '@/lib/env';
import { db,AppError,settings,decrypt,telegram } from '@/modules/order/order-server';
import type { Order } from '@/modules/order/order-types';
export type CatalogLine={productId:string;groupId:string;quantity:number;name:string;label:string;instagramUrl:string;unitPrice:number};
export type CatalogQuote={id:string;lines:CatalogLine[];amount:number;expiresAt:number;customer?:{name:string;phone:string|null}};
export function catalogConfigured(){return true}
async function bridge<T>(data:Record<string,unknown>):Promise<T>{
 try{
  if(data.op==='ping'){await catalogDb().prepare('SELECT 1 FROM catalog_checkouts LIMIT 1').all();return {service:'ELITE.VTG catalog'} as T}
  if(data.op==='quote')return await quoteCheckout(data.token) as T;
  if(data.op==='sale')return await applyCheckoutSale(data) as T;
  throw new AppError(400,'Tindakan katalog tidak valid.');
 }catch(e){if(e instanceof CatalogError)throw new AppError(e.status,e.message);throw e}
}
export async function catalogHealth(){try{await bridge({op:'ping'});return true}catch{return false}}
export async function catalogQuote(token:unknown){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new AppError(400,'Tautan barang katalog tidak valid.');return bridge<CatalogQuote>({op:'quote',token})}
export function catalogItems(q:CatalogQuote){const items=q.lines.flatMap(l=>Array.from({length:l.quantity},()=>`${l.name} · ${l.label}`));return {items,quantity:items.length,item:items.length===1?items[0]:items.map((x,i)=>`${i+1}. ${x}`).join('\n'),itemAmount:q.amount}}
export async function synchronizeCatalogStock(id:string){
 const o=await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>();if(!o)throw new AppError(404,'Pesanan tidak ditemukan.');if(!o.catalog_checkout_id)return {state:'unlinked'};if(o.payment_state!=='payment_confirmed')throw new AppError(409,'Konfirmasi pembayaran melalui Telegram dahulu.');if(o.stock_sync_state==='applied')return {state:'applied',duplicate:true};
 try{const result=await bridge<{applied:boolean;duplicate:boolean}>({op:'sale',orderId:id,checkoutId:o.catalog_checkout_id,actor:o.confirmed_by});if(!result.applied)throw new AppError(503,'Pengurangan stok belum terverifikasi.');
  const changed=await db().prepare("UPDATE orders SET stock_sync_state='applied',stock_sync_error=NULL WHERE id=? AND stock_sync_state!='applied' RETURNING id").bind(id).first();
  if(changed){const s=await settings();if(s?.bot_cipher&&s.chat_id===o.delivery_chat)await telegram(await decrypt(s.bot_cipher),'sendMessage',{chat_id:s.chat_id,text:`ELITE.VTG · ${id}\nPembayaran dikonfirmasi. Stok katalog sudah dikurangi sesuai barang dan ukuran pesanan.`,reply_markup:{inline_keyboard:[[{text:'Buka katalog',url:env.SITE_ORIGIN}]]}}).catch(()=>{})}
  return {state:'applied',duplicate:result.duplicate};
 }catch(e){const message=e instanceof AppError?e.message:'Sinkron stok belum berhasil. Coba lagi.';await db().prepare("UPDATE orders SET stock_sync_state=?,stock_sync_error=? WHERE id=? AND stock_sync_state!='applied'").bind(e instanceof AppError&&e.status===409?'conflict':'error',message,id).run();const current=await db().prepare('SELECT stock_sync_state FROM orders WHERE id=?').bind(id).first<{stock_sync_state:string}>();if(current?.stock_sync_state==='applied')return {state:'applied',duplicate:true};throw new AppError(e instanceof AppError?e.status:503,message+' Pengiriman ditahan sampai stok terselesaikan.')}
}
