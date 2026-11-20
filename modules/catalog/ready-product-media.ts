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
   // Look up the complete existing primary key for each requested rendition.
   // Filtering by state alone can choose the cleanup index and scan all ready media.
   const result=await getSqlClient().execute({sql:`WITH requested_photos(photo_key) AS (VALUES ${batch.map(()=>'(?)').join(',')}), requested_presets(preset) AS (VALUES ('thumb'),('cardSmall'),('card'),('detail')) SELECT d.photo_key,d.preset,d.public_url FROM requested_photos k CROSS JOIN requested_presets s CROSS JOIN photo_public_derivatives d ON d.photo_key=k.photo_key AND d.preset=s.preset AND d.pipeline=? WHERE d.state='ready' AND EXISTS (SELECT 1 FROM photo_public_references r JOIN products p ON p.id=r.product_id WHERE r.photo_key=d.photo_key AND p.status='published' AND p.deleted_at IS NULL)`,args:[...batch,PUBLIC_MEDIA_PIPELINE]});
   for(const row of result.rows){const key=String(row.photo_key),size=String(row.preset) as PhotoSize,url=validatedPhotoUrl(row.public_url,key,size);if(url)(urls[key]??={})[size]=url;}
  }
  return clean.map(p=>({...p,photoUrls:Object.fromEntries(keys(p).filter(k=>urls[k]).map(k=>[k,urls[k]]))}));
 }catch{return clean}
}
export async function withListingMedia<T extends {products:MediaProduct[];featured:MediaProduct[];selected:MediaProduct[]}>(listing:T):Promise<T>{
 const lengths=[listing.products.length,listing.featured.length],all=await withReadyProductMedia([...listing.products,...listing.featured,...listing.selected]);
 return {...listing,products:all.slice(0,lengths[0]),featured:all.slice(lengths[0],lengths[0]+lengths[1]),selected:all.slice(lengths[0]+lengths[1])};
}
