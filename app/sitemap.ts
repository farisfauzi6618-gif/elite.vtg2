import type {MetadataRoute} from 'next';
import {db} from '@/modules/catalog/server';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const products=await db().prepare("SELECT id,updated_at FROM products WHERE status='published' AND deleted_at IS NULL AND sold_hidden=0 ORDER BY id LIMIT 45000").all<{id:string;updated_at:string}>();
 return [{url:'https://elitevtg.com/'},{url:'https://elitevtg.com/recently-sold'},...products.results.filter(p=>/^[A-Za-z0-9_-]{1,100}$/.test(p.id)).map(p=>({url:'https://elitevtg.com/produk/'+encodeURIComponent(p.id),...(Number.isFinite(Date.parse(p.updated_at))?{lastModified:new Date(p.updated_at)}:{})}))];
}
