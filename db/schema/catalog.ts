import { sqliteTable, text, integer, real, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const products = sqliteTable('products', {
 id:text('id').primaryKey(), shortcode:text('shortcode').notNull(), instagramUrl:text('instagram_url').notNull(),
 name:text('name').notNull().default(''), brand:text('brand').notNull().default(''), category:text('category').notNull().default(''), color:text('color').notNull().default(''),
 legacyCategory:text('legacy_category').notNull().default(''),featureIds:text('feature_ids').notNull().default('[]'),
 price:integer('price'), condition:text('condition'), defects:text('defects'), photoKey:text('photo_key'), caption:text('caption').notNull().default(''), description:text('description').notNull().default(''), photoKeys:text('photo_keys').notNull().default('[]'),
 warnings:text('warnings').notNull().default('[]'), reviewed:integer('reviewed').notNull().default(0), status:text('status').notNull().default('draft'),
 createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull(), publishedAt:text('published_at'),orderableAt:text('orderable_at'), version:integer('version').notNull().default(0), lastMutation:text('last_mutation'),
},t=>[uniqueIndex('idx_products_shortcode').on(t.shortcode),index('idx_products_status_published').on(t.status,t.publishedAt),check('product_price_valid',sql`${t.price} IS NULL OR (${t.price} >= 0 AND ${t.price} <= 1000000000)`),check('product_status_valid',sql`${t.status} IN ('draft','published')`)]);
export const sizeGroups=sqliteTable('size_groups',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id),label:text('label').notNull().default(''),tagSize:text('tag_size').notNull().default(''),
 fits:text('fits').notNull().default('[]'),lengthCm:real('length_cm'),widthCm:real('width_cm'),qty:integer('qty'),price:integer('price'),condition:text('condition'),defects:text('defects'),
 revision:integer('revision').notNull().default(0),sortOrder:integer('sort_order').notNull().default(0),
},t=>[index('idx_groups_product').on(t.productId),check('group_qty_valid',sql`${t.qty} IS NULL OR (typeof(${t.qty}) = 'integer' AND ${t.qty} >= 0 AND ${t.qty} <= 100000)`),check('group_price_valid',sql`${t.price} IS NULL OR (${t.price} >= 0 AND ${t.price} <= 1000000000)`)]);
export const stockHistory=sqliteTable('stock_history',{
 id:text('id').primaryKey(),groupId:text('group_id').notNull().references(()=>sizeGroups.id),productId:text('product_id').notNull().references(()=>products.id),
 beforeQty:integer('before_qty'),afterQty:integer('after_qty'),beforeRevision:integer('before_revision').notNull(),afterRevision:integer('after_revision').notNull(),
 reason:text('reason').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),undoOf:text('undo_of'),
},t=>[index('idx_history_product_time').on(t.productId,t.createdAt),uniqueIndex('idx_history_undo').on(t.undoOf)]);
export const photos=sqliteTable('photos',{
 key:text('key').primaryKey(),contentType:text('content_type').notNull(),size:integer('size').notNull(),source:text('source').notNull(),createdAt:text('created_at').notNull(),
});
export const importAttempts=sqliteTable('import_attempts',{
 id:text('id').primaryKey(),instagramUrl:text('instagram_url').notNull(),source:text('source').notNull(),captionStatus:text('caption_status').notNull(),photoStatus:text('photo_status').notNull(),
 parseStatus:text('parse_status').notNull(),message:text('message').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_imports_time').on(t.createdAt)]);
export const customers=sqliteTable('customers',{
 id:text('id').primaryKey(),name:text('name').notNull(),identity:text('identity').notNull(),email:text('email'),phone:text('phone'),birthday:text('birthday'),passwordHash:text('password_hash').notNull(),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('idx_customer_identity').on(t.identity)]);
export const customerSessions=sqliteTable('customer_sessions',{
 hash:text('hash').primaryKey(),customerId:text('customer_id').notNull().references(()=>customers.id),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_customer_session_expiry').on(t.expiresAt)]);
export const catalogCheckouts=sqliteTable('catalog_checkouts',{
 id:text('id').primaryKey(),tokenHash:text('token_hash').notNull(),linesJson:text('lines_json').notNull(),amount:integer('amount').notNull(),expiresAt:integer('expires_at').notNull(),createdAt:integer('created_at').notNull(),customerId:text('customer_id').references(()=>customers.id),
},t=>[uniqueIndex('idx_catalog_checkout_token').on(t.tokenHash)]);
export const catalogSales=sqliteTable('catalog_sales',{
 orderId:text('order_id').primaryKey(),checkoutId:text('checkout_id').notNull().references(()=>catalogCheckouts.id),marker:text('marker').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('idx_catalog_sale_checkout').on(t.checkoutId)]);

export const requestLimits=sqliteTable('request_limits',{
 key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_request_limits_expires').on(t.expiresAt)]);

export const adminAccess=sqliteTable('admin_access',{
 id:integer('id').primaryKey(),userId:text('user_id').notNull(),createdAt:text('created_at').notNull(),
},t=>[check('admin_access_single_owner',sql`${t.id} = 1`)]);

export const teamAccess=sqliteTable('team_access',{
 id:text('id').primaryKey(),slot:integer('slot').notNull(),name:text('name').notNull(),tokenHash:text('token_hash').notNull(),tokenCipher:text('token_cipher').notNull(),active:integer('active').notNull().default(1),version:integer('version').notNull().default(0),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[uniqueIndex('idx_team_slot').on(t.slot),uniqueIndex('idx_team_token').on(t.tokenHash),check('team_slot_valid',sql`${t.slot} BETWEEN 1 AND 3`),check('team_active_valid',sql`${t.active} IN (0,1)`)]);
export const teamSessions=sqliteTable('team_sessions',{
 hash:text('hash').primaryKey(),accessId:text('access_id').notNull().references(()=>teamAccess.id),version:integer('version').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_team_session_access').on(t.accessId),index('idx_team_session_expiry').on(t.expiresAt)]);

export const catalogFeatures=sqliteTable('catalog_features',{
 id:text('id').primaryKey(),label:text('label').notNull(),groupId:text('group_id').notNull(),sortOrder:integer('sort_order').notNull().default(0),
},t=>[check('feature_group_valid',sql`${t.groupId} IN ('opening','knit','sleeve','style')`)]);
export const featureAliases=sqliteTable('feature_aliases',{
 aliasKey:text('alias_key').primaryKey(),featureId:text('feature_id').notNull().references(()=>catalogFeatures.id),value:text('value').notNull(),
},t=>[index('idx_feature_alias_term').on(t.featureId)]);
