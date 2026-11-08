import {getSqlClient} from '@/lib/database';
import {publicMediaEnabled,PUBLIC_MEDIA_PIPELINE} from './public-product-media';
import {validatedPhotoUrl,type PhotoUrls,type PhotoSize} from './photo-url';
type MediaProduct={photoKey?:string|null;photoKeys?:string[];photoUrls?:PhotoUrls;colorVariants?:{active:boolean;photoKey?:string|null;photoKeys?:string[];swatchImage?:string|null}[]};
function keys(p:MediaProduct){return [...new Set([p.photoKey,...p.photoKeys??[],...p.colorVariants?.filter(v=>v.active).flatMap(v=>[v.photoKey,v.swatchImage,...v.photoKeys??[]])??[]].filter((k):k is string=>typeof k==='string'&&/^[a-f0-9-]{36}$/.test(k)))]}
// Read only ready derivatives in bounded batches, with a live indexed publication
// gate. Missing assets/outages retain the existing authorized image route.
export async function withReadyProductMedia<T extends MediaProduct>(products:T[]):Promise<T[]>{
 const clean=products.map(p=>{const value={...p};delete value.photoUrls;return value});
 if(!publicMediaEnabled())return clean;
 try{
  const all=[...new Set(clean.flatMap(keys))],urls:PhotoUrls={};
  for(let i=0;i<all.length;i+=200){
   const batch=all.slice(i,i+200);
   const result=await getSqlClient().execute({sql:`SELECT d.photo_key,d.preset,d.public_url FROM photo_public_derivatives d WHERE d.photo_key IN (${batch.map(()=>'?').join(',')}) AND d.pipeline=? AND d.state='ready' AND EXISTS (SELECT 1 FROM photo_public_references r JOIN products p ON p.id=r.product_id WHERE r.photo_key=d.photo_key AND p.status='published' AND p.deleted_at IS NULL)`,args:[...batch,PUBLIC_MEDIA_PIPELINE]});
   for(const row of result.rows){const key=String(row.photo_key),size=String(row.preset) as PhotoSize,url=validatedPhotoUrl(row.public_url,key,size);if(url)(urls[key]??={})[size]=url;}
  }
  return clean.map(p=>({...p,photoUrls:Object.fromEntries(keys(p).filter(k=>urls[k]).map(k=>[k,urls[k]]))}));
 }catch{return clean}
}
export async function withListingMedia<T extends {products:MediaProduct[];featured:MediaProduct[];selected:MediaProduct[]}>(listing:T):Promise<T>{
 const lengths=[listing.products.length,listing.featured.length],all=await withReadyProductMedia([...listing.products,...listing.featured,...listing.selected]);
 return {...listing,products:all.slice(0,lengths[0]),featured:all.slice(lengths[0],lengths[0]+lengths[1]),selected:all.slice(lengths[0]+lengths[1])};
}
