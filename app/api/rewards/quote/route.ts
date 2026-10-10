import {api,json,body,originCheck,rate} from '@/modules/order/order-server';
import {previewRewards} from '@/modules/order/rewards-server';
export const POST=(request:Request)=>api(async()=>{originCheck(request);await rate(request,'reward-preview',600);return json(await previewRewards(request,await body(request)));});
export const runtime='nodejs';
export const dynamic='force-dynamic';
