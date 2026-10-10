import {boundary,response,AppError} from '@/modules/catalog/server';
import {requireAnalytics} from '@/modules/analytics/server';
import {analyticsReport} from '@/modules/analytics/report';
import {dateRange} from '@/modules/analytics/common';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(r:Request)=>boundary(async()=>{await requireAnalytics(r);const params=new URL(r.url).searchParams;try{dateRange(params)}catch(e){throw new AppError(400,e instanceof Error?e.message:'Rentang tidak valid.')}return response(await analyticsReport(params))});
