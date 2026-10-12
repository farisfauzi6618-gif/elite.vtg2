export type PhotoSize='thumb'|'cardSmall'|'card'|'detail';
export function photoUrl(key:string,size?:PhotoSize){return '/api/photos/'+encodeURIComponent(key)+(size?'?size='+size:'')}
export function fallbackPhoto(image:HTMLImageElement,key:string){const original=photoUrl(key);if(image.getAttribute('src')!==original)image.src=original}
