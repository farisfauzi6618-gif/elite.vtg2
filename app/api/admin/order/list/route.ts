import {api,json,owner} from '@/modules/order/order-server';
import {adminOrderFilters,readAdminOrderPage} from '@/modules/order/admin-orders';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>api(async()=>{
  await owner(request);
  return json(await readAdminOrderPage(adminOrderFilters(new URL(request.url).searchParams)));
});
