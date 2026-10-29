import {boundary} from '@/modules/catalog/server';
import {photoPreview} from '@/modules/catalog/photo-preview';
import {publicProductImageResponse} from '@/modules/catalog/public-product-media';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export const GET=(request:Request,{params}:{params:Promise<{key:string}>})=>boundary(async()=>{
 const {key}=await params;
 return publicProductImageResponse(request,key,photoPreview);
});
