import {isSold,type Product} from './catalog-types';
export const NEW_IN_WINDOW=72*60*60*1000;
export function isNewArrival(product:Product,now:number){
 const published=Date.parse(product.publishedAt??'');
 const age=now-published;
 return product.status==='published'&&!isSold(product)&&Number.isFinite(published)&&Number.isFinite(now)&&age>=0&&age<=NEW_IN_WINDOW;
}
