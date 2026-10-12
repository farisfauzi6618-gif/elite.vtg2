import { boundary,db,bucket,isAdmin,AppError } from '@/modules/catalog/server';
import {photoPreview,PHOTO_PREVIEW_EDGES,type PhotoPreviewSize} from '@/modules/catalog/photo-preview';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{key:string}>}){
 return boundary(async()=>{
  const {key}=await params;
  if(!/^[a-f0-9-]{36}$/.test(key))throw new AppError(404,'Foto tidak ditemukan.');
  const publicPhoto=await db().prepare("SELECT id FROM products WHERE status='published' AND (photo_key=? OR EXISTS (SELECT 1 FROM json_each(products.photo_keys) WHERE value=?)) LIMIT 1").bind(key,key).first();
  if(!publicPhoto&&!await isAdmin(request))throw new AppError(404,'Foto tidak ditemukan.');
  const requestedSize=new URL(request.url).searchParams.get('size');
  if(requestedSize&&!Object.hasOwn(PHOTO_PREVIEW_EDGES,requestedSize))throw new AppError(400,'Ukuran foto tidak didukung.');
  const previewSize=publicPhoto&&requestedSize?requestedSize as PhotoPreviewSize:null;
  // Upload/replacement always creates a fresh UUID. Keep this response out of
  // shared HTTP caches: the same endpoint can also serve an owner's private draft.
  const headers=new Headers({
   'Cache-Control':publicPhoto?'private, max-age=86400, immutable':'private, no-store',
   'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",
   'Cross-Origin-Resource-Policy':'same-origin',
  });
  const etag=`W/"photo-${key}${previewSize?'-preview-v1-'+previewSize:''}"`;
  if(publicPhoto){
   headers.set('ETag',etag);
   // Check publication/authorization above even when the browser has the bytes.
   const matches=request.headers.get('if-none-match')?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
   if(matches)return new Response(null,{status:304,headers});
  }
  if(previewSize){const preview=await photoPreview(key,previewSize);if(!preview)throw new AppError(404,'Foto tidak ditemukan.');headers.set('Content-Type',preview.contentType);return new Response(preview.body as BodyInit,{headers})}
  const object=await bucket().get(key,{useCache:!!publicPhoto});
  if(!object)throw new AppError(404,'Foto tidak ditemukan.');
  headers.set('Content-Type',object.httpMetadata?.contentType??'image/jpeg');
  return new Response(object.body,{headers});
 });
}

export const runtime="nodejs";
