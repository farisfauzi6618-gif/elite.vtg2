import {publicProduct,isSold,isReserved,FITS,type Product} from './catalog-types';
import {catalogInventory,catalogListing} from './sold-lifecycle';
import {featuredProducts,featuredLanding,browseWithoutFeatured,featuredCatalogPage} from './featured';
import {parseCatalogPage} from './catalog-pagination';
import {parseSelectionIds} from './catalog-selection';
import type {Taxonomy} from './taxonomy';

export type ListingFilters={q:string;size:string;brand:string;category:string;features:string;min:string;max:string;sort:string;availability:string};
export const LISTING_DEFAULTS:ListingFilters={q:'',size:'all',brand:'all',category:'all',features:'all',min:'',max:'',sort:'newest',availability:'all'};
export type ListingRequest={filters:ListingFilters;page:number;archive:boolean;explicitSort:boolean;ids:string[]};
export type ListingPage={products:Product[];featured:Product[];selected:Product[];taxonomy:Taxonomy;asOf:string;listing:{total:number;availableCount:number;browseTotal:number;page:number;pageCount:number;start:number;landing:boolean;hasRecentlySold:boolean;brands:string[];sizes:string[];latestRelease:number}};

export function listingRequest(params:URLSearchParams):ListingRequest{
  const filters={...LISTING_DEFAULTS};
  for(const key of Object.keys(filters) as (keyof ListingFilters)[]){const value=params.get(key);if(value!=null){if(value.length>(key==='q'?120:1000)||/[\x00-\x1f]/.test(value))throw Error('Filter katalog tidak valid.');filters[key]=value}}
  if(!['newest','low','high'].includes(filters.sort))filters.sort='newest';
  for(const key of ['min','max'] as const)if(filters[key]&&!/^\d{1,9}(?:\.\d{1,2})?$/.test(filters[key]))throw Error('Rentang harga tidak valid.');
  return {filters,page:parseCatalogPage(params.get('page')),archive:params.get('archive')==='1',explicitSort:params.get('explicitSort')==='1',ids:params.get('ids')?parseSelectionIds(params.get('ids')):[]};
}

export function listingPath(input:ListingRequest){
  const params=new URLSearchParams({paged:'1',page:String(input.page)});
  for(const [key,value] of Object.entries(input.filters))if(value!==LISTING_DEFAULTS[key as keyof ListingFilters])params.set(key,value);
  if(input.archive)params.set('archive','1');if(input.explicitSort)params.set('explicitSort','1');
  if(input.ids.length)params.set('ids',input.ids.join(','));
  return '/api/catalog?'+params;
}

// Cards and device baskets need fresh prices/stock, not complete photo galleries.
export function listingProduct(product:Product):Product{
  return {...publicProduct(product),description:'',photoKeys:[],colorVariants:(product.colorVariants??[]).filter(v=>v.active).map(v=>({...v,photoKeys:[]}))} as unknown as Product;
}

export function listingPage(products:Product[],taxonomy:Taxonomy,input:ListingRequest,now=Date.now()):ListingPage{
  const inventory=catalogInventory(products,now),shown=catalogListing(products,input.filters,taxonomy.features,now,input.archive);
  const featured=featuredProducts(products,now),landing=!input.archive&&featuredLanding(input.filters,input.explicitSort)&&featured.length>0;
  const browse=browseWithoutFeatured(shown,featured,landing),page=featuredCatalogPage(browse,input.page,landing?featured.length:0);
  const base=['S','M','L','XL','XXL'];
  return {products:page.items.map(listingProduct),featured:landing&&page.page===1?featured.map(listingProduct):[],selected:products.filter(p=>input.ids.includes(p.id)).map(listingProduct),taxonomy,asOf:new Date(now).toISOString(),listing:{total:shown.length,availableCount:shown.filter(p=>!isSold(p)&&!isReserved(p)).length,browseTotal:browse.length,page:page.page,pageCount:page.pageCount,start:page.start,landing,hasRecentlySold:inventory.recentlySold.length>0||inventory.main.some(isSold),brands:[...new Set(products.map(p=>p.brand))].filter(Boolean).sort(),sizes:[...base,...FITS.filter(size=>!base.includes(size)&&products.some(product=>product.groups.some(group=>group.fits.includes(size))))],latestRelease:Math.max(0,...products.map(p=>p.orderableAt?Date.parse(p.orderableAt)||0:0))}};
}
