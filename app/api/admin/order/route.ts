import { api,json,owner,settings,db,ready,publicOrder } from "@/modules/order/order-server";
import {readAdminOrderPage} from "@/modules/order/admin-orders";
import { ensureTelegramWebhook } from "@/modules/order/telegram-actions";
import { catalogHealth } from "@/modules/order/catalog-bridge";
import { paymentConfig } from "@/modules/order/payment-config";
export const GET=(r:Request)=>api(async()=>{await owner(r);const s=await settings();let webhookError:string|undefined;if(s?.bot_cipher&&s.chat_id&&!s.webhook_active){try{await ensureTelegramWebhook(s);}catch(e){webhookError=e instanceof Error?e.message:"Konfirmasi Telegram belum aktif.";}}
const orders=new URL(r.url).searchParams.get('view')==='settings'?[]:(await readAdminOrderPage({pageSize:100})).orders;const payment=await paymentConfig();return json({payment,merchant:payment.qris?.merchant,qris:!!payment.qris,bot:s?.bot_username,chat:s?.chat_name,ready:await ready(s,payment),catalogConnected:await catalogHealth(),webhookError,orders});});

export const runtime="nodejs";
export const dynamic="force-dynamic";
