import {AppError,textValue,integerValue,optionalText} from './server';
import type {ColorVariant} from './color-variants';
import type {Product,SizeGroup} from './catalog-types';
export async function validateColors(input:any,current:Product,groups:SizeGroup[],photos:(key:string|null,keys:unknown)=>Promise<string[]>){
 const raw=input.colorVariants??current.colorVariants??[];
 if(!Array.isArray(raw)||raw.length>20)throw new AppError(400,'Maksimal 20 warna per produk.');
 const ids=new Set<string>(),variants:ColorVariant[]=[];
 for(const v of raw){
  if(!v||typeof v!=='object'||!/^[a-f0-9-]{36}$/i.test(v.id)||ids.has(v.id))throw new AppError(400,'Identitas warna tidak valid atau ganda.');ids.add(v.id);
  const name=textValue(v.name,80),hex=textValue(v.hex,7),swatchType=v.swatchType??'COLOR',swatchImage=optionalText(v.swatchImage,100),photoKey=optionalText(v.photoKey,100);
  if(!name||!/^#[a-f0-9]{6}$/i.test(hex)||!['COLOR','IMAGE'].includes(swatchType)||typeof v.active!=='boolean')throw new AppError(400,'Isi nama warna dan kode HEX yang valid.');
  const photoKeys=await photos(photoKey,v.photoKeys??[]);if(swatchType==='IMAGE'){if(!swatchImage)throw new AppError(400,'Pilih foto untuk pattern swatch.');await photos(swatchImage,[]);}
  if(v.active&&!photoKey)throw new AppError(400,'Warna aktif membutuhkan foto utama.');
  variants.push({id:v.id,name,hex,swatchType,swatchImage,active:v.active,photoKey,photoKeys,price:integerValue(v.price,'Harga warna'),condition:optionalText(v.condition),defects:optionalText(v.defects)??'None'});
 }
 for(const old of current.colorVariants??[])if(!ids.has(old.id))throw new AppError(400,'Warna tersimpan tidak dapat dihapus. Nonaktifkan agar riwayat tetap tersimpan.');
 if(variants.length&&groups.some(g=>!g.colorVariantId||!ids.has(g.colorVariantId)))throw new AppError(400,'Setiap ukuran harus terhubung ke warna.');
 if(!variants.length&&groups.some(g=>g.colorVariantId))throw new AppError(400,'Warna kelompok ukuran tidak ditemukan.');
 for(const old of current.groups){const next=groups.find(g=>g.id===old.id);if(old.colorVariantId&&(next?.colorVariantId??null)!==old.colorVariantId)throw new AppError(400,'Warna ukuran tersimpan tidak dapat dipindah karena mempunyai riwayat.');if((old.reservedQty??0)>0&&!variants.find(v=>v.id===next?.colorVariantId)?.active&&old.colorVariantId)throw new AppError(409,'Warna dengan Reserve aktif tidak dapat dinonaktifkan.');}
 if(input.status==='published'&&variants.length&&!variants.some(v=>v.active))throw new AppError(400,'Produk terbit membutuhkan minimal satu warna aktif.');
 const active=variants.filter(v=>v.active),defaultId=textValue(input.defaultColorVariantId??current.defaultColorVariantId,100)||active[0]?.id||variants[0]?.id||null;
 if(defaultId&&!ids.has(defaultId))throw new AppError(400,'Warna default tidak ditemukan.');
 return {variants,defaultId};
}
