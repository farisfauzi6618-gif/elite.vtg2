import {CATEGORIES,isSold,totalStock,type Product} from './catalog-types';

function searchText(value:string){
 return value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

/** Local admin filtering uses the already loaded lightweight inventory. */
export function adminInventoryProducts(products:readonly Product[],{q='',status='all',featuredOnly=false}:{q?:string;status?:string;featuredOnly?:boolean}={}){
 const words=searchText(q).split(' ').filter(Boolean);
 const matching=products.filter(product=>{
  if(featuredOnly&&!product.isFeatured)return false;
  const text=searchText(product.name+' '+product.brand);
  if(!words.every(word=>text.includes(word)))return false;
  return status==='all'||status==='trash'&&!!product.deletedAt||status==='draft'&&product.status==='draft'||status==='published'&&product.status==='published'&&totalStock(product)>0||status==='empty'&&product.status==='published'&&totalStock(product)===0||status==='hidden'&&isSold(product)&&product.soldHidden||status==='review'&&!CATEGORIES.includes(product.category);
 });
 return featuredOnly?matching.sort((a,b)=>Number(isSold(a))-Number(isSold(b))||(a.featuredPosition??Infinity)-(b.featuredPosition??Infinity)||a.id.localeCompare(b.id)):matching;
}
