import {boundary,AppError} from '@/modules/catalog/server';
import {publishedPhoto} from '@/modules/catalog/photo-publication';
import {photoPreview,PHOTO_PREVIEW_EDGES,type PhotoPreviewSize} from '@/modules/catalog/photo-preview';
import {publicProductMediaUrl} from '@/modules/catalog/public-product-media';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export const GET=(request:Request,{params}:{params:Promise<{key:string}>})=>boundary(async()=>{
 const {key}=await params,size=new URL(request.url).searchParams.get('size');
 if(!/^[a-f0-9-]{36}$/.test(key))throw new AppError(404,'Foto tidak ditemukan.');
 if(!size||!Object.hasOwn(PHOTO_PREVIEW_EDGES,size))throw new AppError(400,'Ukuran foto tidak didukung.');
 if(!await publishedPhoto(key))throw new AppError(404,'Foto tidak ditemukan.');
 const headers=new Headers({
  'Cache-Control':'private, max-age=86400, immutable',
  // Only this public-only route opts into the shared Vercel cache. No SWR.
  'Vercel-CDN-Cache-Control':'public, s-maxage=60, must-revalidate',
  'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",
  'Cross-Origin-Resource-Policy':'same-origin',
  'ETag':`W/"public-photo-${key}-v1-${size}"`,
 });
 const etag=headers.get('ETag')!;
 if(request.headers.get('if-none-match')?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,'')))return new Response(null,{status:304,headers});
 const direct=await publicProductMediaUrl(key,size as PhotoPreviewSize,photoPreview);
 if(direct){headers.set('Location',direct);headers.set('Cache-Control','private, max-age=60');return new Response(null,{status:307,headers})}
 const image=await photoPreview(key,size as PhotoPreviewSize,true);
 if(!image)throw new AppError(404,'Foto tidak ditemukan.');
 headers.set('Content-Type',image.contentType);
 return new Response(image.body as BodyInit,{headers});
});
