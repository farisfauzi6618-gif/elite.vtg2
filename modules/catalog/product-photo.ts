/** Large originals are prepared on the device, below Vercel's request limit. */
export const PRODUCT_PHOTO_INPUT_MAX_BYTES=30*1024*1024;
export const PRODUCT_PHOTO_UPLOAD_MAX_BYTES=3.5*1024*1024;
export const PRODUCT_PHOTO_ACCEPT='image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
const MAX_SOURCE_PIXELS=64_000_000,MAX_EDGE=3072;
const TYPES=new Set(['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']);
const EXTENSIONS=new Map([['jpg','image/jpeg'],['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp'],['heic','image/heic'],['heif','image/heif']]);
function encode(canvas:HTMLCanvasElement,quality:number):Promise<Blob>{return new Promise((resolve,reject)=>{canvas.toBlob(blob=>blob?.type==='image/jpeg'&&blob.size>=32?resolve(blob):reject(new Error('Foto belum dapat diproses. Pilih ulang foto atau ekspor sebagai JPG.')),'image/jpeg',quality)})}
export async function prepareProductPhoto(file:File):Promise<File>{
 const type=file.type.toLowerCase()||EXTENSIONS.get(file.name.split('.').at(-1)?.toLowerCase()??'');
 if(!type||!TYPES.has(type))throw new Error('Gunakan foto JPG, PNG, WebP, atau HEIC/HEIF dari iPhone yang mendukungnya.');
 if(file.size<32)throw new Error('File foto kosong atau rusak. Pilih kembali foto.');
 if(file.size>PRODUCT_PHOTO_INPUT_MAX_BYTES)throw new Error('Foto maksimal 30 MB per file. Ekspor versi JPG yang lebih kecil.');
 const heic=type==='image/heic'||type==='image/heif',url=URL.createObjectURL(file),image=new Image();let canvas:HTMLCanvasElement|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Foto belum dapat dibaca. Pilih ulang atau ekspor sebagai JPG.')),20000);image.onload=()=>{clearTimeout(timer);resolve()};image.onerror=()=>{clearTimeout(timer);reject(new Error(heic?'Browser ini belum bisa membaca HEIC/HEIF. Buka melalui Safari terbaru di iPhone atau ekspor foto sebagai JPG.':'Foto tidak dapat dibaca. Pilih ulang atau ekspor sebagai JPG.'))};image.src=url});
  const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width*height>MAX_SOURCE_PIXELS)throw new Error('Resolusi foto terlalu besar. Ekspor JPG dengan resolusi lebih kecil; foto hingga 48 MP didukung.');
  // Keep small, already sharp photos intact. Large images retain their full framing.
  if(!heic&&file.size<=1024*1024&&Math.max(width,height)<=MAX_EDGE)return file;
  canvas=document.createElement('canvas');const context=canvas.getContext('2d');if(!context)throw new Error('Foto belum dapat diproses. Pilih ulang atau ekspor sebagai JPG.');
  const edge=Math.min(MAX_EDGE,Math.max(width,height));
  for(const target of [edge,Math.min(edge,2560),Math.min(edge,2048)].filter((value,index,list)=>list.indexOf(value)===index)){
   const scale=Math.min(1,target/width,target/height);canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [0.94,0.90,0.86]){
    const blob=await encode(canvas,quality);
    if(!heic&&scale===1&&file.size<=PRODUCT_PHOTO_UPLOAD_MAX_BYTES&&blob.size>=file.size)return file;
    if(blob.size<=PRODUCT_PHOTO_UPLOAD_MAX_BYTES)return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'foto-produk')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
   }
  }
  throw new Error('Foto masih terlalu besar setelah diproses. Ekspor versi JPG yang lebih kecil.');
 }finally{image.onload=image.onerror=null;image.removeAttribute('src');URL.revokeObjectURL(url);if(canvas){canvas.width=0;canvas.height=0}}
}
