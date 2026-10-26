import {productPhotos,type Product} from './catalog-types';
import {productShareSummary,productShareUrl} from './product-share';
import {photoUrl,publicPhotoUrl} from './photo-url';

export const STORY_WIDTH=1080,STORY_HEIGHT=1920;
export function containImage(width:number,height:number,box={x:96,y:260,width:888,height:1080}){
 if(width<=0||height<=0)throw new Error('Foto produk tidak valid.');
 const scale=Math.min(box.width/width,box.height/height);
 return {x:box.x+(box.width-width*scale)/2,y:box.y+(box.height-height*scale)/2,width:width*scale,height:height*scale};
}
function lines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines=2){
 const words=text.replace(/\s+/g,' ').trim().split(' '),result:string[]=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){result.push(line);line=word;}else line=next;}
 if(line)result.push(line);
 const clipped=result.slice(0,maxLines);if(result.length>maxLines)clipped[maxLines-1]+='…';
 return clipped.map(value=>{while(ctx.measureText(value).width>maxWidth&&value.length>1)value=value.slice(0,-2)+'…';return value;});
}
export function drawStoryCard(ctx:CanvasRenderingContext2D,image:CanvasImageSource,width:number,height:number,product:Product){
 ctx.fillStyle='#f7f5ef';ctx.fillRect(0,0,STORY_WIDTH,STORY_HEIGHT);
 ctx.fillStyle='#092139';ctx.textAlign='center';ctx.font='48px Georgia, serif';ctx.fillText('ELITE.VTG',540,145);
 const box=containImage(width,height);ctx.drawImage(image,box.x,box.y,box.width,box.height);
 ctx.font='26px Arial, sans-serif';ctx.fillText(lines(ctx,product.brand||'',888,1)[0]||'',540,1430);
 ctx.font='48px Georgia, serif';lines(ctx,product.name,888).forEach((line,index)=>ctx.fillText(line,540,1504+index*60));
 const summary=productShareSummary(product).split(' · '),price=summary.pop()||'';
 ctx.font='27px Arial, sans-serif';ctx.fillText(lines(ctx,summary.join(' · ').toUpperCase(),888,1)[0]||'',540,1650);
 ctx.font='42px Georgia, serif';ctx.fillText(price,540,1730);
 ctx.font='24px Arial, sans-serif';ctx.fillText('View the piece at ELITE.VTG',540,1835);
}
function loadImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{
 const image=new Image(),timer=setTimeout(()=>{image.src='';reject(new Error('Foto belum dapat dimuat. Coba lagi.'));},20000);
 // The same-origin URL can redirect to public Blob. Request an anonymous CORS
 // image before assigning src so drawing it keeps the Story canvas exportable.
 image.crossOrigin='anonymous';
 image.onload=()=>{clearTimeout(timer);resolve(image)};image.onerror=()=>{clearTimeout(timer);reject(new Error('Foto belum dapat dimuat. Coba lagi.'))};image.src=src;
});}
// Loaded only after Instagram Story is chosen. No server rendering or new uploads.
export async function generateStoryCard(product:Product){
 productShareUrl(product);const key=productPhotos(product)[0];if(!key)throw new Error('Foto produk belum tersedia. Gunakan Copy Link.');
 let image:HTMLImageElement;try{image=await loadImage(publicPhotoUrl(key,'detail'))}catch{image=await loadImage(photoUrl(key))}
 const canvas=document.createElement('canvas');canvas.width=STORY_WIDTH;canvas.height=STORY_HEIGHT;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Story image belum didukung. Gunakan Copy Link.');
 drawStoryCard(ctx,image,image.naturalWidth,image.naturalHeight,product);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Story image gagal disiapkan. Coba lagi.')),'image/jpeg',.92));
 return new File([blob],'elitevtg-story-'+product.id+'.jpg',{type:'image/jpeg'});
}
