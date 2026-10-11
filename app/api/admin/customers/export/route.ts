import {boundary,requireOwner} from '@/modules/catalog/server';
import {exportCustomers} from '@/modules/catalog/customer-directory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>boundary(async()=>{await requireOwner(request);return exportCustomers(new URL(request.url).searchParams,request.signal)});
