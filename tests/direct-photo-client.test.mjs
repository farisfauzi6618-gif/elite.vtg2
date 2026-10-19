import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {build} from 'esbuild';
const key='11111111-2222-4333-8444-555555555555';
const bundle=await build({stdin:{contents:"export {uploadProductPhoto,uploadProductPhotos} from './modules/catalog/photo-upload';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'cjs',write:false,plugins:[{name:'simulated-blob',setup(b){b.onResolve({filter:/^@vercel\/blob\/client$/},()=>({path:'blob',namespace:'simulation'}));b.onLoad({filter:/.*/,namespace:'simulation'},()=>({contents:'export const put=(...args)=>globalThis.simulatedPut(...args);'}))}}]});
function browser(options={}){
 const calls=[],uploads=[],permission={mode:'direct',pathname:'elite/'+key,clientToken:'SIMULATED_SINGLE_FILE_TOKEN',ticket:'SIMULATED_SIGNED_TICKET',...options.permission};let active=0,maxActive=0;
 const context=vm.createContext({module:{exports:{}},File,Blob,FormData,Response,AbortController,Set,Map,Error,TypeError,Promise,Math,JSON,queueMicrotask,setTimeout,clearTimeout,URL:{createObjectURL:()=> 'blob:simulation',revokeObjectURL(){}},Image:class{naturalWidth=800;naturalHeight=1000;set src(value){queueMicrotask(()=>this.onload?.())}removeAttribute(){}},fetch:async(url,init)=>{
  const body=typeof init.body==='string'?JSON.parse(init.body):init.body;calls.push({url,body,signal:init.signal});
  if(options.controlError)return new Response(options.controlError,{status:options.status??503});
  if(body.action==='prepare')return Response.json(permission);
  return Response.json(options.confirmation??{photoKey:key});
 },simulatedPut:async(pathname,photo,settings)=>{active++;maxActive=Math.max(active,maxActive);uploads.push({pathname,photo,settings});try{if(options.putFails)throw Error('SIMULATED_BLOB_NETWORK_FAILURE');return {pathname}}finally{active--}}});
 vm.runInContext(bundle.outputFiles[0].text,context);return {api:context.module.exports,calls,uploads,maxActive:()=>maxActive};
}
const file=(type='image/jpeg',name='SIMULATED.jpg')=>new File([new Uint8Array(1000)],name,{type});
test('direct uploads send only metadata to the app and upload private bytes using a one-file token',async()=>{
 const b=browser();let prepared=0;assert.equal(await b.api.uploadProductPhoto(file(),()=>prepared++),key);assert.equal(prepared,1);assert.equal(b.calls.length,2);assert.deepEqual(b.calls.map(c=>c.url),['/api/photos/upload','/api/photos/upload']);assert.equal(b.calls[0].body.action,'prepare');assert.equal(b.calls[0].body.size,1000);assert.equal(b.calls[0].body.contentType,'image/jpeg');assert.equal(b.calls[1].body.action,'complete');assert.equal(b.calls[1].body.ticket,'SIMULATED_SIGNED_TICKET');assert.ok(JSON.stringify(b.calls.map(c=>c.body)).length<300);assert.equal(b.uploads.length,1);assert.equal(b.uploads[0].pathname,'elite/'+key);assert.equal(b.uploads[0].photo.size,1000);assert.equal(b.uploads[0].settings.access,'private');assert.equal(b.uploads[0].settings.token,'SIMULATED_SINGLE_FILE_TOKEN');assert.equal(b.calls[0].signal,b.uploads[0].settings.abortSignal);assert.equal(b.calls[0].signal,b.calls[1].signal);
});
test('MIME-less camera files and JPG aliases use a canonical MIME for the direct upload',async()=>{
 for(const [type,name,expected]of [['','FOTO.PNG','image/png'],['image/jpg','FOTO.JPG','image/jpeg'],['','FOTO.WEBP','image/webp']]){const b=browser();await b.api.uploadProductPhoto(file(type,name));assert.equal(b.calls[0].body.contentType,expected);assert.equal(b.uploads[0].settings.contentType,expected)}
});
test('a failed direct upload never silently retransmits the image through the app server',async()=>{
 const b=browser({putFails:true});await assert.rejects(b.api.uploadProductPhoto(file()),/Periksa koneksi/);assert.equal(b.calls.length,1);assert.equal(b.uploads.length,1);assert.ok(b.calls.every(c=>c.url==='/api/photos/upload'));
});
test('unexpected paths, malformed token replies and failed completion cannot become a gallery URL',async()=>{
 for(const permission of [{pathname:'labels/private-proof'},{clientToken:null},{ticket:null},{mode:'unknown'}]){const b=browser({permission});await assert.rejects(b.api.uploadProductPhoto(file()),/Konfirmasi foto/);assert.equal(b.uploads.length,0)}
 const b=browser({confirmation:{photoKey:'https://evil.test/file'}});await assert.rejects(b.api.uploadProductPhoto(file()),/Konfirmasi foto/);
});
test('HTML, expired auth, and partial batch failures retain clear errors and successful photos',async()=>{
 const denied=browser({controlError:'',status:401}); // A real error body is deliberately plain text.
 const auth=browser({controlError:'AUTH_REQUIRED',status:401});await assert.rejects(auth.api.uploadProductPhoto(file()),/Masuk kembali/);
 const html=browser({controlError:'<html>502</html>'});await assert.rejects(html.api.uploadProductPhoto(file()),/Foto belum/);
 const b=browser(),saved=[];const result=await b.api.uploadProductPhotos([file(),new File(['bad'],'bad.svg',{type:'image/svg+xml'}),file()],id=>saved.push(id),()=>{});assert.equal(result.uploaded,2);assert.equal(result.failures.length,1);assert.equal(saved.length,2);assert.equal(b.maxActive(),1);assert.equal(b.uploads.length,2);
});
