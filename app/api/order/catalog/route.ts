import { api,json,rate } from '@/modules/order/order-server';
import { catalogQuote } from '@/modules/order/catalog-bridge';
export const GET=(request:Request)=>api(async()=>{await rate(request,'catalog-quote',60);return json(await catalogQuote(new URL(request.url).searchParams.get('token')))});

export const runtime="nodejs";
export const dynamic="force-dynamic";
