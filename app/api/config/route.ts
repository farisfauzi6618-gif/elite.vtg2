import { api,json,settings,ready } from "@/modules/order/order-server";
import { kiriminSettings } from "@/modules/order/shipping-settings";
import { catalogHealth } from "@/modules/order/catalog-bridge";
import { paymentConfig } from "@/modules/order/payment-config";
export const GET=()=>api(async()=>{const s=await settings(),{config}=await kiriminSettings(),payment=await paymentConfig();return json({ready:await ready(s,payment),payment,merchant:payment.qris?.merchant,qris:!!payment.qris,defaultGrams:config.defaultGrams,catalogConnected:await catalogHealth()});});

export const runtime="nodejs";
export const dynamic="force-dynamic";
