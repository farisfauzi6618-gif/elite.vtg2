import {prepareProductPhoto,PRODUCT_PHOTO_UPLOAD_MAX_BYTES} from './product-photo';
export type PhotoFailure={name:string;message:string};
const uploadError=(message:string)=>Object.assign(new Error(message),{uploadUserMessage:true});
async function uploadReply(reply:Response){
 let value:any=null;const raw=await reply.text();try{value=JSON.parse(raw)}catch{}
 if(!reply.ok){if(value&&typeof value.error==='string'&&value.error.length<=500)throw uploadError(value.error);throw uploadError(reply.status===413?'Foto ditolak karena ukuran upload. Pilih ulang foto agar diproses kembali.':reply.status===401||reply.status===403?'Sesi admin berakhir atau akses ditolak. Masuk kembali, lalu coba foto ini lagi.':reply.status===429?'Terlalu banyak upload sekaligus. Tunggu sebentar, lalu coba lagi.':'Foto belum dapat disimpan. Periksa koneksi, lalu coba lagi.');}
 return value;
}
export async function uploadProductPhoto(file:File,onPrepared?:()=>void):Promise<string>{
 const photo=await prepareProductPhoto(file);if(photo.size>PRODUCT_PHOTO_UPLOAD_MAX_BYTES)throw uploadError('Foto belum berhasil diperkecil. Pilih ulang atau ekspor sebagai JPG.');
 onPrepared?.();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);let value:any;
 const control=(body:Record<string,unknown>)=>fetch('/api/photos/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal}).then(uploadReply);
 try{
  const extension=photo.name.split('.').at(-1)?.toLowerCase(),contentType=photo.type.toLowerCase().replace('image/jpg','image/jpeg')||(extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg');
  const permission=await control({action:'prepare',size:photo.size,contentType});
  if(permission?.mode==='direct'){
   if(typeof permission.ticket!=='string'||typeof permission.clientToken!=='string'||!/^elite\/[a-f0-9-]{36}$/.test(permission.pathname))throw uploadError('Konfirmasi foto belum dapat dibaca. Pilih ulang foto.');
   const {put}=await import('@vercel/blob/client');
   await put(permission.pathname,photo,{access:'private',contentType,token:permission.clientToken,abortSignal:controller.signal});
   value=await control({action:'complete',ticket:permission.ticket});
  }else if(permission?.mode==='server'){
   // Local storage keeps the existing same-origin upload path.
   const form=new FormData();form.set('photo',photo);value=await uploadReply(await fetch('/api/photos',{method:'POST',body:form,signal:controller.signal}));
  }else throw uploadError('Konfirmasi foto belum dapat dibaca. Pilih ulang foto.');
 }catch(error){if(error instanceof Error&&(error as Error&{uploadUserMessage?:boolean}).uploadUserMessage)throw error;throw uploadError('Upload belum mendapat konfirmasi. Periksa koneksi, lalu coba foto ini lagi.')}
 finally{clearTimeout(timer)}
 if(!value||typeof value.photoKey!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.photoKey)))throw uploadError('Konfirmasi foto belum dapat dibaca. Muat ulang setelah menyimpan perubahan yang sudah berhasil.');
 return value.photoKey;
}
export async function uploadProductPhotos(files:File[],onPhoto:(key:string)=>void,onProgress:(position:number,total:number,phase:'prepare'|'upload')=>void){
 const failures:PhotoFailure[]=[];let uploaded=0;
 for(let index=0;index<files.length;index++){
  onProgress(index+1,files.length,'prepare');
  try{const key=await uploadProductPhoto(files[index],()=>onProgress(index+1,files.length,'upload'));onPhoto(key);uploaded++}catch(error){failures.push({name:files[index].name,message:error instanceof Error?error.message:'Foto belum berhasil diunggah. Coba lagi.'})}
 }
 return {uploaded,failures};
}
