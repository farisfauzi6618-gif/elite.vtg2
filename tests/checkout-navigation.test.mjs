import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

await mkdir('.test-runtime',{recursive:true});
const output=path.resolve('.test-runtime/checkout-navigation.mjs');
await build({entryPoints:['modules/catalog/checkout-navigation.ts'],bundle:true,platform:'node',format:'esm',outfile:output});
const {checkoutDestination}=await import(pathToFileURL(output));
after(()=>rm(output,{force:true}));
const token='a'.repeat(64),basket='00000000-0000-4000-8000-000000000000';

test('relative checkout URLs open on the current production, preview or local origin',()=>{
 for(const origin of ['https://elitevtg.vercel.app','https://elite-vtg2.vercel.app','https://elite-preview.vercel.app','http://localhost:3000']){
  const target=checkoutDestination('/order?catalog='+token,origin,basket);
  assert.equal(target.origin,origin);assert.equal(target.pathname,'/order');
  assert.equal(target.searchParams.get('catalog'),token);assert.equal(target.searchParams.get('basket'),basket);
 }
});
test('same-origin absolute checkout keeps its token and uses the current basket',()=>{
 const origin='https://elitevtg.vercel.app',target=checkoutDestination(origin+'/order?catalog='+token+'&basket=old',origin,basket);
 assert.equal(target.searchParams.get('catalog'),token);assert.equal(target.searchParams.get('basket'),basket);
});
test('invalid checkout responses cannot navigate to another site or an unrelated page',()=>{
 const origin='https://elitevtg.vercel.app';
 for(const value of [null,{},'http://[','https://outside.test/order?catalog='+token,'//outside.test/order?catalog='+token,'javascript:alert(1)','/admin?catalog='+token,'/order','/order?catalog=invalid']){
  assert.throws(()=>checkoutDestination(value,origin,basket),/Tautan pembayaran belum dapat dibuka/);
 }
});
