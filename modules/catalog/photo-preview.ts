import sharp from 'sharp';
import {bucket} from './server';

export const PHOTO_PREVIEW_EDGES={thumb:240,cardSmall:480,card:800,detail:1600} as const;
export type PhotoPreviewSize=keyof typeof PHOTO_PREVIEW_EDGES;
type PhotoBytes={body:Uint8Array;contentType:string};
type Entry<T>={value:T;expires:number;bytes:number};
class ByteCache<T>{
 private entries=new Map<string,Entry<T>>();private total=0;
 constructor(private limit:number,private ttl:number,private clock:()=>number){}
 get(key:string){const entry=this.entries.get(key);if(!entry)return;if(entry.expires<=this.clock()){this.remove(key);return}this.entries.delete(key);this.entries.set(key,entry);return entry.value}
 set(key:string,value:T,bytes:number){this.remove(key);if(bytes>this.limit)return;while(this.total+bytes>this.limit&&this.entries.size)this.remove(this.entries.keys().next().value!);this.entries.set(key,{value,bytes,expires:this.clock()+this.ttl});this.total+=bytes}
 private remove(key:string){const entry=this.entries.get(key);if(entry){this.total-=entry.bytes;this.entries.delete(key)}}
}
export async function renderPhotoPreview(source:PhotoBytes,size:PhotoPreviewSize):Promise<PhotoBytes>{
 if(source.body.byteLength<=16*1024)return source;
 try{
  const image=sharp(source.body,{limitInputPixels:64_000_000}),metadata=await image.metadata();
  if((metadata.pages??1)>1)return source;
  const edge=PHOTO_PREVIEW_EDGES[size],output=await image.rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality:88,effort:3}).toBuffer();
  return output.length<source.body.byteLength?{body:new Uint8Array(output),contentType:'image/webp'}:source;
 }catch{return source} // A decoder failure must not break an existing product photo.
}
// Every HTTP request still checks publication/owner access before this cache.
// Originals live briefly for adjacent gallery variants; previews are bounded per process.
export function createPhotoPreviewCache(load:(key:string)=>Promise<PhotoBytes|null>,options:{clock?:()=>number;sourceLimit?:number;previewLimit?:number;sourceTtl?:number;previewTtl?:number;namespace?:()=>string;render?:typeof renderPhotoPreview}={}){
 const clock=options.clock??Date.now,sources=new ByteCache<PhotoBytes>(options.sourceLimit??16*1024*1024,options.sourceTtl??60_000,clock),previews=new ByteCache<PhotoBytes>(options.previewLimit??32*1024*1024,options.previewTtl??3600_000,clock),sourcePending=new Map<string,Promise<PhotoBytes|null>>(),pending=new Map<string,Promise<PhotoBytes|null>>();
 let active=0;const waiting:Array<()=>void>=[];
 const enter=async()=>{if(active<2){active++;return}await new Promise<void>(resolve=>waiting.push(resolve))};
 const leave=()=>{const next=waiting.shift();if(next)next();else active--};
 async function source(key:string){const id=(options.namespace?.()??'')+':'+key,cached=sources.get(id);if(cached)return cached;const current=sourcePending.get(id);if(current)return current;const request=load(key).then(value=>{if(value)sources.set(id,value,value.body.byteLength);return value}).finally(()=>sourcePending.delete(id));sourcePending.set(id,request);return request}
 return function preview(key:string,size:PhotoPreviewSize):Promise<PhotoBytes|null>{
  const id=(options.namespace?.()??'')+':'+key+':'+size,cached=previews.get(id);if(cached)return Promise.resolve(cached);const current=pending.get(id);if(current)return current;
  const request=(async()=>{await enter();try{const original=await source(key);if(!original)return null;const result=await(options.render??renderPhotoPreview)(original,size);previews.set(id,result,result.body.byteLength);return result}finally{leave()}})().finally(()=>pending.delete(id));pending.set(id,request);return request;
 };
}
const namespace=()=>process.env.BLOB_STORE_ID??process.env.TURSO_DATABASE_URL??'local';
async function loadPhoto(key:string,useCache:boolean){const object=await bucket().get(key,{useCache});if(!object)return null;if(object.size>8*1024*1024){if(object.body instanceof ReadableStream)await object.body.cancel();return null}return {body:new Uint8Array(await object.arrayBuffer()),contentType:object.httpMetadata?.contentType??'image/jpeg'}}
const previews=createPhotoPreviewCache(key=>loadPhoto(key,true),{namespace});
// Drafts never opt into the Blob shared cache. Authorization is checked by the
// route on every request, including before returning these in-memory bytes.
const privatePreviews=createPhotoPreviewCache(key=>loadPhoto(key,false),{namespace,sourceLimit:8*1024*1024,previewLimit:16*1024*1024,previewTtl:60_000});
export function photoPreview(key:string,size:PhotoPreviewSize,published=true){return (published?previews:privatePreviews)(key,size)}
