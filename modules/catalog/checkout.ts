import {orderingLocked,scheduleLabel} from './product-schedule';
import { choiceLabel } from '@/modules/catalog/catalog-types';
import { AppError,db,readProduct,textValue } from '@/modules/catalog/server';

export type CheckoutLine={productId:string;groupId:string;quantity:number;name:string;label:string;instagramUrl:string;unitPrice:number};
type Checkout={id:string;token_hash:string;lines_json:string;amount:number;expires_at:number;customer_id:string|null};
export async function digest(value:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
export function checkoutConfigured(){return true}
export async function createCheckout(input:any,customerId:string|null=null){
 if(!checkoutConfigured())throw new AppError(503,'Pembayaran katalog belum terhubung. Hubungi ELITE.VTG.');
 if(!Array.isArray(input?.lines)||!input.lines.length||input.lines.length>20)throw new AppError(400,'Pilih 1 sampai 20 barang.');
 const grouped=new Map<string,{productId:string;groupId:string;quantity:number}>();
 for(const raw of input.lines){const productId=textValue(raw?.productId,100),groupId=textValue(raw?.groupId,100),quantity=raw?.quantity;if(!productId||!groupId||!Number.isSafeInteger(quantity)||quantity<1||quantity>20)throw new AppError(400,'Pilihan barang dan jumlah tidak valid.');const old=grouped.get(groupId);if(old&&old.productId!==productId)throw new AppError(400,'Kelompok ukuran tidak cocok.');grouped.set(groupId,{productId,groupId,quantity:quantity+(old?.quantity||0)})}
 const lines:CheckoutLine[]=[];let quantity=0,amount=0;
 for(const raw of grouped.values()){const p=await readProduct(raw.productId),g=p.groups.find(g=>g.id===raw.groupId);if(p.status!=='published'||!g||g.qty==null||g.qty<raw.quantity)throw new AppError(409,'Stok pilihan berubah. Perbarui katalog dan pilih kembali.');if(orderingLocked(p))throw new AppError(409,'Pemesanan dibuka '+scheduleLabel(p.orderableAt!)+'. Foto dan detail sudah bisa dilihat.');const price=g.price??p.price;if(price==null||price<1000)throw new AppError(409,'Harga barang belum dapat digunakan untuk pembayaran. Hubungi ELITE.VTG.');quantity+=raw.quantity;amount+=price*raw.quantity;lines.push({...raw,name:p.name,label:choiceLabel(g),instagramUrl:p.instagramUrl,unitPrice:price})}
 if(quantity>20||amount>10000000)throw new AppError(400,'Maksimal 20 unit dan harga barang Rp10.000.000 per pesanan.');
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),id=crypto.randomUUID(),expiresAt=Date.now()+86400000;
 await db().prepare('INSERT INTO catalog_checkouts(id,token_hash,lines_json,amount,expires_at,created_at,customer_id) VALUES(?,?,?,?,?,?,?)').bind(id,await digest(token),JSON.stringify(lines),amount,expiresAt,Date.now(),customerId).run();
 return {url:'/order?catalog='+token,expiresAt};
}
export async function quoteCheckout(token:unknown){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new AppError(400,'Tautan pilihan barang tidak valid.');
 const c=await db().prepare('SELECT * FROM catalog_checkouts WHERE token_hash=?').bind(await digest(token)).first<Checkout>();if(!c||c.expires_at<Date.now())throw new AppError(410,'Tautan pilihan barang telah berakhir. Pilih kembali di katalog.');
 const used=await db().prepare('SELECT order_id FROM catalog_sales WHERE checkout_id=?').bind(c.id).first();if(used)throw new AppError(409,'Pilihan barang ini sudah dikonfirmasi. Buat pilihan baru di katalog.');
 const lines=JSON.parse(c.lines_json) as CheckoutLine[];
 for(const line of lines){const p=await readProduct(line.productId),g=p.groups.find(g=>g.id===line.groupId);if(p.status!=='published'||!g||g.qty==null||g.qty<line.quantity)throw new AppError(409,'Barang pilihan sudah tidak tersedia. Pilih kembali di katalog.');if(orderingLocked(p))throw new AppError(409,'Pemesanan dibuka '+scheduleLabel(p.orderableAt!)+'.');if((g.price??p.price)!==line.unitPrice)throw new AppError(409,'Harga barang berubah. Pilih kembali di katalog untuk melihat harga terbaru.')}
 const customer=c.customer_id?await db().prepare('SELECT name,phone FROM customers WHERE id=?').bind(c.customer_id).first<{name:string;phone:string|null}>():null;
 return {id:c.id,lines,amount:c.amount,expiresAt:c.expires_at,...(customer?{customer}: {})};
}
export async function applyCheckoutSale(input:any){
 const orderId=textValue(input?.orderId,40),checkoutId=textValue(input?.checkoutId,100);if(!/^EV-\d{6}-[A-F0-9]{8}$/.test(orderId)||!checkoutId)throw new AppError(400,'Identitas pesanan tidak valid.');
 const d=db(),existing=await d.prepare('SELECT checkout_id FROM catalog_sales WHERE order_id=?').bind(orderId).first<{checkout_id:string}>();if(existing){if(existing.checkout_id!==checkoutId)throw new AppError(409,'Pesanan sudah terhubung ke pilihan barang lain.');return {applied:true,duplicate:true,orderId}}
 const c=await d.prepare('SELECT * FROM catalog_checkouts WHERE id=?').bind(checkoutId).first<Checkout>();if(!c)throw new AppError(404,'Pilihan barang pesanan tidak ditemukan.');
 const lines=JSON.parse(c.lines_json) as CheckoutLine[],marker=crypto.randomUUID(),now=new Date().toISOString(),actor='Telegram · '+textValue(input.actor,60);
 const gate=lines.map(()=>"EXISTS (SELECT 1 FROM size_groups g JOIN products p ON p.id=g.product_id WHERE g.id=? AND g.product_id=? AND g.qty>=? AND p.status='published')").join(' AND ');
 const params=lines.flatMap(l=>[l.groupId,l.productId,l.quantity]);
 const statements=[d.prepare(`INSERT INTO catalog_sales(order_id,checkout_id,marker,created_at) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM catalog_sales WHERE order_id=? OR checkout_id=?) AND ${gate}`).bind(orderId,checkoutId,marker,now,orderId,checkoutId,...params)];
 // The database batch is one atomic transaction. The marker allows only the winning request to mutate stock.
 for(const l of lines){const historyId=crypto.randomUUID();statements.push(d.prepare('INSERT INTO stock_history(id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at) SELECT ?,id,product_id,qty,qty-?,revision,revision+1,?,?,? FROM size_groups WHERE id=? AND EXISTS (SELECT 1 FROM catalog_sales WHERE order_id=? AND marker=?)').bind(historyId,l.quantity,'Pesanan '+orderId+' · terjual '+l.quantity+' unit',actor,now,l.groupId,orderId,marker));statements.push(d.prepare('UPDATE size_groups SET qty=qty-?,revision=revision+1 WHERE id=? AND EXISTS (SELECT 1 FROM catalog_sales WHERE order_id=? AND marker=?)').bind(l.quantity,l.groupId,orderId,marker))}
 for(const pid of new Set(lines.map(l=>l.productId)))statements.push(d.prepare('UPDATE products SET version=version+1,updated_at=?,last_mutation=? WHERE id=? AND EXISTS (SELECT 1 FROM catalog_sales WHERE order_id=? AND marker=?)').bind(now,marker,pid,orderId,marker));
 const result=await d.batch(statements);
 if(result[0].meta.changes===0){const applied=await d.prepare('SELECT checkout_id FROM catalog_sales WHERE order_id=?').bind(orderId).first<{checkout_id:string}>();if(applied?.checkout_id===checkoutId)return {applied:true,duplicate:true,orderId};throw new AppError(409,'Stok tidak cukup atau pilihan barang sudah digunakan pesanan lain. Tidak ada stok yang dipotong; periksa seluruh pesanan.',{kind:'stock_conflict'})}
 return {applied:true,duplicate:false,orderId,lines:lines.map(l=>({name:l.name,label:l.label,quantity:l.quantity}))};
}
