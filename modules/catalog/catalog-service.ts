import {normalizeSchedule} from './product-schedule';
import {CATEGORIES} from '@/modules/catalog/taxonomy';
import {validateFeatures} from '@/modules/catalog/taxonomy-service';
import { fitLabel } from '@/modules/catalog/catalog-types';
import { db, AppError, readProduct, integerValue, measureValue, optionalText, textValue } from '@/modules/catalog/server';
import { MAX_PRODUCT_PHOTOS,FITS, type Product, type SizeGroup } from '@/modules/catalog/catalog-types';
// Every new item starts blank. Caption data never supplies price, fit or stock.
export async function createManualDraft(input:any){
 if(input.caption||input.url||input.instagramUrl)throw new AppError(400,'Isi barang melalui formulir manual, tanpa caption atau link Instagram.');
 const supplied=textValue(input.draftId,100);
 if(supplied&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(supplied))throw new AppError(400,'Identitas draf tidak valid.');
 const shortcode='local_'+(supplied||crypto.randomUUID()).toLowerCase(),d=db();
 const existing=await d.prepare('SELECT id FROM products WHERE shortcode=?').bind(shortcode).first<{id:string}>();
 if(existing)return {product:await readProduct(existing.id),duplicate:true};
 const photoKey=optionalText(input.photoKey,100),photoKeys=await validatePhotos(photoKey,input.photoKeys??[]);
 const id=crypto.randomUUID(),gid=crypto.randomUUID(),now=new Date().toISOString();
 const group:SizeGroup={id:gid,label:'',tagSize:'',fits:[],lengthCm:null,widthCm:null,qty:null,price:null,condition:null,defects:null,revision:0,sortOrder:0};
 const warnings=publicationIssues({name:'',brand:'',category:'',color:'',price:null,condition:null,defects:null,photoKey,groups:[group]});
 const result=await d.batch([
  d.prepare("INSERT OR IGNORE INTO products (id,shortcode,instagram_url,name,brand,category,feature_ids,color,price,condition,defects,photo_key,photo_keys,caption,warnings,reviewed,status,created_at,updated_at,version) VALUES (?,?,'','','','','[]','',NULL,NULL,NULL,?,?,'',?,0,'draft',?,?,0)").bind(id,shortcode,photoKey,JSON.stringify(photoKeys),JSON.stringify(warnings),now,now),
  d.prepare("INSERT INTO size_groups (id,product_id,label,tag_size,fits,length_cm,width_cm,qty,price,condition,defects,revision,sort_order) SELECT ?,?,'','','[]',NULL,NULL,NULL,NULL,NULL,NULL,0,0 WHERE EXISTS (SELECT 1 FROM products WHERE id=?)").bind(gid,id,id),
 ]);
 if(result[0].meta.changes===0){const duplicate=await d.prepare('SELECT id FROM products WHERE shortcode=?').bind(shortcode).first<{id:string}>();if(duplicate)return {product:await readProduct(duplicate.id),duplicate:true};throw new AppError(409,'Draf berubah saat disimpan. Coba lagi.')}
 return {product:await readProduct(id),duplicate:false};
}
async function validatePhotos(photoKey:string|null,input:unknown){
 if(!Array.isArray(input)||input.length>MAX_PRODUCT_PHOTOS||input.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x)))throw new AppError(400,'Maksimal 12 foto yang sudah diunggah.');
 const keys=[...new Set([photoKey,...input].filter((x):x is string=>!!x))];if(keys.length>MAX_PRODUCT_PHOTOS)throw new AppError(400,'Maksimal 12 foto per barang.');
 for(const key of keys)if(!await db().prepare('SELECT key FROM photos WHERE key=?').bind(key).first())throw new AppError(400,'Foto belum tersimpan. Unggah kembali.');return keys;
}
function validateGroup(input:any,index:number):SizeGroup{
 if(!input||typeof input!=='object')throw new AppError(400,'Kelompok ukuran tidak valid.');const fits=input.fits;if(!Array.isArray(fits)||fits.some((s:any)=>typeof s!=='string'||!FITS.includes(s))||fits.length>FITS.length)throw new AppError(400,'Pilih fit dari pilihan yang tersedia.');
 return {id:textValue(input.id,100)||crypto.randomUUID(),label:fits.length?fitLabel({fits}):'',tagSize:textValue(input.tagSize,80),fits:[...new Set(fits)] as string[],lengthCm:measureValue(input.lengthCm),widthCm:measureValue(input.widthCm),qty:integerValue(input.qty,'Jumlah stok',100000),price:integerValue(input.price,'Harga kelompok'),condition:optionalText(input.condition),defects:optionalText(input.defects),revision:0,sortOrder:index};
}
export function publicationIssues(p:Pick<Product,'name'|'brand'|'category'|'color'|'price'|'condition'|'defects'|'photoKey'|'groups'>,allowUnmappedCategory=false){const issues:string[]=[];if(!p.name)issues.push('Nama barang wajib diisi.');if(!p.brand)issues.push('Brand wajib diisi.');if(!allowUnmappedCategory&&!CATEGORIES.includes(p.category))issues.push('Pilih satu kategori utama.');if(!p.color)issues.push('Warna wajib diisi.');if(!p.photoKey)issues.push('Unggah foto utama.');if(!p.groups.length)issues.push('Tambahkan minimal satu kelompok ukuran.');p.groups.forEach((g,i)=>{if(g.qty===0)return;if(!g.fits.length)issues.push(`Ukuran ${i+1}: tentukan fit; tag tidak otomatis menjadi fit.`);if(g.qty==null)issues.push(`Ukuran ${i+1}: jumlah stok wajib dipastikan.`);if((g.price??p.price??0)<=0)issues.push(`Ukuran ${i+1}: harga wajib diisi lebih dari nol.`);if(!(g.condition??p.condition))issues.push(`Ukuran ${i+1}: kondisi wajib diisi.`);if(!(g.defects??p.defects))issues.push(`Ukuran ${i+1}: minus wajib diisi (boleh “Tidak ada” setelah diperiksa).`)});return issues}
export async function saveProduct(input:any,actor:string){
 const id=textValue(input.id,100),current=await readProduct(id),version=integerValue(input.version,'Versi',1e9,false);if(current.version!==version)throw new AppError(409,'Data berubah dari perangkat lain. Muat ulang barang sebelum menyimpan; isian Anda tetap di formulir.');
 if(!Array.isArray(input.groups)||input.groups.length>40)throw new AppError(400,'Kelompok ukuran maksimal 40.');const groups=input.groups.map(validateGroup) as SizeGroup[];if(new Set(groups.map(g=>g.id)).size!==groups.length)throw new AppError(400,'Identitas kelompok ukuran ganda.');
 const oldIds=new Set(current.groups.map(g=>g.id));const missing=current.groups.filter(g=>!groups.some(n=>n.id===g.id));if(missing.length)throw new AppError(400,'Kelompok tersimpan tidak dapat dihapus karena mempunyai riwayat. Set stok ke 0 untuk menonaktifkannya.');
 for(const g of groups)if(!oldIds.has(g.id)&&await db().prepare('SELECT id FROM size_groups WHERE id=?').bind(g.id).first())throw new AppError(400,'Kelompok ukuran bukan milik produk ini.');
 // Preserve historical source metadata; this form cannot change or add Instagram links.
 const normalized={url:current.instagramUrl,shortcode:current.shortcode};
 const category=textValue(input.category,100);if(category&&!CATEGORIES.includes(category))throw new AppError(400,'Pilih kategori utama dari daftar bersama.');const features=await validateFeatures(input.features??current.features??[]);
 const p={name:textValue(input.name,200),brand:textValue(input.brand,100),category,color:textValue(input.color,100),price:integerValue(input.price,'Harga'),condition:optionalText(input.condition),defects:optionalText(input.defects),photoKey:optionalText(input.photoKey,100),groups};
 if(p.photoKey&&!await db().prepare('SELECT key FROM photos WHERE key=?').bind(p.photoKey).first())throw new AppError(400,'Foto tidak ditemukan. Unggah kembali.');
 const photoKeys=await validatePhotos(p.photoKey,input.photoKeys??current.photoKeys??[]);const description=textValue(input.description??current.description,5000);
 let orderableAt=current.orderableAt??null;if(Object.hasOwn(input,'orderableAt')){try{orderableAt=normalizeSchedule(input.orderableAt)}catch(e){throw new AppError(400,(e as Error).message)}}
 const status=input.status;if(status!=='draft'&&status!=='published')throw new AppError(400,'Status barang tidak valid.');const reviewed=input.reviewed===true;
 if(status==='published'){const issues=publicationIssues(p,current.status==='published'&&!current.category&&!!current.legacyCategory&&!category);if(!reviewed)issues.push('Centang konfirmasi pemeriksaan data dan stok terkini.');if(issues.length)throw new AppError(400,'Draf belum siap diterbitkan.',{issues})}
 const warnings=publicationIssues(p);groups.forEach((g,i)=>{if(g.lengthCm==null||g.widthCm==null)warnings.push(`Ukuran ${i+1}: ukuran aktual belum lengkap.`)});
 const d=db(),now=new Date().toISOString(),marker=crypto.randomUUID();const statements=[d.prepare('UPDATE products SET instagram_url=?,name=?,brand=?,category=?,feature_ids=?,color=?,price=?,condition=?,defects=?,photo_key=?,photo_keys=?,description=?,caption=?,warnings=?,reviewed=?,status=?,orderable_at=?,published_at=CASE WHEN ?=\'published\' THEN COALESCE(published_at,?) ELSE published_at END,updated_at=?,version=version+1,last_mutation=? WHERE id=? AND version=? AND (?=\'\' OR NOT EXISTS (SELECT 1 FROM products other WHERE other.instagram_url=? AND other.id!=?))').bind(normalized.url,p.name,p.brand,p.category,JSON.stringify(features),p.color,p.price,p.condition,p.defects,p.photoKey,JSON.stringify(photoKeys),description,current.caption,JSON.stringify(warnings),reviewed?1:0,status,orderableAt,status,now,now,marker,id,version,normalized.url,normalized.url,id)];
 for(const g of groups){const old=current.groups.find(x=>x.id===g.id);if(old){
  if(old.qty!==g.qty)statements.push(d.prepare('INSERT INTO stock_history (id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at) SELECT ?,id,product_id,qty,?,revision,revision+1,?,?,? FROM size_groups WHERE id=? AND product_id=? AND EXISTS (SELECT 1 FROM products WHERE id=? AND last_mutation=?)').bind(crypto.randomUUID(),g.qty,'Koreksi di editor',actor,now,g.id,id,id,marker));
  statements.push(d.prepare('UPDATE size_groups SET label=?,tag_size=?,fits=?,length_cm=?,width_cm=?,qty=?,price=?,condition=?,defects=?,revision=revision+1,sort_order=? WHERE id=? AND product_id=? AND EXISTS (SELECT 1 FROM products WHERE id=? AND last_mutation=?)').bind(g.label,g.tagSize,JSON.stringify(g.fits),g.lengthCm,g.widthCm,g.qty,g.price,g.condition,g.defects,g.sortOrder,g.id,id,id,marker));
 }else{
  statements.push(d.prepare('INSERT INTO size_groups (id,product_id,label,tag_size,fits,length_cm,width_cm,qty,price,condition,defects,revision,sort_order) SELECT ?,?,?,?,?,?,?,?,?,?,?,0,? WHERE EXISTS (SELECT 1 FROM products WHERE id=? AND last_mutation=?)').bind(g.id,id,g.label,g.tagSize,JSON.stringify(g.fits),g.lengthCm,g.widthCm,g.qty,g.price,g.condition,g.defects,g.sortOrder,id,marker));
  if(g.qty!=null)statements.push(d.prepare('INSERT INTO stock_history (id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at) SELECT ?,?,?,NULL,?,-1,0,?,?,? WHERE EXISTS (SELECT 1 FROM products WHERE id=? AND last_mutation=?)').bind(crypto.randomUUID(),g.id,id,g.qty,'Stok awal dari admin',actor,now,id,marker));
 }}
 const result=await d.batch(statements);if(result[0].meta.changes===0)throw new AppError(409,'Data berubah dari perangkat lain. Muat ulang barang sebelum menyimpan.');return readProduct(id);
}
export async function changeStock(input:any,actor:string){
 const id=textValue(input.groupId,100);const d=db();const r=await d.prepare('SELECT g.*,p.status FROM size_groups g JOIN products p ON p.id=g.product_id WHERE g.id=?').bind(id).first<any>();if(!r)throw new AppError(404,'Kelompok ukuran tidak ditemukan.');const revision=integerValue(input.revision,'Versi stok',1e9,false);if(r.revision!==revision)throw new AppError(409,'Stok berubah di perangkat lain. Muat ulang sebelum mencoba lagi.');
 let after:number|null;if(input.mode==='delta'){if(r.qty==null)throw new AppError(400,'Pastikan jumlah stok awal melalui editor terlebih dahulu.');if(input.delta!==1&&input.delta!==-1)throw new AppError(400,'Perubahan cepat hanya +1 atau −1.');after=r.qty+input.delta;integerValue(after,'Stok',100000,false)}else if(input.mode==='set')after=integerValue(input.qty,'Stok',100000,false);else throw new AppError(400,'Jenis perubahan stok tidak valid.');
 if(after===r.qty)return {product:await readProduct(r.product_id),changed:false};const hid=crypto.randomUUID(),now=new Date().toISOString(),reason=textValue(input.reason,200)||(input.mode==='delta'&&input.delta===-1?'Terjual 1 unit':input.mode==='delta'?'Tambah 1 unit':'Koreksi jumlah stok');
 const result=await d.batch([
 d.prepare('INSERT INTO stock_history (id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at) SELECT ?,id,product_id,qty,?,revision,revision+1,?,?,? FROM size_groups WHERE id=? AND revision=?').bind(hid,after,reason,actor,now,id,revision),
 d.prepare('UPDATE size_groups SET qty=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM stock_history WHERE id=?)').bind(after,id,revision,hid),
 d.prepare('UPDATE products SET version=version+1,updated_at=?,last_mutation=? WHERE id=? AND EXISTS (SELECT 1 FROM stock_history WHERE id=?)').bind(now,hid,r.product_id,hid),
 ]);if(result[0].meta.changes===0)throw new AppError(409,'Stok baru saja berubah. Muat ulang barang.');return {product:await readProduct(r.product_id),changed:true,historyId:hid};
}
export async function undoStock(input:any,actor:string){
 const pid=textValue(input.id,100),d=db();const last=await d.prepare('SELECT h.*,g.qty AS current_qty,g.revision AS current_revision,p.status FROM stock_history h JOIN size_groups g ON g.id=h.group_id JOIN products p ON p.id=h.product_id WHERE h.product_id=? ORDER BY h.rowid DESC LIMIT 1').bind(pid).first<any>();
 if(!last||last.undo_of)throw new AppError(400,'Tidak ada perubahan stok terakhir yang dapat dibatalkan.');if(input.historyId!==last.id||last.current_revision!==last.after_revision||last.current_qty!==last.after_qty)throw new AppError(409,'Riwayat atau stok sudah berubah. Pembatalan ditolak agar stok tidak tertimpa.');if(last.before_qty==null&&last.status==='published')throw new AppError(400,'Stok terbit tidak dapat dikembalikan menjadi jumlah yang belum diketahui.');
 const hid=crypto.randomUUID(),now=new Date().toISOString();const result=await d.batch([
 d.prepare('INSERT INTO stock_history (id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at,undo_of) SELECT ?,g.id,g.product_id,g.qty,?,g.revision,g.revision+1,?,?,?,? FROM size_groups g WHERE g.id=? AND g.revision=? AND g.qty IS ? AND NOT EXISTS (SELECT 1 FROM stock_history WHERE undo_of=?) AND (SELECT id FROM stock_history WHERE product_id=? ORDER BY rowid DESC LIMIT 1)=?').bind(hid,last.before_qty,'Pembatalan: '+last.reason,actor,now,last.id,last.group_id,last.after_revision,last.after_qty,last.id,pid,last.id),
 d.prepare('UPDATE size_groups SET qty=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM stock_history WHERE id=?)').bind(last.before_qty,last.group_id,last.after_revision,hid),
 d.prepare('UPDATE products SET version=version+1,updated_at=?,last_mutation=? WHERE id=? AND EXISTS (SELECT 1 FROM stock_history WHERE id=?)').bind(now,hid,pid,hid),
 ]);if(result[0].meta.changes===0)throw new AppError(409,'Perubahan sudah dibatalkan atau stok telah berubah.');return readProduct(pid);
}
