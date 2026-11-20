type Emit=(event:string,details:Record<string,unknown>)=>void;
// The capture listener runs before React switches a failed preview to original.
export function imageObservers(emit:Emit){
 const pending=new WeakMap<HTMLImageElement,{key:string;productId?:string}>();
 function error(image:HTMLImageElement){
  if(image.closest('.qris-frame')){emit('error',{code:'qris_image_error'});return}
  if(!image.classList.contains('detail-main-photo'))return;
  const key=image.dataset.photoKey,productId=image.dataset.productId;
  if(!key)return;
  if(image.getAttribute('src')==='/api/photos/'+encodeURIComponent(key)){
   pending.delete(image);emit('error',{code:'critical_image',productId});
  }else pending.set(image,{key,productId});
 }
 function load(image:HTMLImageElement){
  const value=pending.get(image);if(!value)return;pending.delete(image);
  if(value.key===image.dataset.photoKey&&image.getAttribute('src')==='/api/photos/'+encodeURIComponent(value.key))emit('image_recovered',{productId:value.productId});
 }
 return {error,load};
}
