import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/report-cache-search.mjs');
const compiled=await build({stdin:{contents:"export {reportCache} from './modules/admin/report-cache';export {matchesProduct} from './modules/catalog/catalog-types';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});await writeFile(file,compiled.outputFiles[0].contents);const m=await import(pathToFileURL(file));
test('aggregate cache shares pending work, expires after completion, bounds entries and retries failures',async()=>{
 let now=0,calls=0,finish;const cache=m.reportCache(30,2,()=>now),pending=cache.read('owner:view',()=>{calls++;return new Promise(resolve=>{finish=resolve})});await Promise.resolve();now=40;assert.equal(cache.read('owner:view',()=>{throw Error('duplicate')}),pending);finish(7);assert.equal(await pending,7);now=69;assert.equal(await cache.read('owner:view',async()=>8),7);now=71;assert.equal(await cache.read('owner:view',async()=>8),8);assert.equal(calls,1);
 await assert.rejects(cache.read('failure',async()=>{throw Error('retry')}));assert.equal(await cache.read('failure',async()=>9),9);
 await cache.read('third',async()=>3);assert.equal(await cache.read('owner:view',async()=>10),10);cache.clear();assert.equal(await cache.read('third',async()=>4),4);
});
test('explicit search aliases find caps and PRL while preserving brand and product distinctions',()=>{
 const product={id:'p',name:'Cotton Chino Ball Cap',brand:'Polo Ralph Lauren',category:'Topi',color:'Navy',features:[],status:'published',groups:[{id:'g',fits:['One size'],qty:1,price:335000}]};
 for(const q of ['topi','cap','caps','hat','hats','PRL','prl navy','Polo Ralph Lauren'])assert.equal(m.matchesProduct(product,{q}),true,q);
 assert.equal(m.matchesProduct({...product,name:'Plain Polo',brand:'US Polo Assn',category:'Polo'},{q:'prl'}),false);
 assert.equal(m.matchesProduct({...product,name:'Half Zip',brand:'Other',category:'Sweater & Knitwear'},{q:'quarterzip'}),false);
 assert.equal(m.matchesProduct({...product,status:'draft'},{q:'cap'}),false);assert.equal(m.matchesProduct({...product,groups:[{...product.groups[0],qty:0}]},{q:'cap'}),false);
});
