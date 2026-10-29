import {sweepReserveExpiry} from '@/modules/order/reserve-server';
import {readTaxonomy} from '@/modules/catalog/taxonomy-service';
import { boundary,readProducts } from '@/modules/catalog/server';
import {catalogInventory} from '@/modules/catalog/sold-lifecycle';
import { publicProduct } from '@/modules/catalog/catalog-types';
import {conditionalResponse} from '@/modules/catalog/conditional-response';
import {listingPage,listingRequest} from '@/modules/catalog/catalog-listing-page';
import {AppError} from '@/modules/catalog/server';
import {versionedCatalogResponse} from '@/modules/catalog/catalog-read-snapshot';
export const dynamic='force-dynamic';
export async function GET(request:Request){return boundary(async()=>{const current=request??new Request('http://localhost/api/catalog'),params=new URL(current.url).searchParams;if(params.get('paged')==='1'){let input;try{input=listingRequest(params)}catch(error){throw new AppError(400,(error as Error).message)}await sweepReserveExpiry();return versionedCatalogResponse(current,({products,taxonomy})=>listingPage(products,taxonomy,input) as unknown as Record<string,unknown>)}await sweepReserveExpiry();const now=Date.now(),inventory=catalogInventory(await readProducts(),now);return conditionalResponse(current,{products:inventory.main.map(publicProduct),recentlySold:inventory.recentlySold.map(publicProduct),taxonomy:await readTaxonomy(),asOf:new Date(now).toISOString()})})}

export const runtime="nodejs";
