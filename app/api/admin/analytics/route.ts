import {boundary,response,AppError} from '@/modules/catalog/server';
import {requireAnalytics} from '@/modules/analytics/server';
import {analyticsReport,type AnalyticsReport} from '@/modules/analytics/report';
import {dateRange} from '@/modules/analytics/common';
import {reportCache} from '@/modules/admin/report-cache';
import {catalogStamp} from '@/modules/catalog/catalog-read-snapshot';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reports=reportCache<AnalyticsReport>(30_000);
export const GET=(r:Request)=>boundary(async()=>{
 const user=await requireAnalytics(r),params=new URL(r.url).searchParams,view=params.get('view')||'all';
 if(!['all','overview','products','search','traffic'].includes(view))throw new AppError(400,'Tampilan Analytics tidak valid.');
 let range;try{range=dateRange(params)}catch(e){throw new AppError(400,e instanceof Error?e.message:'Rentang tidak valid.')}
 const stamp=view==='products'||view==='all'?await catalogStamp():'';
 const key=JSON.stringify([user.userId,range.start,range.end,view,stamp]);
 const reply=response(await reports.read(key,()=>analyticsReport(params)));
 reply.headers.set('Cache-Control','private, no-store');reply.headers.set('Vary','Cookie');
 return reply;
});
