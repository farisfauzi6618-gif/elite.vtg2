import {CATEGORIES,DEFAULT_FEATURES,normalizeSearch,selectedValues,matchesFeatures,type Feature} from '@/modules/catalog/taxonomy';
export {CATEGORIES} from '@/modules/catalog/taxonomy';
export const MAX_PRODUCT_PHOTOS=12;
export const FITS=['XXS','XS','S','M','L','XL','XXL','3XL','4XL','One size'];
export type SizeGroup={id:string;productId?:string;label:string;tagSize:string;fits:string[];lengthCm:number|null;widthCm:number|null;qty:number|null;price:number|null;condition:string|null;defects:string|null;revision:number;sortOrder:number};
export type Product={id:string;shortcode:string;instagramUrl:string;name:string;brand:string;category:string;legacyCategory?:string;features?:string[];categoryNeedsReview?:boolean;color:string;price:number|null;condition:string|null;defects:string|null;photoKey:string|null;photoKeys?:string[];description?:string;caption:string;warnings:string[];reviewed:boolean;status:'draft'|'published';createdAt:string;updatedAt:string;orderableAt?:string|null;publishedAt:string|null;soldAt?:string|null;soldHidden?:boolean;version:number;groups:SizeGroup[]};
export const money=(n:number|null|undefined)=>n==null?'Harga belum diisi':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
export const totalStock=(p:Product)=>p.groups.reduce((sum,g)=>sum+(g.qty??0),0);
export function isSold(p:Product){return p.status==='published'&&p.groups.length>0&&p.groups.every(g=>g.qty===0)}
export function availableGroups(p:Product){return p.groups.filter(g=>(g.qty??0)>0)}
export function displayPrice(p:Product){const prices=(isSold(p)?p.groups:availableGroups(p)).map(g=>g.price??p.price).filter((n):n is number=>n!=null); if(!prices.length)return money(p.price);const lo=Math.min(...prices),hi=Math.max(...prices);return lo===hi?money(lo):`${money(lo)} – ${money(hi)}`}
export type CatalogFilters={q?:string;size?:string|string[];brand?:string|string[];category?:string|string[];features?:string|string[];min?:string;max?:string;availability?:string};
export function matchesProduct(p:Product,f:CatalogFilters,terms:Feature[]=DEFAULT_FEATURES,includeSold=false){
 if(p.status!=='published'||(!availableGroups(p).length&&!(includeSold&&isSold(p))))return false;
 if(f.availability==='available'&&isSold(p))return false;
 const selected=terms.filter(t=>(p.features??[]).includes(t.id));
 const haystack=normalizeSearch([p.name,p.brand,p.category,p.legacyCategory??'',p.color,p.description??'',...(p.features??[]),...selected.map(t=>t.label)].join(' '),terms);
 if(f.q&&!normalizeSearch(f.q,terms).split(' ').filter(Boolean).every(word=>haystack.includes(word)))return false;
 const brands=selectedValues(f.brand),categories=selectedValues(f.category);
 if(brands.length&&!brands.includes(p.brand))return false;
 if(categories.length&&!categories.includes(p.category))return false;
 if(!matchesFeatures(p.features??[],f.features,terms))return false;
 return (includeSold&&isSold(p)?p.groups:availableGroups(p)).some(g=>matchesSizePrice(p,g,f));
}
export function matchesSizePrice(p:Product,g:SizeGroup,f:CatalogFilters){const sizes=selectedValues(f.size);if(sizes.length&&!sizes.some(s=>g.fits.includes(s)))return false;const price=g.price??p.price;if((f.min||f.max)&&price==null)return false;if(f.min&&price!=null&&price<Number(f.min))return false;if(f.max&&price!=null&&price>Number(f.max))return false;return true}

export function productPhotos(p:Pick<Product,'photoKey'|'photoKeys'>){return [...new Set([p.photoKey,...(p.photoKeys??[])].filter((x):x is string=>!!x))]}
export function publicProduct(p:Product){const {id,name,brand,category,color,price,condition,defects,photoKey,publishedAt,updatedAt,status,description,features,orderableAt,soldAt}=p;return {id,name,brand,category,color,price,condition,defects,photoKey,photoKeys:productPhotos(p),publishedAt,updatedAt,status,soldAt:soldAt??null,soldHidden:Boolean(p.soldHidden),availability:isSold(p)?'sold':availableGroups(p).length?'available':'unavailable',orderableAt:orderableAt??null,description:description??'',features:features??[],groups:p.groups.map(({id,label,tagSize,fits,lengthCm,widthCm,qty,price,condition,defects})=>({id,label,tagSize,fits,lengthCm,widthCm,qty,price,condition,defects}))}}

export function fitValue(g:Pick<SizeGroup,'fits'>){return g.fits.length?FITS.filter(f=>g.fits.includes(f)).join('/'):'Belum ditentukan'}
export function fitLabel(g:Pick<SizeGroup,'fits'>){return 'Size fit to: '+fitValue(g)}
export function choiceLabel(g:Pick<SizeGroup,'fits'|'lengthCm'|'widthCm'>){return 'Fit '+fitValue(g)+(g.lengthCm!=null||g.widthCm!=null?` · Panjang ${g.lengthCm??'—'} cm, Lebar ${g.widthCm??'—'} cm`:'')}
