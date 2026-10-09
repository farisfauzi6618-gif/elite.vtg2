import {readTaxonomy} from '@/modules/catalog/taxonomy-service';
import { boundary,readProducts,response } from '@/modules/catalog/server';
import { publicProduct } from '@/modules/catalog/catalog-types';
export const dynamic='force-dynamic';
export async function GET(){return boundary(async()=>response({products:(await readProducts()).map(publicProduct),taxonomy:await readTaxonomy(),asOf:new Date().toISOString()}))}

export const runtime="nodejs";
