export type PhotoSize='thumb'|'cardSmall'|'card'|'detail';
export function photoUrl(key:string,size?:PhotoSize){return '/api/photos/'+encodeURIComponent(key)+(size?'?size='+size:'')}
export type PhotoUrls=Record<string,Partial<Record<PhotoSize,string>>>;
export function validatedPhotoUrl(value:unknown,key:string,size:PhotoSize){
 if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(key)||!['thumb','cardSmall','card','detail'].includes(size))return null;
 try{const url=new URL(value),prefix='/products/preview-v1/'+key+'/'+size+'-';
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)&&url.pathname.startsWith(prefix)&&/^[a-f0-9-]{36}\.webp$/.test(url.pathname.slice(prefix.length))?url.href:null;
 }catch{return null}
}
export function publicPhotoUrl(key:string,size:PhotoSize,urls?:PhotoUrls){return validatedPhotoUrl(urls?.[key]?.[size],key,size)??'/api/product-images/'+encodeURIComponent(key)+'?size='+size}
export function fallbackPhoto(image:HTMLImageElement,key:string){const original=photoUrl(key);if(image.getAttribute('src')!==original){image.removeAttribute?.('srcset');image.removeAttribute?.('sizes');image.src=original}}
