import {getSqlClient} from '@/lib/database';
import {AppError,integerValue,textValue} from './server';

export async function trashProduct(input:any,actor:string){
 const id=textValue(input.id,100),version=integerValue(input.version,'Versi',1e9,false);
 if(input.confirmed!==true)throw new AppError(400,'Konfirmasi penghapusan barang terlebih dahulu.');
 const tx=await getSqlClient().transaction('write');
 try{
  const current=(await tx.execute({sql:'SELECT id,version,deleted_at FROM products WHERE id=?',args:[id]})).rows[0];
  if(!current)throw new AppError(404,'Barang tidak ditemukan.');
  if(current.deleted_at){await tx.commit();return {id,deletedAt:String(current.deleted_at)}}
  if(Number(current.version)!==version)throw new AppError(409,'Data berubah. Muat ulang barang sebelum menghapus.');
  // Check invoice snapshots as well as Reserve holds inside the same write transaction.
  const pending=(await tx.execute({sql:`SELECT 1 FROM orders o JOIN catalog_checkouts c ON c.id=o.catalog_checkout_id
   WHERE EXISTS(SELECT 1 FROM json_each(c.lines_json) line WHERE json_extract(line.value,'$.productId')=?)
   AND ((o.order_type='reserve' AND COALESCE(o.reservation_status,'AWAITING_DEPOSIT') NOT IN ('PAID','EXPIRED','CANCELLED'))
    OR (o.order_type!='reserve' AND o.status NOT IN ('cancelled','failed','expired','refunded') AND COALESCE(o.stock_sync_state,'pending')!='applied')) LIMIT 1`,args:[id]})).rows[0];
  const held=(await tx.execute({sql:"SELECT 1 FROM reserve_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=? AND i.state='active' AND o.reservation_status NOT IN ('PAID','EXPIRED','CANCELLED') LIMIT 1",args:[id]})).rows[0];
  if(pending||held)throw new AppError(409,'Barang masih terkait pesanan atau DP berjalan. Selesaikan atau batalkan pesanan tersebut sebelum menghapus barang.',{activeOrder:true});
  const now=new Date().toISOString();
  await tx.execute({sql:"UPDATE products SET deleted_at=?,deleted_by=?,status='draft',reviewed=0,is_featured=0,featured_position=NULL,version=version+1,updated_at=?,last_mutation=? WHERE id=? AND version=? AND deleted_at IS NULL",args:[now,actor,now,crypto.randomUUID(),id,version]});
  await tx.commit();return {id,deletedAt:now};
 }catch(error){await tx.rollback();throw error}finally{tx.close()}
}

export async function restoreProduct(input:any){
 const id=textValue(input.id,100),version=integerValue(input.version,'Versi',1e9,false),tx=await getSqlClient().transaction('write');
 try{
  const current=(await tx.execute({sql:'SELECT version,deleted_at FROM products WHERE id=?',args:[id]})).rows[0];
  if(!current)throw new AppError(404,'Barang tidak ditemukan.');
  if(!current.deleted_at)throw new AppError(409,'Barang sudah dipulihkan. Muat ulang daftar barang.');
  if(Number(current.version)!==version)throw new AppError(409,'Data berubah. Muat ulang Sampah sebelum memulihkan.');
  await tx.execute({sql:"UPDATE products SET deleted_at=NULL,deleted_by=NULL,status='draft',reviewed=0,version=version+1,updated_at=?,last_mutation=? WHERE id=? AND version=? AND deleted_at IS NOT NULL",args:[new Date().toISOString(),crypto.randomUUID(),id,version]});
  await tx.commit();return {id};
 }catch(error){await tx.rollback();throw error}finally{tx.close()}
}
