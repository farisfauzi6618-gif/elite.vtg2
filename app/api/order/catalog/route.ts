import {purchasePromotion} from '@/modules/order/first-purchase-server';
import {firstPurchaseDiscount} from '@/modules/order/first-purchase';
import { api,json,rate } from '@/modules/order/order-server';
import { catalogQuote } from '@/modules/order/catalog-bridge';
export const GET=(request:Request)=>api(async()=>{await rate(request,'catalog-quote',60);const quote=await catalogQuote(new URL(request.url).searchParams.get('token')),promotion=await purchasePromotion(request.headers.get('cookie'));return json({...quote,promotion,discountAmount:promotion.state==='available'?firstPurchaseDiscount(quote.amount):0})});

export const runtime="nodejs";
export const dynamic="force-dynamic";
