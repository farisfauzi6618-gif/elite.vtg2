import {publicPhotoUrl} from './photo-url';
import {availableGroups,displayPrice,FITS,isSold,isReserved,productPhotos,type Product} from './catalog-types';
export const PRODUCT_SHARE_ORIGIN='https://elitevtg.com';
export function productShareUrl(product:Product,story=false){
 if(product.status!=='published'||!product.id||!/^[A-Za-z0-9_-]{1,100}$/.test(product.id))throw new Error('Hanya produk terbit yang dapat dibagikan.');
 const url=new URL('/produk/'+encodeURIComponent(product.id),PRODUCT_SHARE_ORIGIN);
 if(product.selectedColorVariantId)url.searchParams.set('color',product.selectedColorVariantId);
 if(story){url.searchParams.set('utm_source','instagram');url.searchParams.set('utm_medium','story');url.searchParams.set('utm_campaign','daily_product');}
 return url.href;
}
export function productShareSummary(product:Product){
 const groups=isSold(product)||isReserved(product)?product.groups:availableGroups(product),fits=new Set(groups.flatMap(g=>g.fits));
 const sizes=FITS.filter(f=>fits.has(f));
 return [product.selectedColorVariantId?'Color '+product.color:null,isReserved(product)?'RESERVED':isSold(product)?'SOLD':null,sizes.length?'Size '+sizes.join(' / '):null,displayPrice(product)].filter(Boolean).join(' · ');
}
export function productShareData(product:Product,story=false){return {title:product.name,text:product.name+'\n'+productShareSummary(product)+'\nELITE.VTG',url:productShareUrl(product,story)}}
export function whatsappShareUrl(product:Product){const text=product.name+'\n'+productShareSummary(product)+'\n\nView at ELITE.VTG:\n'+productShareUrl(product);return 'https://wa.me/?text='+encodeURIComponent(text)}
export async function copyProductLink(product:Product,copy?:((url:string)=>Promise<void>)){try{if(!copy)return false;await copy(productShareUrl(product));return true}catch{return false}}
export async function shareStoryFile(file:File,title:string,adapter:{canShare?:(data:{files:File[]})=>boolean;share?:(data:{files:File[];title:string})=>Promise<void>}){
 try{if(!adapter.share||!adapter.canShare?.({files:[file]}))return 'fallback' as const;await adapter.share({files:[file],title});return 'shared' as const}catch(e){return (e as {name?:string})?.name==='AbortError'?'cancelled' as const:'fallback' as const}
}
type ShareAdapter={share?:(data:{title:string;text:string;url:string})=>Promise<void>;copy?:(url:string)=>Promise<void>};
export async function performProductShare(product:Product,adapter:ShareAdapter,copyOnly=false,story=false){
 const data=productShareData(product,story);
 if(!copyOnly&&adapter.share){try{await adapter.share(data);return 'native_share' as const}catch(e){if((e as {name?:string})?.name==='AbortError')return 'cancelled' as const;return 'copy_fallback' as const}}
 if(!adapter.copy)return 'manual_copy' as const;
 try{await adapter.copy(data.url);return 'copy_link' as const}catch{return 'manual_copy' as const}
}
export function productShareMetadata(product:Product){
 const url=productShareUrl(product),title=product.name+' | ELITE.VTG',description=productShareSummary(product)+' · Curated by ELITE.VTG',photo=productPhotos(product)[0];
 const images=photo?[{url:new URL(publicPhotoUrl(photo,'card'),PRODUCT_SHARE_ORIGIN).href,alt:product.name}]:[];
 return {title:{absolute:title},description,alternates:{canonical:new URL('/produk/'+encodeURIComponent(product.id),PRODUCT_SHARE_ORIGIN).href},openGraph:{type:'website' as const,title,description,url,siteName:'ELITE.VTG',images},twitter:{card:photo?'summary_large_image' as const:'summary' as const,title,description,images:images.map(i=>i.url)}};
}
