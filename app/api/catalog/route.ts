import {readTaxonomy} from '@/modules/catalog/taxonomy-service';
import { boundary,readProducts,response } from '@/modules/catalog/server';
import {catalogInventory} from '@/modules/catalog/sold-lifecycle';
import { publicProduct } from '@/modules/catalog/catalog-types';
export const dynamic='force-dynamic';
export async function GET(){return boundary(async()=>{const now=Date.now(),inventory=catalogInventory(await readProducts(),now);return response({products:inventory.main.map(publicProduct),recentlySold:inventory.recentlySold.map(publicProduct),taxonomy:await readTaxonomy(),asOf:new Date(now).toISOString()})})}

export const runtime="nodejs";
