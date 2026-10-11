type Snapshot={etag:string;data:any};
type RequestOptions={fetcher?:typeof fetch;timeoutMs?:number;previous?:Snapshot;remember?:(snapshot:Snapshot)=>void};

export async function catalogRequest(path:string,init:RequestInit={},options:RequestOptions={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeoutMs??15000);
 const checkout=init.method==='POST';
 const retry=checkout?'Coba lagi. Pilihan barang tetap ada di keranjang.':'Coba perbarui stok kembali.';
 try{
  const response=await (options.fetcher??fetch)(path,{...init,signal:controller.signal});
  if(response.status===304&&options.previous){
   const previous=options.previous;
   // Vercel strips custom headers on 304; HTTP Date remains available (seconds).
   const clock=Date.parse(response.headers.get('X-ELITE-Server-Time')??response.headers.get('Date')??'');
   const data=typeof previous.data?.asOf==='string'&&Number.isFinite(clock)?{...previous.data,asOf:new Date(Math.max(clock,Date.parse(previous.data.asOf)||0)).toISOString()}:previous.data;
   options.remember?.({...previous,data});return data;
  }
  const data:any=await response.json();
  if(!response.ok)throw Object.assign(new Error(typeof data?.error==='string'?data.error:'Data belum dapat dimuat. '+retry),{status:response.status});
  const etag=response.headers.get('etag');if(etag)options.remember?.({etag,data});
  return data;
 }catch(error){
  if(controller.signal.aborted)throw new Error('Koneksi terlalu lama merespons. '+retry);
  if(error instanceof TypeError)throw new Error('Koneksi terputus. '+retry);
  if(error instanceof SyntaxError)throw new Error('Respons belum dapat dibaca. '+retry);
  throw error;
 }finally{clearTimeout(timer)}
}

// Component-owned, bounded snapshots; every read still reaches the server.
export function createCatalogReader(options:RequestOptions={}){
 const snapshots=new Map<string,Snapshot>(),pending=new Map<string,Promise<any>>();
 return function read(path:string):Promise<any>{
  const active=pending.get(path);if(active)return active;
  const previous=snapshots.get(path);
  const request=catalogRequest(path,{cache:'no-store',headers:previous?{'If-None-Match':previous.etag}:{}},{...options,previous,remember:snapshot=>{snapshots.delete(path);snapshots.set(path,snapshot);if(snapshots.size>8)snapshots.delete(snapshots.keys().next().value!);}})
   .catch(error=>{snapshots.delete(path);throw error}).finally(()=>{pending.delete(path)});
  pending.set(path,request);return request;
 };
}
