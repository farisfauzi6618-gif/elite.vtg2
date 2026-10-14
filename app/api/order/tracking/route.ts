import {reserveSummary,sweepReserveExpiry} from '@/modules/order/reserve-server';
import {orderProgress} from '@/modules/order/order-progress';
import { api,json,originCheck,body,rate } from "@/modules/order/order-server";
import { trackingOrder,trackingAccess,lookupTracking,customerTracking } from "@/modules/order/customer-tracking";
export const GET=(r:Request)=>api(async()=>{await sweepReserveExpiry();const o=await trackingOrder(r);await rate(r,"tracking_read",150);const access=await trackingAccess(o);const progress=await customerTracking(o);return json({...progress,reservation:await reserveSummary(o),progress:orderProgress(o,progress),accessUrl:access.url});});
export const POST=(r:Request)=>api(async()=>{originCheck(r);await rate(r,"tracking_lookup",8);const v=await body(r),o=await lookupTracking(v.invoice,v.phone),access=await trackingAccess(o);const progress=await customerTracking(o);return json({...progress,progress:orderProgress(o,progress),accessUrl:access.url});});

export const runtime="nodejs";
export const dynamic="force-dynamic";
