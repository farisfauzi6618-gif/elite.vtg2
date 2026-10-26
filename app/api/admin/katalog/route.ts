import {trashProduct,restoreProduct} from '@/modules/catalog/product-trash';
import {after} from 'next/server.js';
import {publicMediaEnabled,retryWithdrawnProductMedia} from '@/modules/catalog/public-product-media';
import {setFeatured} from '@/modules/catalog/featured-server';
import {readTaxonomy} from '@/modules/catalog/taxonomy-service';
import { boundary, requireAdmin, requireOwner, readJson, response, readProducts, readProduct, readHistory, db, AppError, textValue } from '@/modules/catalog/server';
import { instagramConfig } from '@/modules/catalog/instagram';
import { createManualDraft, saveProduct, changeStock, undoStock } from '@/modules/catalog/catalog-service';
import {setSoldVisibility} from '@/modules/catalog/sold-visibility';
import {conditionalResponse} from '@/modules/catalog/conditional-response';
import {reservedQuantitySql} from '@/modules/catalog/reserve-inventory';
export const dynamic='force-dynamic';
export async function GET(request:Request){return boundary(async()=>{await requireAdmin(request);const q=new URL(request.url).searchParams;
 if(q.get('view')==='version'){const id=textValue(q.get('id'),100),p=await db().prepare('SELECT version FROM products WHERE id=? AND deleted_at IS NULL').bind(id).first<{version:number}>();if(!p)throw new AppError(404,'Barang tidak ditemukan.');const stock=await db().prepare(`SELECT g.id,g.revision,${reservedQuantitySql('g')} AS reservedQty FROM size_groups g WHERE g.product_id=? ORDER BY g.id`).bind(id).all();return conditionalResponse(request,{version:p.version,stock:stock.results})}
 if(q.get('view')==='trash')return conditionalResponse(request,{products:await readProducts(true,true,true)});
 if(q.get('view')==='list')return conditionalResponse(request,{products:await readProducts(true,true),taxonomy:await readTaxonomy()});
 if(q.has('id')){const p=await readProduct(q.get('id')!);return conditionalResponse(request,{product:p,history:await readHistory(p.id)})}
 if(q.get('view')==='connection'){await requireOwner(request);const last=await db().prepare('SELECT source,caption_status,photo_status,parse_status,message,instagram_url,created_at FROM import_attempts ORDER BY rowid DESC LIMIT 10').all();return response({config:instagramConfig(),attempts:last.results})}
 return conditionalResponse(request,{products:await readProducts(true),taxonomy:await readTaxonomy()});
})}
export async function POST(request:Request){return boundary(async()=>{const user=await requireAdmin(request);if(publicMediaEnabled())after(retryWithdrawnProductMedia);const data=await readJson(request);if(!data||typeof data!=='object')throw new AppError(400,'Data formulir tidak valid.');switch(data.op){
 case 'trash':return response(await trashProduct(data,user.userId));
 case 'restore':return response(await restoreProduct(data));
 case 'create':return response(await createManualDraft(data));
 case 'featured':return response({product:await setFeatured(data)});
 case 'soldVisibility':return response({product:await setSoldVisibility(data)});
 case 'manualImport':
 case 'instagramImport':throw new AppError(410,'Impor caption dan Instagram sudah dihapus. Tambahkan barang melalui formulir manual.');
 case 'save':return response({product:await saveProduct(data,user.userId),history:await readHistory(textValue(data.id,100))});
 case 'stock':{const result=await changeStock(data,user.userId);return response({...result,history:await readHistory(result.product.id)})}
 case 'undo':{const p=await undoStock(data,user.userId);return response({product:p,history:await readHistory(p.id)})}
 case 'checkInstagram':await requireOwner(request);throw new AppError(410,'Koneksi impor Instagram sudah dinonaktifkan. Gunakan formulir barang manual.');
 default:throw new AppError(400,'Aksi tidak dikenal.');
 }})}

export const runtime="nodejs";
