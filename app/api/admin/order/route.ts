import { api,json,owner,settings,db,ready,publicOrder } from "@/modules/order/order-server";
import { shipment,shipmentSummary } from "@/modules/order/fulfilment";
import { ensureTelegramWebhook } from "@/modules/order/telegram-actions";
import { catalogHealth } from "@/modules/order/catalog-bridge";
import { paymentConfig } from "@/modules/order/payment-config";
export const GET=(r:Request)=>api(async()=>{await owner(r);const s=await settings();let webhookError:string|undefined;if(s?.bot_cipher&&s.chat_id&&!s.webhook_active){try{await ensureTelegramWebhook(s);}catch(e){webhookError=e instanceof Error?e.message:"Konfirmasi Telegram belum aktif.";}}
const rows=await db().prepare("SELECT payment_method,id,created_at,name,phone,address,postcode,item,quantity,items_json,total,item_amount,shipping_amount,status,notify_status,payment_state,confirmed_at,catalog_checkout_id,catalog_items_json,stock_sync_state,stock_sync_error,proof_key IS NOT NULL AS has_proof,shipping_json FROM orders WHERE proof_key IS NOT NULL ORDER BY created_at DESC LIMIT 100").all<import("@/modules/order/order-types").Order & {has_proof:number}>();const orders=await Promise.all(rows.results.map(async o=>({...publicOrder(o),has_proof:o.has_proof,payment_state:o.confirmed_at?"payment_confirmed":"proof_received",confirmed_at:o.confirmed_at,stock_sync_state:o.stock_sync_state,stock_sync_error:o.stock_sync_error,shipment:shipmentSummary(await shipment(o.id))})));const payment=await paymentConfig();return json({payment,merchant:payment.qris?.merchant,qris:!!payment.qris,bot:s?.bot_username,chat:s?.chat_name,ready:await ready(s,payment),catalogConnected:await catalogHealth(),webhookError,orders});});

export const runtime="nodejs";
export const dynamic="force-dynamic";
