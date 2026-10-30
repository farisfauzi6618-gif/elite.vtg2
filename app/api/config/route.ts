import {protectionConfig} from '@/modules/order/shipping-protection';
import { api,json,settings,ready } from "@/modules/order/order-server";
import { kiriminSettings } from "@/modules/order/shipping-settings";
import { catalogHealth } from "@/modules/order/catalog-bridge";
import { paymentConfig } from "@/modules/order/payment-config";
export const GET=()=>api(async()=>{
 const [s,payment,protection,catalogConnected]=await Promise.all([settings(),paymentConfig(),protectionConfig(),catalogHealth()]);
 const [{config},isReady]=await Promise.all([kiriminSettings(s),ready(s,payment)]);
 return json({shippingProtection:protection.enabled,ready:isReady,payment,merchant:payment.qris?.merchant,qris:!!payment.qris,defaultGrams:config.defaultGrams,catalogConnected});
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
