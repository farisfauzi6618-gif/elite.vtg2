type RequestOptions={fetcher?:typeof fetch;timeoutMs?:number};

export async function catalogRequest(path:string,init:RequestInit={},options:RequestOptions={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeoutMs??15000);
 const checkout=init.method==='POST';
 const retry=checkout?'Coba lagi. Pilihan barang tetap ada di keranjang.':'Coba perbarui stok kembali.';
 try{
  const response=await (options.fetcher??fetch)(path,{...init,signal:controller.signal});
  const data:any=await response.json();
  if(!response.ok)throw Object.assign(new Error(typeof data?.error==='string'?data.error:'Data belum dapat dimuat. '+retry),{status:response.status});
  return data;
 }catch(error){
  if(controller.signal.aborted)throw new Error('Koneksi terlalu lama merespons. '+retry);
  if(error instanceof TypeError)throw new Error('Koneksi terputus. '+retry);
  if(error instanceof SyntaxError)throw new Error('Respons belum dapat dibaca. '+retry);
  throw error;
 }finally{clearTimeout(timer)}
}
