ALTER TABLE products ADD orderable_at TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD customer_id TEXT REFERENCES customers(id);
--> statement-breakpoint
ALTER TABLE orders ADD item_subtotal INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD discount_amount INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE orders SET customer_id=(SELECT customer_id FROM catalog_checkouts WHERE catalog_checkouts.id=orders.catalog_checkout_id) WHERE catalog_checkout_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_order_customer ON orders(customer_id,confirmed_at);
--> statement-breakpoint
CREATE TABLE first_purchase_discounts (
 customer_id TEXT PRIMARY KEY NOT NULL REFERENCES customers(id),
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 redeemed_at INTEGER
);
