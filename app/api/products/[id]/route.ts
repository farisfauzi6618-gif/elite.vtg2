import { boundary,readProduct,AppError } from '@/modules/catalog/server';
import { publicProduct } from '@/modules/catalog/catalog-types';
import {conditionalResponse} from '@/modules/catalog/conditional-response';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return boundary(async()=>{const {id}=await params;const p=await readProduct(id);if(p.status!=='published')throw new AppError(404,'Barang tidak tersedia.');return conditionalResponse(request,{product:publicProduct(p)})})}

export const runtime="nodejs";
