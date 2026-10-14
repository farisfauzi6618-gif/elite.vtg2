import {availableGroups,type Product} from './catalog-types';
import {orderingLocked} from './product-schedule';
import {PRODUCTS_PER_PAGE} from './catalog-pagination';
export const FEATURED_LIMIT=8;
// Read from the existing inventory snapshot; no extra stock or image request.
export function featuredProducts(products:Product[],now=Date.now()){
 return products.filter(p=>p.isFeatured&&p.status==='published'&&availableGroups(p).length&&!orderingLocked(p,now)).sort((a,b)=>(a.featuredPosition??FEATURED_LIMIT)-(b.featuredPosition??FEATURED_LIMIT)||a.id.localeCompare(b.id)).slice(0,FEATURED_LIMIT);
}
export function featuredLanding(filters:Record<string,string>,explicitSort=false){return !explicitSort&&Object.entries(filters).every(([key,value])=>key==='sort'?value==='newest':!value||value==='all');}
export function browseWithoutFeatured(products:Product[],featured:Product[],landing:boolean){const ids=new Set(landing?featured.map(p=>p.id):[]);return products.filter(p=>!ids.has(p.id));}
// Featured occupies part of the existing first-page budget, keeping 40 cards maximum.
export function featuredCatalogPage<T>(products:readonly T[],requestedPage:number,featuredCount:number){
 const count=Math.max(0,Math.min(FEATURED_LIMIT,featuredCount)),pageCount=Math.max(1,Math.ceil((products.length+count)/PRODUCTS_PER_PAGE));
 const page=Math.min(pageCount,Math.max(1,Number.isSafeInteger(requestedPage)?requestedPage:1));
 const start=page===1?0:(page-1)*PRODUCTS_PER_PAGE-count,limit=page===1?PRODUCTS_PER_PAGE-count:PRODUCTS_PER_PAGE;
 return {page,pageCount,start,items:products.slice(start,start+limit)};
}
