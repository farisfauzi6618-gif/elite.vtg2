import {purchasePromotion} from '@/modules/order/first-purchase-server';
import {previewRewards} from '@/modules/order/rewards-server';
import { api,json,rate } from '@/modules/order/order-server';
import { catalogQuote } from '@/modules/order/catalog-bridge';
export const GET=(request:Request)=>api(async()=>{await rate(request,'catalog-quote',60);const token=new URL(request.url).searchParams.get('token'),quote=await catalogQuote(token);if(quote.orderType==='reserve')return json({...quote,discountAmount:0});const promotion=await purchasePromotion(request.headers.get('cookie')),reward=await previewRewards(request,{context:'checkout',catalogToken:token});return json({...quote,promotion,discountAmount:reward.discount,reward})});

export const runtime="nodejs";
export const dynamic="force-dynamic";
