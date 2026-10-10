import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
import {customers} from './catalog';
import {orders} from './order';
export const purchaseVouchers=sqliteTable('purchase_vouchers',{
 id:text('id').primaryKey(),label:text('label').notNull(),ownerUserId:text('owner_user_id').references(()=>customers.id),type:text('type').notNull(),percentage:integer('percentage'),fixedAmount:integer('fixed_amount'),minimumOrder:integer('minimum_order').notNull().default(0),maximumDiscount:integer('maximum_discount'),validFrom:integer('valid_from').notNull(),validUntil:integer('valid_until'),usageLimit:integer('usage_limit'),usageCount:integer('usage_count').notNull().default(0),applicableCategories:text('applicable_categories').notNull().default('[]'),applicableProducts:text('applicable_products').notNull().default('[]'),firstOrderOnly:integer('first_order_only').notNull().default(0),active:integer('active').notNull().default(1)
});
export const purchaseVoucherClaims=sqliteTable('purchase_voucher_claims',{voucherId:text('voucher_id').notNull().references(()=>purchaseVouchers.id),orderId:text('order_id').notNull().unique().references(()=>orders.id),customerId:text('customer_id').notNull().references(()=>customers.id),reservedAt:integer('reserved_at').notNull(),redeemedAt:integer('redeemed_at')},t=>[primaryKey({columns:[t.voucherId,t.orderId]})]);
