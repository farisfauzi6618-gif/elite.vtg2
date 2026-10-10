import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('.test-runtime',{recursive:true});
const compiled=await build({stdin:{contents:`export {storage} from './lib/storage';export {createQrisAvailabilityProbe} from './modules/order/qris-availability';export {calls,reset,missing} from '@vercel/blob';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolated-blob',setup(b){b.onResolve({filter:/^@vercel\/blob$/},()=>({path:'mock',namespace:'blob'}));b.onLoad({filter:/.*/,namespace:'blob'},()=>({contents:`export const calls=[];export let missing=false;export const reset=(value=false)=>{calls.length=0;missing=value;};export class BlobNotFoundError extends Error{};export async function head(key,options){calls.push({operation:'head',key,options});if(missing)throw new BlobNotFoundError();return {size:80,contentType:'image/png'};}export async function get(key,options){calls.push({operation:'get',key,options});return {stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();}}),blob:{size:1,contentType:'image/png'}};}export const put=async()=>{};export const del=async()=>{};`,loader:'js'}));}}]});
await writeFile('.test-runtime/blob-cache.mjs',compiled.outputFiles[0].contents);
const m=await import(pathToFileURL(path.resolve('.test-runtime/blob-cache.mjs')));
const originalToken=process.env.BLOB_READ_WRITE_TOKEN;
test('metadata uses the Blob metadata API without downloading a body',async()=>{
 process.env.BLOB_READ_WRITE_TOKEN='SIMULATED_TOKEN';m.reset();
 assert.equal((await m.storage.head('qris/simulation')).size,80);
 assert.deepEqual(m.calls.map(c=>c.operation),['head']);
 m.reset(true);assert.equal(await m.storage.head('qris/missing'),null);
});
test('only explicit immutable photo reads use private Blob CDN caching',async()=>{
 m.reset();
 for(const [key,options] of [['proof/simulation',undefined],['labels/simulation/official.pdf',undefined],['qris/simulation',undefined],['photo-simulation',{useCache:true}]]){const file=await m.storage.get(key,options);await file.arrayBuffer();}
 assert.deepEqual(m.calls.map(c=>c.options.useCache),[false,false,false,true]);
 assert.ok(m.calls.every(c=>c.options.access==='private'));
 if(originalToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=originalToken;
});
const asset={key:'qris/simulation',mime:'image/png',sha256:'a'.repeat(64)};
test('120 sequential readiness checks share one metadata request per 60 seconds',async()=>{
 let time=0,calls=0;const probe=m.createQrisAvailabilityProbe(()=>time),bucket={head:async()=>{calls++;return {size:80,httpMetadata:{contentType:'image/png'}};}};
 for(let i=0;i<120;i++)assert.equal(await probe(bucket,asset),true);
 assert.equal(calls,1);time=59999;await probe(bucket,asset);assert.equal(calls,1);time=60000;await probe(bucket,asset);assert.equal(calls,2);
});
test('concurrent readiness checks share the same in-flight request',async()=>{
 let finish,calls=0;const bucket={head:()=>{calls++;return new Promise(r=>{finish=r;});}},probe=m.createQrisAvailabilityProbe(()=>0);
 const requests=Array.from({length:20},()=>probe(bucket,asset));assert.equal(calls,1);finish({size:80,httpMetadata:{contentType:'image/png'}});assert.ok((await Promise.all(requests)).every(Boolean));
});
test('readiness cache changes immediately with deployment asset identity or store',async()=>{
 let calls=0;const bucket={head:async()=>{calls++;return {size:80};}},probe=m.createQrisAvailabilityProbe(()=>0);
 await probe(bucket,asset);await probe(bucket,{...asset,key:'qris/replaced'});await probe(bucket,{...asset,sha256:'b'.repeat(64)});await probe({...bucket},asset);assert.equal(calls,4);
});
test('missing or invalid metadata expires quickly and can recover',async()=>{
 let time=0,value=null,calls=0;const bucket={head:async()=>{calls++;return value;}},probe=m.createQrisAvailabilityProbe(()=>time);
 assert.equal(await probe(bucket,asset),false);value={size:80,httpMetadata:{contentType:'image/png'}};time=4999;assert.equal(await probe(bucket,asset),false);time=5000;assert.equal(await probe(bucket,asset),true);assert.equal(calls,2);
 for(const value of [{size:31},{size:4194305},{size:80,httpMetadata:{contentType:'text/html'}}])assert.equal(await m.createQrisAvailabilityProbe()({head:async()=>value},asset),false);
});
