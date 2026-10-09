import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

await mkdir('.test-runtime',{recursive:true});
const output=path.resolve('.test-runtime/canonical-domain.mjs');
await build({entryPoints:['lib/canonical-domain.ts'],bundle:true,platform:'node',format:'esm',outfile:output});
const {canonicalDestination}=await import(pathToFileURL(output));
after(()=>rm(output,{force:true}));
const primary='https://elitevtg.vercel.app',previous='https://elite-vtg2.vercel.app';
const redirect=(route,options={},origin=primary)=>canonicalDestination(new Request(previous+route,options),origin)?.href??null;

test('canonical domain preserves pages and search while staying on the pinned host',()=>{
  for(const route of ['/','/produk/abc','/admin/katalog','/ongkir','/lacak?code=example','/?page=2'])assert.equal(redirect(route),primary+route);
  assert.equal(redirect('//outside.test/path'),primary+'//outside.test/path');
  assert.equal(redirect('/',{},'https://outside.test'),null);
  assert.equal(redirect('/',{},previous),null);
  assert.equal(canonicalDestination(new Request(primary+'/'),primary),null);
  assert.equal(canonicalDestination(new Request('https://preview.vercel.app/'),primary),null);
});
test('invoice session moves only as a fragment and manual new-order intent is preserved',()=>{
  const token='a'.repeat(64),headers={cookie:'other=123; elite_order='+token};
  assert.equal(redirect('/order',{headers}),primary+'/order/lanjutkan#'+token);
  assert.equal(redirect('/order?catalog=abc',{headers}),primary+'/order/lanjutkan?catalog=abc#'+token);
  assert.equal(redirect('/order?manual=baru',{headers}),primary+'/order?manual=baru');
  assert.equal(redirect('/order',{headers:{cookie:'elite_order=invalid'}}),primary+'/order');
  assert.equal(redirect('/',{headers}),primary+'/');
});
test('existing form writes, API reads, webhooks and static assets continue on the previous host',()=>{
  for(const route of ['/api/order','/api/telegram/webhook','/api/photos/example','/_next/static/app.js','/favicon.ico'])assert.equal(redirect(route),null);
  for(const method of ['POST','PATCH','DELETE'])assert.equal(redirect('/order',{method}),null);
  assert.equal(redirect('/order',{method:'HEAD'}),primary+'/order');
});
