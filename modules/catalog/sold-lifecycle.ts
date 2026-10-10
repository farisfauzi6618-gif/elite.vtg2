import {availableGroups,isSold,matchesProduct,matchesSizePrice,type Product,type CatalogFilters} from './catalog-types';
import {DEFAULT_FEATURES,type Feature} from './taxonomy';
import {PRODUCTS_PER_PAGE} from './catalog-pagination';
export const SOLD_MAIN_DAYS=7;
export const SOLD_ARCHIVE_DAYS=30;
const DAY=86400000;
export function soldAge(p:Product,now=Date.now()) {
 const at=Date.parse(p.soldAt??'');
 return isSold(p)&&Number.isFinite(at)?Math.max(0,now-at):Infinity;
}
// Keep every available item first, and cap SOLD at 25% of the final grid page.
// A full available page has no space for SOLD; those items move to the archive.
export function soldGridLimit(availableCount:number) {
 if(!availableCount)return 0;
 const finalAvailable=availableCount%PRODUCTS_PER_PAGE||PRODUCTS_PER_PAGE;
 return Math.min(PRODUCTS_PER_PAGE-finalAvailable,Math.floor(finalAvailable/3));
}
export function catalogInventory(products:Product[],now=Date.now()) {
 const available=products.filter(p=>p.status==='published'&&availableGroups(p).length);
 const sold=products.filter(p=>soldAge(p,now)<=SOLD_ARCHIVE_DAYS*DAY).sort((a,b)=>(b.soldAt??'').localeCompare(a.soldAt??'')||a.id.localeCompare(b.id));
 const young=sold.filter(p=>soldAge(p,now)<=SOLD_MAIN_DAYS*DAY);
 const mainSold=young.slice(0,soldGridLimit(available.length)),ids=new Set(mainSold.map(p=>p.id));
 return {available,main:[...available,...mainSold],recentlySold:sold.filter(p=>!ids.has(p.id))};
}
export function catalogListing(products:Product[],filters:CatalogFilters&{sort?:string},terms:Feature[]=DEFAULT_FEATURES,now=Date.now(),archive=false) {
 const inventory=catalogInventory(products,now);
 const matching=(archive?inventory.recentlySold:inventory.main).filter(p=>matchesProduct(p,filters,terms,true));
 const price=(p:Product)=>Math.min(...(isSold(p)?p.groups:availableGroups(p)).filter(g=>matchesSizePrice(p,g,filters)).map(g=>g.price??p.price??0));
 const sort=(a:Product,b:Product)=>filters.sort==='low'?price(a)-price(b):filters.sort==='high'?price(b)-price(a):(b.publishedAt??'').localeCompare(a.publishedAt??'')||a.id.localeCompare(b.id);
 if(archive)return matching.sort((a,b)=>(b.soldAt??'').localeCompare(a.soldAt??'')||a.id.localeCompare(b.id));
 const available=matching.filter(p=>!isSold(p)).sort(sort);
 const sold=matching.filter(isSold).sort((a,b)=>filters.sort==='low'||filters.sort==='high'?sort(a,b):(b.soldAt??'').localeCompare(a.soldAt??'')||a.id.localeCompare(b.id));
 return [...available,...sold.slice(0,soldGridLimit(available.length))];
}
