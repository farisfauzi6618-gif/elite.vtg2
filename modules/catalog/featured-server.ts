import {getSqlClient} from '@/lib/database';
import {AppError,integerValue,readProduct,textValue} from './server';
import {FEATURED_LIMIT} from './featured';
export async function setFeatured(input:any){
 const id=textValue(input.id,100),version=integerValue(input.version,'Versi',1e9,false);
 if(typeof input.featured!=='boolean')throw new AppError(400,'Pilih status Featured yang valid.');
 const position=input.position==null?null:integerValue(input.position,'Featured Position',FEATURED_LIMIT,false);
 if(position===0)throw new AppError(400,'Featured Position harus 1–8.');
 const tx=await getSqlClient().transaction('write');
 try{
  const current=(await tx.execute({sql:'SELECT id,version,is_featured,status,sold_at FROM products WHERE id=? AND deleted_at IS NULL',args:[id]})).rows[0];
  if(!current)throw new AppError(404,'Barang tidak ditemukan.');
  if(Number(current.version)!==version)throw new AppError(409,'Data berubah. Muat ulang barang sebelum mengubah Featured.');
  if(input.featured&&current.status==='published'&&current.sold_at!=null)throw new AppError(409,'Barang SOLD tidak dapat ditambahkan ke Featured aktif.');
  const active=(await tx.execute("SELECT id,featured_position FROM products WHERE deleted_at IS NULL AND is_featured=1 AND (status!='published' OR sold_at IS NULL) ORDER BY featured_position,id")).rows;
  const others=active.filter(p=>p.id!==id);
  if(input.featured&&others.length>=FEATURED_LIMIT)throw new AppError(409,'Maximum 8 featured products. Hapus salah satu dari Featured terlebih dahulu.',{featuredLimit:FEATURED_LIMIT});
  const ordered=others.map(p=>String(p.id));if(input.featured)ordered.splice(Math.min(position==null?(current.is_featured?Math.max(0,active.findIndex(p=>p.id===id)):ordered.length):position-1,ordered.length),0,id);
  const now=new Date().toISOString();
  await tx.execute({sql:'UPDATE products SET is_featured=?,featured_position=?,version=version+1,updated_at=?,last_mutation=? WHERE id=? AND version=?',args:[Number(input.featured),input.featured?ordered.indexOf(id)+1:null,now,crypto.randomUUID(),id,version]});
  // Renumber active entries atomically. Stock and publication timestamps are untouched.
  for(const [index,pid] of ordered.entries())if(pid!==id){const slot=index<FEATURED_LIMIT?index+1:null;await tx.execute({sql:'UPDATE products SET featured_position=?,version=version+1,updated_at=? WHERE id=? AND featured_position IS NOT ?',args:[slot,now,pid,slot]});}
  await tx.commit();
 }finally{tx.close();}
 return readProduct(id);
}
