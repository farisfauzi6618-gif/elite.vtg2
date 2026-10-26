import {boundary,requireOwner,readJson,response} from '@/modules/catalog/server';
import {publicRate} from '@/modules/catalog/request-rate';
import {ownerCustomerRecovery} from '@/modules/catalog/customer-recovery';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=(request:Request)=>boundary(async()=>{
 const owner=await requireOwner(request);await publicRate(request,'owner-customer-recovery',30,owner.userId);
 const reply=response(await ownerCustomerRecovery(await readJson(request),owner.userId));reply.headers.set('Referrer-Policy','no-referrer');return reply;
});
