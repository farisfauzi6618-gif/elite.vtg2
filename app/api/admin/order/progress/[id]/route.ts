import {api,json,owner,originCheck,body,rate} from '@/modules/order/order-server';
import {updateManualProgress} from '@/modules/order/manual-progress';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=(r:Request,ctx:{params:Promise<{id:string}>})=>api(async()=>{originCheck(r);const actor=await owner(r);await rate(r,'manual_order_progress',60);const {id}=await ctx.params;return json(await updateManualProgress(id,await body(r),'owner:'+actor.userId));});
