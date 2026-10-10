import {customers} from './catalog';
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", {
 id: integer("id").primaryKey(), ownerId: text("owner_id"), merchant: text("merchant").notNull().default("ELITE.VTG"), qrisKey: text("qris_key"), qrisMime: text("qris_mime"), botCipher: text("bot_cipher"), botUsername: text("bot_username"), chatId: text("chat_id"), chatName: text("chat_name"), pairNonce: text("pair_nonce"), pairExpires: integer("pair_expires"), candidateId: text("candidate_id"), candidateName: text("candidate_name"), shippingCipher:text("shipping_cipher"), shippingConfig:text("shipping_config"), webhookCipher:text("webhook_cipher"), webhookActive:integer("webhook_active").notNull().default(0),
 kiriminCipher:text("kirimin_cipher"),kiriminConfig:text("kirimin_config"),kiriminPinCipher:text("kirimin_pin_cipher"),kiriminWebhookCipher:text("kirimin_webhook_cipher"),kiriminWebhookActive:integer("kirimin_webhook_active").notNull().default(0),
});
export const orders = sqliteTable("orders", {
 id: text("id").primaryKey(), sessionHash: text("session_hash").notNull(), createdAt: integer("created_at").notNull(), name: text("name").notNull(), phone: text("phone").notNull(), address: text("address").notNull(), postcode: text("postcode").notNull(), item: text("item").notNull(), total: integer("total").notNull(), itemAmount: integer("item_amount"),itemSubtotal:integer("item_subtotal"),discountAmount:integer("discount_amount").notNull().default(0),discountVoucherId:text("discount_voucher_id"),discountLabel:text("discount_label"),customerId:text("customer_id").references(()=>customers.id), shippingAmount: integer("shipping_amount"), shippingJson: text("shipping_json"), status: text("status").notNull().default("awaiting_proof"), proofKey: text("proof_key"), proofMime: text("proof_mime"), notifyStatus: text("notify_status").notNull().default("pending"), invoiceMessage: text("invoice_message"), proofMessage: text("proof_message"), recipientMessage: text("recipient_message"), notifyLease: integer("notify_lease").notNull().default(0), deliveryChat: text("delivery_chat"),
 paymentState:text("payment_state").notNull().default("awaiting_proof"),paymentMethod:text("payment_method").notNull().default("qris_dana"),confirmedAt:integer("confirmed_at"),confirmedBy:text("confirmed_by"),quantity:integer("quantity").notNull().default(1),itemsJson:text("items_json"),
 catalogCheckoutId:text('catalog_checkout_id'),catalogToken:text('catalog_token'),catalogItemsJson:text('catalog_items_json'),stockSyncState:text('stock_sync_state').notNull().default('unlinked'),stockSyncError:text('stock_sync_error'),
}, t=>[index("idx_orders_created").on(t.createdAt),index("idx_orders_session").on(t.sessionHash),uniqueIndex('idx_order_catalog_checkout').on(t.catalogCheckoutId)]);
export const limits = sqliteTable("limits", { key: text("key").primaryKey(), count: integer("count").notNull(), expires: integer("expires").notNull() });

export const shippingLocations = sqliteTable("shipping_locations", {id:integer("id").primaryKey(),payload:text("payload").notNull(),expiresAt:integer("expires_at").notNull()});
export const shippingQuotes = sqliteTable("shipping_quotes", {id:text("id").primaryKey(),payload:text("payload").notNull(),expiresAt:integer("expires_at").notNull()},t=>[index("idx_shipping_quotes_expires").on(t.expiresAt)]);

export const shipments=sqliteTable("shipments",{
 orderId:text("order_id").primaryKey().references(()=>orders.id), state:text("state").notNull().default("payment_confirmed"),lease:integer("lease").notNull().default(0), environment:text("environment"),configJson:text("config_json"),weightGrams:integer("weight_grams"),maxCost:integer("max_cost"),destinationJson:text("destination_json"),requestJson:text("request_json"),createSentAt:integer("create_sent_at"),providerId:text("provider_id"),providerNo:text("provider_no"),awb:text("awb"),pickupState:text("pickup_state").notNull().default("pending"),pickupJson:text("pickup_json"),labelPdf:text("label_pdf"),labelPng:text("label_png"),pdfMessage:text("pdf_message"),pngMessage:text("png_message"),summaryMessage:text("summary_message"),lastError:text("last_error"),insuranceState:text("insurance_state").notNull().default("unverified"),insuredValue:integer("insured_value"),insuranceFee:real("insurance_fee"),updatedAt:integer("updated_at").notNull(),
 provider:text("provider"),
},t=>[uniqueIndex("idx_shipments_provider_no").on(t.providerNo)]);
export const telegramReceipts=sqliteTable("telegram_receipts",{updateId:integer("update_id").primaryKey(),state:text("state").notNull(),lease:integer("lease").notNull(),createdAt:integer("created_at").notNull()});
export const trackingLinks=sqliteTable("tracking_links",{
 orderId:text("order_id").primaryKey().references(()=>orders.id),tokenHash:text("token_hash").notNull(),tokenCipher:text("token_cipher").notNull(),expiresAt:integer("expires_at").notNull(),createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("idx_tracking_links_token_hash").on(t.tokenHash)]);
export const shipmentTracking=sqliteTable("shipment_tracking",{
 orderId:text("order_id").primaryKey().references(()=>orders.id),awb:text("awb").notNull(),payload:text("payload"),checkedAt:integer("checked_at"),nextAttemptAt:integer("next_attempt_at").notNull().default(0),lease:integer("lease").notNull().default(0),lastError:text("last_error"),
});

export const kiriminSearchCache=sqliteTable("kirimin_search_cache",{key:text("key").primaryKey(),payload:text("payload").notNull(),expiresAt:integer("expires_at").notNull()});

export const firstPurchaseDiscounts=sqliteTable("first_purchase_discounts",{customerId:text("customer_id").primaryKey().references(()=>customers.id),orderId:text("order_id").notNull().unique().references(()=>orders.id),redeemedAt:integer("redeemed_at")});
