import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('.test-runtime',{recursive:true});
const output=path.resolve('.test-runtime/catalog-request.mjs');
await build({entryPoints:['modules/catalog/catalog-request.ts'],bundle:true,platform:'node',format:'esm',outfile:output});
const {catalogRequest}=await import(pathToFileURL(output));
after(()=>rm(output,{force:true}));

test('checkout submits the selected lines once and keeps the server destination',async()=>{
 let calls=0;
 const body=JSON.stringify({lines:[{productId:'product',groupId:'size',quantity:1}]});
 const result=await catalogRequest('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body},{fetcher:async(url,init)=>{
  calls++;assert.equal(url,'/api/checkout');assert.equal(init.method,'POST');assert.equal(init.body,body);assert.equal(init.headers['Content-Type'],'application/json');assert.equal(init.signal.aborted,false);
  return Response.json({url:'/order?catalog='+'a'.repeat(64)},{status:201});
 }});
 assert.equal(calls,1);assert.equal(result.url,'/order?catalog='+'a'.repeat(64));
});
test('product removal and stock conflict retain the server status and message',async()=>{
 for(const status of [404,409])await assert.rejects(catalogRequest('/api/products/product',{}, {fetcher:async()=>Response.json({error:'Stok pilihan berubah.'},{status})}),error=>error.status===status&&error.message==='Stok pilihan berubah.');
});
test('network failures give a useful retry message without replaying checkout',async()=>{
 let calls=0;
 await assert.rejects(catalogRequest('/api/checkout',{method:'POST'},{fetcher:async()=>{calls++;throw new TypeError('Failed to fetch');}}),/Koneksi terputus.*Pilihan barang tetap ada di keranjang/);
 assert.equal(calls,1);
});
test('a stalled request aborts and a later explicit checkout can succeed',async()=>{
 let calls=0,aborted=false;
 await assert.rejects(catalogRequest('/api/checkout',{method:'POST'},{timeoutMs:15,fetcher:async(_url,init)=>{
  calls++;return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}));
 }}),/Koneksi terlalu lama merespons/);
 assert.equal(aborted,true);assert.equal(calls,1);
 const retry=await catalogRequest('/api/checkout',{method:'POST'},{fetcher:async()=>Response.json({url:'/order?catalog='+'b'.repeat(64)})});
 assert.ok(retry.url);assert.equal(calls,1);
});
test('unreadable stock responses show a refresh action',async()=>{
 await assert.rejects(catalogRequest('/api/catalog',{}, {fetcher:async()=>new Response('<html>temporarily unavailable</html>',{status:503})}),/Respons belum dapat dibaca.*perbarui stok/);
});
