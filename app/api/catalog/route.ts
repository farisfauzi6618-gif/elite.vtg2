import {readTaxonomy} from '@/modules/catalog/taxonomy-service';
import { boundary,readProducts } from '@/modules/catalog/server';
import {catalogInventory} from '@/modules/catalog/sold-lifecycle';
import { publicProduct } from '@/modules/catalog/catalog-types';
import {conditionalResponse} from '@/modules/catalog/conditional-response';
export const dynamic='force-dynamic';
export async function GET(request:Request){return boundary(async()=>{const now=Date.now(),inventory=catalogInventory(await readProducts(),now);return conditionalResponse(request??new Request('http://localhost/api/catalog'),{products:inventory.main.map(publicProduct),recentlySold:inventory.recentlySold.map(publicProduct),taxonomy:await readTaxonomy(),asOf:new Date(now).toISOString()})})}

export const runtime="nodejs";
