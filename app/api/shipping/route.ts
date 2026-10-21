import {checkoutProtectionConfig,protectShippingQuotes} from '@/modules/order/shipping-protection';
import {previewRewards} from '@/modules/order/rewards-server';
import {regularJnt} from '@/modules/order/shipping-types';
import {watch} from '@/modules/analytics/errors';
import { api,json,body,originCheck,rate,AppError } from "@/modules/order/order-server";
import { searchDestinations,shippingQuote,shippingQuotes } from "@/modules/order/checkout-shipping";
import { catalogQuote } from "@/modules/order/catalog-bridge";
import { orderShippingGrams } from "@/modules/order/order-items";
export const POST=(r:Request)=>watch(r,'shipping_api_error',()=>api(async()=>{
 originCheck(r);const v=await body(r);
 if(v.action==="search"){await rate(r,"shipping_search",80);return json({locations:await searchDestinations(v.query)});}
 if(v.action==="quote"||v.action==="rates"){
  await rate(r,"shipping_quote",30);
  const linked=v.catalogToken?await catalogQuote(v.catalogToken):null;
  const quantity=linked?linked.lines.reduce((sum,line)=>sum+line.quantity,0):v.quantity;
  let grams:number;try{grams=orderShippingGrams(quantity)}catch(e){throw new AppError(400,(e as Error).message)}
  const policy=await checkoutProtectionConfig(r);
  if(!policy.enabled)return json(v.action==='rates'?{quotes:await shippingQuotes(v.destinationId,grams)}:await shippingQuote(v.destinationId,grams));
  const value=linked?.orderType==='reserve'?linked.amount:(await previewRewards(r,linked?{context:'checkout',catalogToken:v.catalogToken,choice:v.rewardChoice}:{context:'manual',itemAmount:v.itemAmount,choice:v.rewardChoice},linked??undefined)).net;
  let quotes;try{quotes=await protectShippingQuotes(await shippingQuotes(v.destinationId,grams,'jnt',{declaredValue:value,policyVersion:policy.version}),value,policy)}catch(e){if(e instanceof AppError&&e.status>=500)throw new AppError(503,'Total pengiriman terlindungi belum dapat dihitung. Coba lagi atau hubungi ELITE.VTG.');throw e;}
  return json(v.action==='rates'?{quotes}:quotes.find(q=>regularJnt(q.service))||quotes[0]);
 }
 throw new AppError(400,"Permintaan ongkir tidak valid.");
}));

export const runtime="nodejs";
export const dynamic="force-dynamic";
