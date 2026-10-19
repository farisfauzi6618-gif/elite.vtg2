import {createHmac,timingSafeEqual} from 'node:crypto';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
import {AppError,bucket,db} from './server';
import {photoMime} from './photos';
import {PRODUCT_PHOTO_UPLOAD_MAX_BYTES} from './product-photo';

type UploadTicket={v:1;key:string;actor:string;size:number;contentType:string;expires:number};
const types=['image/jpeg','image/png','image/webp'];
function secret(){const value=process.env.AUTH_SECRET||process.env.CONFIG_SECRET;if(!value||value.length<32)throw new AppError(503,'Konfigurasi upload belum tersedia.');return value}
function signature(payload:string){return createHmac('sha256',secret()).update('elite-photo-upload-v1:'+payload).digest('base64url')}
function decode(ticket:unknown,actor:string):UploadTicket{
 try{
  if(typeof ticket!=='string'||ticket.length>2000)throw Error();const [payload,mac,...extra]=ticket.split('.');if(extra.length||!payload||!mac)throw Error();
  const actual=Buffer.from(mac,'base64url'),expected=Buffer.from(signature(payload),'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();
  const value=JSON.parse(Buffer.from(payload,'base64url').toString()) as UploadTicket;
  if(value.v!==1||value.actor!==actor||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.key)||!Number.isSafeInteger(value.size)||value.size<32||value.size>PRODUCT_PHOTO_UPLOAD_MAX_BYTES||!types.includes(value.contentType)||!Number.isSafeInteger(value.expires)||value.expires<Date.now())throw Error();
  return value;
 }catch{throw new AppError(400,'Izin upload tidak valid atau kedaluwarsa. Pilih ulang foto.');}
}
export async function prepareDirectPhoto(input:Record<string,unknown>,actor:string){
 if(!Number.isSafeInteger(input.size)||Number(input.size)<32||Number(input.size)>PRODUCT_PHOTO_UPLOAD_MAX_BYTES||!types.includes(String(input.contentType)))throw new AppError(400,'Ukuran atau format foto tidak valid.');
 if(!process.env.BLOB_READ_WRITE_TOKEN)return {mode:'server' as const};
 const value:UploadTicket={v:1,key:crypto.randomUUID(),actor,size:Number(input.size),contentType:String(input.contentType),expires:Date.now()+10*60000};
 const pathname='elite/'+value.key;
 const clientToken=await generateClientTokenFromReadWriteToken({pathname,token:process.env.BLOB_READ_WRITE_TOKEN,allowedContentTypes:[value.contentType],maximumSizeInBytes:value.size,validUntil:value.expires,addRandomSuffix:false,allowOverwrite:false});
 const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
 return {mode:'direct' as const,pathname,photoKey:value.key,clientToken,ticket:payload+'.'+signature(payload)};
}
export async function completeDirectPhoto(input:Record<string,unknown>,actor:string){
 const value=decode(input.ticket,actor);
 const existing=await db().prepare('SELECT size,content_type,source FROM photos WHERE key=?').bind(value.key).first<{size:number;content_type:string;source:string}>();
 if(existing){if(existing.size!==value.size||existing.content_type!==value.contentType||existing.source!=='admin_direct_upload')throw new AppError(409,'Konfirmasi foto tidak cocok.');return {photoKey:value.key}}
 const file=await bucket().prefix(value.key);
 if(!file)throw new AppError(409,'Upload foto belum selesai. Coba lagi.');
 if(file.size!==value.size||file.contentType.split(';')[0]!==value.contentType||photoMime(file.bytes)!==value.contentType)throw new AppError(400,'File upload tidak cocok dengan foto yang dipilih.');
 // The upload token forbids overwrite, so completion retries can safely reuse the same UUID.
 await db().prepare("INSERT INTO photos(key,content_type,size,source,created_at) VALUES(?,?,?,'admin_direct_upload',?) ON CONFLICT(key) DO NOTHING").bind(value.key,value.contentType,value.size,new Date().toISOString()).run();
 return {photoKey:value.key};
}
