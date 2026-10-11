import {prepareProductPhoto,PRODUCT_PHOTO_UPLOAD_MAX_BYTES} from './product-photo';
export type PhotoFailure={name:string;message:string};
export async function uploadProductPhoto(file:File,onPrepared?:()=>void):Promise<string>{
 const photo=await prepareProductPhoto(file);if(photo.size>PRODUCT_PHOTO_UPLOAD_MAX_BYTES)throw new Error('Foto belum berhasil diperkecil. Pilih ulang atau ekspor sebagai JPG.');
 const form=new FormData();form.set('photo',photo);onPrepared?.();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);let reply:Response,raw:string;
 try{reply=await fetch('/api/photos',{method:'POST',body:form,signal:controller.signal});raw=await reply.text()}catch{throw new Error('Upload belum mendapat konfirmasi. Periksa koneksi, lalu coba foto ini lagi.')}finally{clearTimeout(timer)}
 // Vercel/proxy errors can be plain text, HTML or empty, including on Safari.
 let value:any=null;try{value=JSON.parse(raw)}catch{}
 if(!reply.ok){if(value&&typeof value.error==='string'&&value.error.length<=500)throw new Error(value.error);throw new Error(reply.status===413?'Foto ditolak karena ukuran upload. Pilih ulang foto agar diproses kembali.':reply.status===401||reply.status===403?'Sesi admin berakhir atau akses ditolak. Masuk kembali, lalu coba foto ini lagi.':reply.status===429?'Terlalu banyak upload sekaligus. Tunggu sebentar, lalu coba lagi.':'Foto belum dapat disimpan. Periksa koneksi, lalu coba lagi.');}
 if(!value||typeof value.photoKey!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.photoKey)))throw new Error('Konfirmasi foto belum dapat dibaca. Muat ulang setelah menyimpan perubahan yang sudah berhasil.');
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
