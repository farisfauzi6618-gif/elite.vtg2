import { boundary,db,bucket,isAdmin,AppError } from '@/modules/catalog/server';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{key:string}>}){return boundary(async()=>{const {key}=await params;if(!/^[a-f0-9-]{36}$/.test(key))throw new AppError(404,'Foto tidak ditemukan.');const publicPhoto=await db().prepare('SELECT id FROM products WHERE status=\'published\' AND (photo_key=? OR EXISTS (SELECT 1 FROM json_each(products.photo_keys) WHERE value=?)) LIMIT 1').bind(key,key).first();if(!publicPhoto&&!await isAdmin(request))throw new AppError(404,'Foto tidak ditemukan.');const object=await bucket().get(key);if(!object)throw new AppError(404,'Foto tidak ditemukan.');return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}})})}

export const runtime="nodejs";
