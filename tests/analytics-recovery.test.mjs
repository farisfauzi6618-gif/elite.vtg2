import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const file=path.resolve('.test-runtime/tests/analytics-recovery.mjs');await mkdir(path.dirname(file),{recursive:true});
await build({stdin:{contents:`export {createAnalyticsTransport} from './modules/analytics/transport';export {imageObservers} from './modules/analytics/images';export {analyticsPath} from './modules/analytics/paths';export {safeError} from './lib/safe-error';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:file});
const m=await import(pathToFileURL(file));
function fixture(reply){let now=1000;const timers=[],sent=[];const transport=m.createAnalyticsTransport({now:()=>now,schedule:(fn,delay)=>timers.push({fn,at:now+delay}),visit:()=>({event:'visit',path:'/order',utm_source:'instagram'}),send:async p=>{sent.push({...p});return reply(p)}});return {transport,sent,timers,advance:async(ms)=>{now+=ms;const due=timers.filter(t=>t.at<=now);for(const t of due){timers.splice(timers.indexOf(t),1);t.fn()}await transport.init()}}}
test('failed session initialization recovers and replays the same event only after acknowledgement',async()=>{
 let visits=0;const f=fixture(p=>p.event==='visit'&&++visits===1?'retry':'ready');
 f.transport.track({event:'error',id:'stable',code:'critical_image'},'error-once');await f.transport.init();
 assert.deepEqual(f.sent.map(p=>p.event),['visit']);
 await f.advance(2000);assert.deepEqual(f.sent.map(p=>p.event),['visit','visit','error']);
 assert.equal(f.sent.at(-1).id,'stable');f.transport.track({event:'error',id:'duplicate'},'error-once');await f.transport.init();assert.equal(f.sent.length,3);
});
test('a lost event acknowledgement retries with its original identifier and reinitializes session',async()=>{
 let attempts=0;const f=fixture(p=>p.event==='visit'?'ready':++attempts===1?'retry':'ready');
 f.transport.track({event:'add_to_cart',id:'same-id'});await f.transport.init();await f.advance(2000);
 assert.deepEqual(f.sent.filter(p=>p.event==='add_to_cart').map(p=>p.id),['same-id','same-id']);
 assert.equal(f.sent.filter(p=>p.event==='visit').length,2);
});
test('persistent failure has three automatic attempts and preserves bounded, expiring events',async()=>{
 let online=false;const f=fixture(()=>online?'ready':'retry');
 for(let i=0;i<100;i++)f.transport.track({event:'error',id:String(i)});
 await f.transport.init();await f.advance(2000);await f.advance(2000);assert.equal(f.sent.length,3);assert.equal(f.timers.length,0);
 for(let i=0;i<10;i++)await f.transport.resume();assert.equal(f.sent.length,3);
 online=true;await f.advance(60_000);assert.equal(f.sent.filter(p=>p.event==='error').length,32);
 const expired=fixture(()=> 'retry');expired.transport.track({event:'error',id:'expired'});await expired.transport.init();await expired.advance(300_001);
 assert.ok(!expired.sent.some(p=>p.event==='error'));
});
test('excluded staff never retries, flushes pending data or emits customer events',async()=>{
 const f=fixture(()=> 'excluded');f.transport.track({event:'error'});await f.transport.init();f.transport.track({event:'product_view'});await f.transport.resume();assert.equal(f.sent.length,1);assert.equal(f.timers.length,0);
});
test('a network exception cannot reject initialization or interrupt buying',async()=>{
 const f=fixture(()=>{throw new TypeError('SIMULATED_OFFLINE')});await assert.doesNotReject(f.transport.init());assert.equal(f.timers.length,1);
});
function image(){return {dataset:{photoKey:'fixture-key',productId:'fixture-product'},src:'/api/product-images/fixture-key?size=detail',getAttribute(n){return this[n]},classList:{contains:n=>n==='detail-main-photo'},closest:()=>null}}
test('preview recovery is separate from final product failure and QRIS failure',()=>{
 const emitted=[],o=m.imageObservers((event,details)=>emitted.push({event,...details})),img=image();
 o.error(img);assert.equal(emitted.length,0);img.src='/api/photos/fixture-key';o.load(img);assert.deepEqual(emitted,[{event:'image_recovered',productId:'fixture-product'}]);
 o.error(img);assert.deepEqual(emitted.at(-1),{event:'error',code:'critical_image',productId:'fixture-product'});
 const qris=image();qris.closest=()=>({});o.error(qris);assert.deepEqual(emitted.at(-1),{event:'error',code:'qris_image_error'});
});
test('changing gallery photos cannot report a stale preview as recovered',()=>{const emitted=[],o=m.imageObservers((...v)=>emitted.push(v)),img=image();o.error(img);img.dataset.photoKey='other-key';img.src='/api/photos/other-key';o.load(img);assert.equal(emitted.length,0)});
test('tracked continuation routes accept only pathname, never invoice or token URLs',()=>{
 for(const p of ['/','/produk/fixture','/order','/order/lanjutkan','/pesanan','/lacak'])assert.equal(m.analyticsPath(p),true);
 for(const p of ['/lacak?invoice=EV-SECRET','/order/lanjutkan#SECRET','/admin','/api/order','/produk/p/extra',null])assert.equal(m.analyticsPath(p),false);
});
test('safe diagnostics preserve allowlisted database category while discarding raw secrets',()=>{
 const e=Object.assign(new Error('SECRET SQL TOKEN URL'),{name:'LibsqlError',code:'SQLITE_BUSY',cause:{code:'SECRET'}});assert.deepEqual(m.safeError(e),{name:'LibsqlError',code:'SQLITE_BUSY'});assert.equal(JSON.stringify(m.safeError({name:'SECRET',code:'SECRET',cause:{code:'SECRET'}})).includes('SECRET'),false);
});
