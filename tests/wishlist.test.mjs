import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

await mkdir('.test-runtime/tests',{recursive:true});
const file=path.resolve('.test-runtime/tests/wishlist.mjs');
await build({stdin:{contents:"export * from './modules/catalog/wishlist';export {selectionPath,parseSelectionIds} from './modules/catalog/catalog-selection';export {FaqContent,SizeGuideContent} from './components/shopping-help';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:file});
const m=await import(pathToFileURL(file));after(()=>rm(file,{force:true}));

test('malformed or oversized device storage cannot break catalog browsing',()=>{
  for(const value of [null,'','broken','null','{}','"value"','x'.repeat(10001)])assert.deepEqual(m.wishlistIds(value),[]);
});
test('wishlist accepts only bounded product IDs, deduplicating without storing arbitrary data',()=>{
  assert.deepEqual(m.wishlistIds(JSON.stringify(['a','a','qa-000',null,{id:'secret'},42,'../admin','x,y','https://evil.test','a'.repeat(101)])),['a','qa-000']);
  assert.equal(m.wishlistIds(JSON.stringify(Array.from({length:90},(_,i)=>'p-'+i))).length,60);
});
test('saving and removing a product are idempotent by membership and never duplicate a row',()=>{
  const saved=m.toggleWishlist(['a'],'b');assert.deepEqual(saved,['b','a']);
  assert.deepEqual(m.toggleWishlist(saved,'b'),['a']);assert.deepEqual(m.toggleWishlist(saved,'../admin'),saved);
});
test('full wishlist preserves all existing choices and allows removal before adding another',()=>{
  const ids=Array.from({length:m.WISHLIST_LIMIT},(_,i)=>'p-'+i);
  assert.equal(m.toggleWishlist(ids,'new'),ids);
  const next=m.toggleWishlist(m.toggleWishlist(ids,'p-0'),'new');assert.equal(next.length,60);assert.equal(next[0],'new');assert.ok(!next.includes('p-0'));
});
test('wishlist pages stay within the existing selection API limit and clamp after deletion',()=>{
  const ids=Array.from({length:60},(_,i)=>'p-'+i),seen=[];
  for(let page=1;page<=5;page++){const view=m.wishlistPage(ids,page);assert.equal(view.ids.length,12);assert.equal(view.pageCount,5);assert.deepEqual(m.parseSelectionIds(new URL(m.selectionPath(view.ids),'https://elite.test').searchParams.get('ids')),view.ids.toSorted());seen.push(...view.ids)}
  assert.deepEqual(seen,ids);assert.equal(m.wishlistPage(ids,99).page,5);assert.equal(m.wishlistPage([],5).page,1);assert.equal(m.wishlistPage(ids,NaN).page,1);assert.deepEqual(m.wishlistPage(ids.slice(0,12),2).ids,ids.slice(0,12));
});
test('size help and FAQ render text without image downloads or invented returns promises',()=>{
  const size=renderToStaticMarkup(React.createElement(m.SizeGuideContent)),faq=renderToStaticMarkup(React.createElement(m.FaqContent));
  assert.match(size,/Size on tag/);assert.match(size,/Size fit to/);assert.match(size,/bukan lingkar dada/);assert.match(size,/Untuk celana, topi/);
  assert.match(faq,/tanpa akun/);assert.match(faq,/tidak tersinkron/);assert.match(faq,/48 jam setelah DP dikonfirmasi/);assert.match(faq,/ongkir di tempat/);assert.doesNotMatch(size+faq,/<img|<iframe|<video|<script|retur gratis|refund/i);
});
