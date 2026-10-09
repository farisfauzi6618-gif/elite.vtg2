import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const result=await esbuild.build({stdin:{contents:"export * from './modules/order/checkout-session'; export * from './modules/catalog/cart-return';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
mkdirSync('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/checkout-continuity.mjs');writeFileSync(file,result.outputFiles[0].contents);const m=await import(pathToFileURL(file));
const old={id:'EV-261009-ABCDEF12',status:'submitted',catalog_token:'old-token'},selection={lines:[{name:'Polo',label:'Fit M',quantity:1}],amount:165000};
test('a valid new catalog basket releases only the old browser session after the quote succeeds',async()=>{
 const calls=[];const actual=await m.resumeCatalogSelection('new-token',old,async(p,i)=>{calls.push({p,method:i?.method||'GET'});return selection});
 assert.equal(actual,selection);assert.deepEqual(calls,[{p:'/api/order/catalog?token=new-token',method:'GET'},{p:'/api/order',method:'DELETE'}]);
});
test('an expired or unavailable new selection preserves the prior invoice session',async()=>{
 const calls=[];await assert.rejects(()=>m.resumeCatalogSelection('expired',old,async(p,i)=>{calls.push(i?.method||'GET');throw Error('Expired')}));assert.deepEqual(calls,['GET']);
});
test('a pending order or the same completed selection does not clear its cookie',async()=>{
 for(const existing of [null,{...old,status:'awaiting_proof'}, {...old,catalog_token:'new-token'}]){const calls=[];await m.resumeCatalogSelection('new-token',existing,async(p,i)=>{calls.push(i?.method||'GET');return selection});assert.deepEqual(calls,['GET']);}
});
test('the return link identifies only the basket attached to the displayed invoice',()=>{
 const id='a18a7fe1-3a80-4af0-97e2-123456789abc',base='/';
 assert.equal(m.catalogReturnHref(old,'?catalog=old-token&basket='+id),base+'#belanja-lagi='+id);
 for(const search of ['?catalog=another&basket='+id,'?basket=https://evil.test','?catalog=old-token&basket=bad'])assert.equal(m.catalogReturnHref(old,search),base);
});
test('returning to shop removes submitted quantities and preserves products added afterwards',()=>{
 const cart=[{productId:'p',groupId:'m',quantity:3,name:'Polo',label:'M'},{productId:'other',groupId:'l',quantity:1,name:'Shirt',label:'L'}];
 const pending={id:'basket',lines:[{productId:'p',groupId:'m',quantity:2}]},r=m.reconcileReturnedCart(cart,pending,'#belanja-lagi=basket');
 assert.equal(r.completed,true);assert.deepEqual(r.cart.map(x=>[x.groupId,x.quantity]),[['m',1],['l',1]]);assert.equal(cart[0].quantity,3);
});
test('unrelated return markers or corrupt device state do not discard the basket',()=>{
 const cart=[{productId:'p',groupId:'m',quantity:1,name:'Polo',label:'M'}];
 for(const pending of [null,{id:'different',lines:[]},{id:'basket',lines:[{productId:'p',groupId:'m',quantity:-1}]},{id:'basket',lines:'bad'}])assert.equal(m.reconcileReturnedCart(cart,pending,'#belanja-lagi=basket').cart,cart);
});
test('a lost upload response recovers only the same server-saved submitted order',async()=>{
 const saved={...old,payment_state:'proof_received'};assert.equal(await m.recoverSubmittedOrder(old.id,async()=>saved),saved);
 for(const value of [{...saved,id:'different'},{...saved,status:'awaiting_proof'}])assert.equal(await m.recoverSubmittedOrder(old.id,async()=>value),null);
 assert.equal(await m.recoverSubmittedOrder(old.id,async()=>{throw Error('offline')}),null);
});
