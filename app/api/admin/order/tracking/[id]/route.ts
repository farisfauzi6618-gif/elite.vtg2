import { api,json,owner,db,AppError } from "@/modules/order/order-server";
import { trackingAccess,customerTracking } from "@/modules/order/customer-tracking";
import type { Order } from "@/modules/order/order-types";
export const GET=(r:Request,ctx:{params:Promise<{id:string}>})=>api(async()=>{await owner(r);const {id}=await ctx.params,o=await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Order>();if(!o)throw new AppError(404,"Pesanan tidak ditemukan.");const access=await trackingAccess(o);return json({...await customerTracking(o),accessUrl:access.url});});

export const runtime="nodejs";
export const dynamic="force-dynamic";
