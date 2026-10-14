const ID=/^[A-Za-z0-9_-]{1,100}$/;
export const MAX_SELECTION_PRODUCTS=41;
export function selectionIds(productId:string,read:(key:string)=>string|null){
 const ids=new Set<string>();if(ID.test(productId))ids.add(productId);
 for(const key of ['elite.catalog.cart','elite.reserve.cart']){try{const rows=JSON.parse(read(key)??'[]');if(Array.isArray(rows))for(const row of rows.slice(0,20))if(typeof row?.productId==='string'&&ID.test(row.productId))ids.add(row.productId);}catch{/* Broken device-local drafts cannot interrupt browsing. */}}
 return [...ids].sort();
}
export function parseSelectionIds(value:string|null){
 const ids=value?.split(',')??[];if(!ids.length||ids.length>MAX_SELECTION_PRODUCTS||ids.some(id=>!ID.test(id)))throw new Error('Pilihan produk tidak valid.');return [...new Set(ids)].sort();
}
export function selectionPath(ids:string[]){return '/api/catalog/selection?ids='+encodeURIComponent(ids.join(','));}
