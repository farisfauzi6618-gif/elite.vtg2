import {isSold} from './catalog-types';
import {AppError,db,integerValue,readProduct,textValue} from './server';

export async function setSoldVisibility(input:any) {
 const id=textValue(input.id,100),version=integerValue(input.version,'Versi',1e9,false);
 if(typeof input.hidden!=='boolean')throw new AppError(400,'Pilih tampilan SOLD yang valid.');
 const current=await readProduct(id);
 if(current.version!==version)throw new AppError(409,'Data berubah. Muat ulang barang sebelum mengubah tampilan SOLD.');
 if(!isSold(current))throw new AppError(409,'Kontrol ini hanya tersedia untuk barang SOLD.');
 if(Boolean(current.soldHidden)===input.hidden)return current;
 // Recheck stock in the same write so a concurrent restock cannot be hidden.
 const result=await db().prepare("UPDATE products SET sold_hidden=?,version=version+1,updated_at=?,last_mutation=? WHERE id=? AND version=? AND status='published' AND EXISTS(SELECT 1 FROM size_groups WHERE product_id=products.id) AND NOT EXISTS(SELECT 1 FROM size_groups WHERE product_id=products.id AND (qty IS NULL OR qty>0))").bind(input.hidden?1:0,new Date().toISOString(),crypto.randomUUID(),id,version).run();
 if(!result.meta.changes)throw new AppError(409,'Stok atau data berubah. Muat ulang barang sebelum mengubah tampilan SOLD.');
 return readProduct(id);
}
