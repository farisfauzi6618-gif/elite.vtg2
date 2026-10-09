import { boundary,requireAdmin,response } from '@/modules/catalog/server';
import { uploadPhoto } from '@/modules/catalog/photos';
export async function POST(request:Request){return boundary(async()=>{await requireAdmin(request);return response({photoKey:await uploadPhoto(request)})})}

export const runtime="nodejs";
export const dynamic="force-dynamic";
