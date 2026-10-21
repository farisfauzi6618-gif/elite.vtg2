import {api,json,owner,originCheck,body,rate} from '@/modules/order/order-server';
import {protectionConfig,saveProtectionConfig} from '@/modules/order/shipping-protection';
import {kiriminRatesReady} from '@/modules/order/shipping-settings';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=(r:Request)=>api(async()=>{await owner(r);return json({config:await protectionConfig(),apiReady:await kiriminRatesReady()})});
export const POST=(r:Request)=>api(async()=>{originCheck(r);const actor=await owner(r);await rate(r,'protection_settings',30);return json({config:await saveProtectionConfig(await body(r),'owner:'+actor.userId),apiReady:await kiriminRatesReady()})});
