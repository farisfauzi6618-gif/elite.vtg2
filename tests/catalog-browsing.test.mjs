import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const esbuild=require('esbuild');
const compiled=await esbuild.build({stdin:{contents:"export * from './modules/catalog/catalog-pagination';export {matchesProduct} from './modules/catalog/catalog-types';export {ProductCard} from './components/product-card';export {SizeInfo} from './components/size-info';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',write:false});
mkdirSync('.test-runtime/tests',{recursive:true});
const output=path.resolve('.test-runtime/tests/catalog-browsing.mjs');
writeFileSync(output,compiled.outputFiles[0].contents);
const {catalogPage,parseCatalogPage,catalogPageNumbers,ProductCard,matchesProduct,SizeInfo}=await import(pathToFileURL(output));
const product={id:'sample',name:'Long Sleeve Polo',brand:'BEANPOLE',category:'Sweater & Knitwear',status:'published',price:155000,features:['half-button'],photoKey:'sample.jpg',condition:'Very good',defects:'Noda kecil',groups:[{id:'small',fits:['S'],qty:1,lengthCm:63,widthCm:48},{id:'sold',fits:['XL'],qty:0},{id:'medium',fits:['M','S'],qty:1}]};

test('40 cards per page, no duplicated or missing products across page boundaries',()=>{
 for(const count of [0,21,40,41,80,81,120,401]){
  const products=Array.from({length:count},(_,id)=>({id}));
  const collected=[];
  for(let page=1;page<=Math.max(1,Math.ceil(count/40));page++){
   const result=catalogPage(products,page);
   assert.ok(result.items.length<=40);
   collected.push(...result.items);
  }
  assert.deepEqual(collected,products);
 }
});
test('invalid page URLs and out-of-range pages resolve to available pages',()=>{
 for(const value of [null,'','0','-1','1.5','1e2','Infinity','9007199254740992','2garbage'])assert.equal(parseCatalogPage(value),1);
 assert.equal(parseCatalogPage('2'),2);
 assert.equal(catalogPage(Array(41).fill(0),999).page,2);
 assert.equal(catalogPage([],9).page,1);
 assert.equal(catalogPage(Array(21).fill(0),3).page,1);
});
test('page controls stay bounded for large catalogs and include first/last pages',()=>{
 assert.deepEqual(catalogPageNumbers(50,100),[1,49,50,51,100]);
 assert.deepEqual(catalogPageNumbers(1,3),[1,2,3]);
 assert.deepEqual(catalogPageNumbers(3,3),[1,2,3]);
});
test('card exposes name, brand, in-stock sizes, price and condition in one product link',()=>{
 const html=renderToStaticMarkup(React.createElement(ProductCard,{product,onNavigate:()=>{}}));
 for(const value of ['Long Sleeve Polo','BEANPOLE','Size S / M','155.000','Very good'])assert.ok(html.includes(value));
 for(const value of ['Sweater &amp; Knitwear','63 cm','Noda kecil','Half Button','Size XL'])assert.ok(!html.includes(value));
 assert.equal((html.match(/<a /g)||[]).length,1);
 assert.ok(html.includes('href="/produk/sample"'));
});
test('card prices and conditions reflect available groups without sold-out variants',()=>{
 const variants={...product,groups:[{id:'s',fits:['S'],qty:1,price:185000,condition:'Good'},{id:'m',fits:['M'],qty:1,price:215000,condition:'Very good'},{id:'xl',fits:['XL'],qty:0,price:999000,condition:'Sold-out condition'}]};
 const html=renderToStaticMarkup(React.createElement(ProductCard,{product:variants,onNavigate:()=>{}}));
 for(const value of ['185.000','215.000','Kondisi bervariasi'])assert.ok(html.includes(value));
 for(const value of ['999.000','Sold-out condition'])assert.ok(!html.includes(value));
 const single=renderToStaticMarkup(React.createElement(ProductCard,{product:{...variants,groups:[variants.groups[0]]},onNavigate:()=>{}}));
 assert.ok(single.includes('Kondisi: Good'));
 assert.ok(!single.includes('Very good'));
});
test('hidden categories remain searchable and filters apply before paging',()=>{
 assert.equal(matchesProduct(product,{q:'knitwear'}),true);
 assert.equal(matchesProduct(product,{category:'Sweater & Knitwear',size:'S'}),true);
 assert.equal(matchesProduct(product,{category:'Polo'}),false);
 const products=Array.from({length:81},(_,id)=>({...product,id:String(id),category:id<41?'Polo':'Kemeja'}));
 const filtered=products.filter(p=>matchesProduct(p,{category:'Polo'}));
 assert.equal(catalogPage(filtered,1).items.length,40);
 assert.equal(catalogPage(filtered,2).items.length,1);
});
test('tag size stays distinct from store fit and unknown tags are not inferred',()=>{
 const group={...product.groups[0],tagSize:'XL',fits:['L']};
 const html=renderToStaticMarkup(React.createElement(SizeInfo,{group}));
 assert.ok(html.includes('<dt>Size on tag</dt><dd>XL</dd>'));
 assert.ok(html.includes('<dt>Size fit to</dt><dd>L</dd>'));
 for(const value of ['Panjang: 63 cm','Lebar: 48 cm'])assert.ok(html.includes(value));
 const unknown=renderToStaticMarkup(React.createElement(SizeInfo,{group:{...group,tagSize:' '}}));
 assert.ok(unknown.includes('<dt>Size on tag</dt><dd>Belum tercantum</dd>'));
 assert.ok(unknown.includes('<dt>Size fit to</dt><dd>L</dd>'));
});
