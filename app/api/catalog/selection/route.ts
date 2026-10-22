import {boundary,db,productFromRow,groupFromRow,AppError} from '@/modules/catalog/server';
import {reservedQuantitySql} from '@/modules/catalog/reserve-inventory';
import {parseSelectionIds} from '@/modules/catalog/catalog-selection';
import {publicProduct,publicProductDetail,type SizeGroup} from '@/modules/catalog/catalog-types';
import {readTaxonomy} from '@/modules/catalog/taxonomy-service';
import {sweepReserveExpiry} from '@/modules/order/reserve-server';
import {conditionalResponse} from '@/modules/catalog/conditional-response';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Fresh stock for the current detail and the two device-local baskets. No inventory cache.
export async function GET(request:Request){return boundary(async()=>{
 const params=new URL(request.url).searchParams;let ids:string[];try{ids=parseSelectionIds(params.get('ids'));}catch{throw new AppError(400,'Pilihan produk tidak valid.');}
 const detailId=params.get('detail');if(detailId!==null&&!ids.includes(detailId))throw new AppError(400,'Pilihan detail produk tidak valid.');
 await sweepReserveExpiry();const d=db(),marks=ids.map(()=>'?').join(','),products=await d.prepare(`SELECT * FROM products WHERE status='published' AND id IN (${marks}) ORDER BY id`).bind(...ids).all<any>();
 const groups=await d.prepare(`SELECT g.*,${reservedQuantitySql('g')} AS reserved_qty FROM size_groups g JOIN products p ON p.id=g.product_id WHERE p.status='published' AND p.id IN (${marks}) ORDER BY g.sort_order,g.id`).bind(...ids).all<any>();
 const byProduct=new Map<string,SizeGroup[]>();for(const row of groups.results){const list=byProduct.get(row.product_id)??[];list.push(groupFromRow(row));byProduct.set(row.product_id,list);}
 return conditionalResponse(request,{products:products.results.map(p=>{const product=productFromRow(p,byProduct.get(p.id)??[]);return p.id===detailId?publicProductDetail(product):publicProduct(product)}),taxonomy:await readTaxonomy(),asOf:new Date().toISOString()});
})}
