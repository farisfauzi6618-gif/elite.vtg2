import {observe,checkoutObserved} from '@/modules/analytics/server';
import {watch} from '@/modules/analytics/errors';
import { checkoutRate } from '@/modules/catalog/request-rate';
import { boundary,readJson,response,AppError } from '@/modules/catalog/server';
import { createCheckout,checkoutConfigured } from '@/modules/catalog/checkout';
import { currentCustomer } from '@/modules/catalog/customers';
export const GET=()=>response({configured:checkoutConfigured()});
export const POST=(request:Request)=>watch(request,'checkout_error',()=>boundary(async()=>{if(request.headers.get('origin')!==new URL(request.url).origin)throw new AppError(403,'Buka pembayaran dari katalog ELITE.VTG.');await checkoutRate(request);const customer=await currentCustomer(request.headers.get('cookie'));return response(await createCheckout(await readJson(request),customer?.id??null,(id,products)=>observe(()=>checkoutObserved(request,id,products))),201)}));

export const runtime="nodejs";
export const dynamic="force-dynamic";
