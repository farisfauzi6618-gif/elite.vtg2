import { AppError } from '@/modules/order/order-server';
/** Count actual bytes, including chunked requests without Content-Length. */
export async function readLimitedBytes(request:Request,max:number):Promise<Uint8Array>{
 if(Number(request.headers.get('content-length')||0)>max)throw new AppError(413,'Data terlalu besar.');
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new AppError(413,'Data terlalu besar.');chunks.push(value)}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes;
}
export async function readLimitedText(request:Request,max:number){return new TextDecoder().decode(await readLimitedBytes(request,max))}
export async function readLimitedForm(request:Request,max:number){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;'))throw new AppError(415,'Gunakan formulir unggahan aplikasi.');
 const bytes=await readLimitedBytes(request,max);
 try{return await new Response(bytes as unknown as BodyInit,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData()}catch{throw new AppError(400,'Formulir unggahan tidak valid.')}
}
