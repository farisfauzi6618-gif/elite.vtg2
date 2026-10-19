export type PhotoSize='thumb'|'cardSmall'|'card'|'detail';
export function photoUrl(key:string,size?:PhotoSize){return '/api/photos/'+encodeURIComponent(key)+(size?'?size='+size:'')}
export function publicPhotoUrl(key:string,size:PhotoSize){return '/api/product-images/'+encodeURIComponent(key)+'?size='+size}
export function fallbackPhoto(image:HTMLImageElement,key:string){const original=photoUrl(key);if(image.getAttribute('src')!==original){image.removeAttribute?.('srcset');image.removeAttribute?.('sizes');image.src=original}}
