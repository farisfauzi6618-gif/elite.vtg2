import {api,originCheck,rate} from '@/modules/order/order-server';
import {resumeFirstPurchase} from '@/modules/order/first-purchase-server';
export const POST=(request:Request)=>api(async()=>{originCheck(request);await rate(request,'promotion-resume',30);return resumeFirstPurchase(request);});
export const runtime='nodejs';
export const dynamic='force-dynamic';
