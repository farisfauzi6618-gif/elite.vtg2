import {reserveSummary,sweepReserveExpiry} from '@/modules/order/reserve-server';
import {orderProgress} from '@/modules/order/order-progress';
import { api,json,originCheck,body,rate } from "@/modules/order/order-server";
import { trackingOrder,trackingAccess,lookupTracking,customerTracking } from "@/modules/order/customer-tracking";
import type {Order} from '@/modules/order/order-types';
async function trackingResponse(o:Order){const access=await trackingAccess(o),progress=await customerTracking(o);return json({...progress,reservation:await reserveSummary(o),progress:orderProgress(o,progress),accessUrl:access.url});}
export const GET=(r:Request)=>api(async()=>{await sweepReserveExpiry();const o=await trackingOrder(r);await rate(r,"tracking_read",150);return trackingResponse(o);});
export const POST=(r:Request)=>api(async()=>{originCheck(r);await rate(r,"tracking_lookup",8);const v=await body(r);return trackingResponse(await lookupTracking(v.invoice,v.phone));});

export const runtime="nodejs";
export const dynamic="force-dynamic";
