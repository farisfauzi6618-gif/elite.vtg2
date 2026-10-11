import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
await mkdir('.test-runtime',{recursive:true});const file=path.resolve('.test-runtime/efficiency-client.mjs');
await build({stdin:{contents:`export * from './modules/catalog/catalog-request';export * from './modules/catalog/customer-request';export * from './modules/catalog/visible-refresh';export * from './modules/catalog/conditional-response';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:file});
const m=await import(pathToFileURL(file));after(()=>rm(file,{force:true}));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('simultaneous account consumers share one request and later reads stay fresh',async()=>{
 let calls=0;const gate=deferred(),reader=m.createCustomerReader(async(_url,init)=>{calls++;assert.equal(init.cache,'no-store');return calls===1?gate.promise:Response.json({customer:null})});
 const a=reader.read(),b=reader.read();assert.equal(calls,1);gate.resolve(Response.json({customer:{id:'simulation'}}));assert.deepEqual(await a,await b);await reader.read();assert.equal(calls,2);
});
test('login/logout invalidation prevents an older account response from winning',async()=>{
 let calls=0;const gate=deferred(),reader=m.createCustomerReader(async()=>++calls===1?gate.promise:Response.json({customer:null,promotion:{state:'guest'}}));
 const old=reader.read();reader.invalidate();const current=reader.read();gate.resolve(Response.json({customer:{id:'previous-account'}}));assert.equal((await old).customer,null);assert.equal((await current).customer,null);assert.ok(calls>=2&&calls<=3); // A late retired flight may revalidate after the new flight has completed.
});
test('account failures clear the flight and permit an explicit retry',async()=>{
 let calls=0;const reader=m.createCustomerReader(async()=>++calls===1?new Response(null,{status:503}):Response.json({customer:null}));await assert.rejects(reader.read());await reader.read();assert.equal(calls,2);
});
test('unchanged inventory uses a bodyless response while server time advances',async()=>{
 const payload={products:[{id:'test',qty:1}],asOf:'2026-10-11T00:00:00Z'};let calls=0;
 const read=m.createCatalogReader({fetcher:async(url,init)=>{calls++;assert.equal(init.cache,'no-store');return m.conditionalResponse(new Request('https://elite.test'+url,{headers:init.headers}),{...payload,asOf:'2026-10-11T00:00:'+String(calls).padStart(2,'0')+'Z'})}});
 const initial=await read('/api/catalog'),fresh=await read('/api/catalog');assert.deepEqual(initial.products,fresh.products);assert.notEqual(initial.asOf,fresh.asOf);assert.equal(calls,2);
 const reply=m.conditionalResponse(new Request('https://elite.test/api/catalog'),payload),etag=reply.headers.get('etag');
 const unchanged=m.conditionalResponse(new Request('https://elite.test/api/catalog',{headers:{'If-None-Match':etag}}),{...payload,asOf:'later'});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');assert.equal(unchanged.headers.get('Cache-Control'),'private, no-store');assert.equal(unchanged.headers.get('Vary'),'Cookie');
});
test('conditional reader coalesces parallel reads and forgets snapshots after errors',async()=>{
 const gate=deferred();let calls=0,fail=false;const read=m.createCatalogReader({fetcher:async(url,init)=>{calls++;if(calls===1)return gate.promise;if(fail)return Response.json({error:'Expired'},{status:401});assert.equal(new Headers(init.headers).has('If-None-Match'),false);return Response.json({products:[]});}});
 const a=read('/api/admin/katalog'),b=read('/api/admin/katalog');assert.equal(calls,1);gate.resolve(Response.json({products:[]},{headers:{etag:'W/"test"'}}));await Promise.all([a,b]);fail=true;await assert.rejects(read('/api/admin/katalog'),e=>e.status===401);fail=false;await read('/api/admin/katalog');assert.equal(calls,3);
});
test('Vercel 304 clock fallback uses HTTP Date and never rewinds a saved timestamp',async()=>{
 let calls=0;const read=m.createCatalogReader({fetcher:async()=>{calls++;if(calls===1)return Response.json({products:[],asOf:'2026-10-11T00:00:00.750Z'},{headers:{etag:'W/"clock"'}});return new Response(null,{status:304,headers:{Date:calls===2?'Sun, 11 Oct 2026 00:00:15 GMT':'Sun, 11 Oct 2026 00:00:14 GMT'}})}});
 const initial=await read('/api/catalog'),fresh=await read('/api/catalog'),later=await read('/api/catalog');assert.ok(Date.parse(fresh.asOf)>Date.parse(initial.asOf));assert.equal(fresh.asOf,'2026-10-11T00:00:15.000Z');assert.equal(later.asOf,fresh.asOf);
});
test('conditional snapshots are bounded and never shared across readers',async()=>{
 const headers=[];const fetcher=async(url,init)=>{headers.push(new Headers(init.headers).get('If-None-Match'));return Response.json({id:url},{headers:{etag:'W/"test"'}})};const read=m.createCatalogReader({fetcher});for(let i=0;i<9;i++)await read('/api/products/'+i);await read('/api/products/0');await m.createCatalogReader({fetcher})('/api/products/8');assert.ok(headers.every(h=>h===null));
});
test('visibility pauses polls, coalesces return events, resumes immediately and cleans up',()=>{
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';let tick,wake,calls=0,clearedInterval=0;const timers=new Map();let id=0;
 const env={window:win,document:doc,setInterval:fn=>{tick=fn;return ++id},clearInterval:()=>{clearedInterval++},setTimeout:fn=>{const key=++id;timers.set(key,fn);return key},clearTimeout:key=>timers.delete(key)};
 const stop=m.visibleRefresh(()=>calls++,15000,env);tick();assert.equal(calls,1);doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('focus'));tick();assert.equal(calls,1);assert.equal(timers.size,0);
 doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('focus'));win.dispatchEvent(new Event('pageshow'));assert.equal(timers.size,1);for(const [key,fn] of timers){timers.delete(key);fn()}assert.equal(calls,2);tick();assert.equal(calls,3);win.dispatchEvent(new Event('focus'));stop();assert.equal(timers.size,0);assert.equal(clearedInterval,1);win.dispatchEvent(new Event('focus'));assert.equal(timers.size,0);
});
test('browser timer methods keep their Window receiver',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';let tick,wake,calls=0;
 win.setInterval=function(fn){assert.equal(this,win);tick=fn;return 1};win.clearInterval=function(){assert.equal(this,win)};win.setTimeout=function(fn){assert.equal(this,win);wake=fn;return 2};win.clearTimeout=function(){assert.equal(this,win)};
 Object.assign(globalThis,{window:win,document:doc});try{const stop=m.visibleRefresh(()=>calls++,15000);tick();win.dispatchEvent(new Event('focus'));wake();assert.equal(calls,2);stop()}finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument}
});
