import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const shippingConfig = sqliteTable("shipping_config", {
  id: integer("id").primaryKey(), encryptedKey: text("encrypted_key").notNull(), originJson: text("origin_json").notNull(), updatedAt: text("updated_at").notNull(),
});
export const locationCache = sqliteTable("location_cache", {
  id: integer("id").primaryKey(), payload: text("payload").notNull(),
});
export const searchCache = sqliteTable("search_cache", {
  query: text("query").primaryKey(), payload: text("payload").notNull(), expiresAt: integer("expires_at").notNull(),
});
