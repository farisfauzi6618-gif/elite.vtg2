import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
await mkdir('.test-runtime/tests',{recursive:true});
const output=path.resolve('.test-runtime/tests/cart-availability.mjs');
await build({stdin:{contents:"export * from './modules/catalog/cart-availability';export {CartItemStatus} from './components/cart-item-status';export {ProductDetail} from './components/product-detail';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:output});
const {cartAvailability,cartSummary,CartItemStatus,ProductDetail}=await import(pathToFileURL(output));
after(()=>rm(output,{force:true}));
const p={id:'p',name:'Vintage Polo',brand:'PRL',category:'Polo',color:'Navy',status:'published',price:175000,groups:[{id:'g',qty:1,fits:['M'],lengthCm:60,widthCm:50}],features:[],photoKeys:[]};
const cart=[{productId:'p',groupId:'g',quantity:1,name:p.name,label:'Fit M'}];
const renderStatus=row=>renderToStaticMarkup(React.createElement(CartItemStatus,{row}));
test('a restored cart waiting for the catalog never claims sold-out stock or Rp0',()=>{
 const rows=cartAvailability(cart,[],false),html=renderStatus(rows[0]);
 assert.match(html,/Memeriksa stok/);assert.match(html,/Memuat harga/);
 assert.doesNotMatch(html,/Stok habis|Rp\s*(?:&nbsp;| )?0/);
 assert.equal(cartSummary(rows).canCheckout,false);assert.equal(cartSummary(rows).label,'Memuat harga…');
});
test('server-rendered product stock and price allow checkout before the background catalog arrives',()=>{
 const rows=cartAvailability(cart,[p],false);
 assert.equal(rows[0].pending,false);assert.equal(rows[0].available,true);assert.equal(rows[0].price,175000);
 assert.equal(cartSummary(rows).canCheckout,true);assert.match(cartSummary(rows).label,/175\.000/);
 const html=renderToStaticMarkup(React.createElement(ProductDetail,{product:p,cart:[],cartCount:0,backHref:'/',onPick(){},onOpenCart(){}}));
 assert.match(html,/Tambahkan ke keranjang/);assert.doesNotMatch(html,/Menyiapkan tombol|Stok barang ini sudah habis/);
});
test('real stock changes, missing products and quantity limits remain blocked after loading',()=>{
 for(const products of [[],[{...p,groups:[{...p.groups[0],qty:0}]}]]){
  const rows=cartAvailability(cart,products,true);assert.equal(rows[0].pending,false);assert.equal(cartSummary(rows).canCheckout,false);assert.match(renderStatus(rows[0]),/Stok habis/);
 }
 const rows=cartAvailability([{...cart[0],quantity:2}],[p],true);
 assert.equal(cartSummary(rows).canCheckout,false);assert.match(renderStatus(rows[0]),/Tersisa 1 unit/);
});
test('a basket containing another unloaded product waits without blocking the known item from being displayed correctly',()=>{
 const rows=cartAvailability([...cart,{...cart[0],productId:'other',groupId:'other'}],[p],false);
 assert.equal(rows[0].available,true);assert.equal(rows[1].pending,true);assert.equal(cartSummary(rows).canCheckout,false);
 assert.match(renderStatus(rows[0]),/175\.000/);assert.doesNotMatch(renderStatus(rows[1]),/Stok habis/);
});
test('refreshed variant prices and quantities replace the initial view',()=>{
 const rows=cartAvailability(cart,[{...p,groups:[{...p.groups[0],qty:2,price:185000}]}],true);
 assert.equal(rows[0].stock,2);assert.equal(rows[0].price,185000);assert.match(cartSummary(rows).label,/185\.000/);
});
