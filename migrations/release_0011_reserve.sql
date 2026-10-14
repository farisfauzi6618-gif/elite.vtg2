ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'normal' CHECK(order_type IN ('normal','reserve'));
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN reservation_status TEXT CHECK(reservation_status IN ('AWAITING_DEPOSIT','RESERVED','PARTIALLY_PAID','PAID','EXPIRED','CANCELLED'));
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN reservation_started_at INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN reservation_deadline INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN deposit_minimum INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN deposit_amount INTEGER;
--> statement-breakpoint
ALTER TABLE catalog_checkouts ADD COLUMN order_type TEXT NOT NULL DEFAULT 'normal' CHECK(order_type IN ('normal','reserve'));
--> statement-breakpoint
CREATE TABLE reserve_items(order_id TEXT NOT NULL REFERENCES orders(id),group_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','released','sold')),PRIMARY KEY(order_id,group_id));
--> statement-breakpoint
CREATE INDEX reserve_items_active_group ON reserve_items(group_id,order_id,quantity) WHERE state='active';
--> statement-breakpoint
CREATE INDEX orders_reserve_expiry ON orders(reservation_deadline) WHERE order_type='reserve' AND reservation_status IN ('RESERVED','PARTIALLY_PAID');
--> statement-breakpoint
CREATE TABLE reserve_payments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),amount INTEGER NOT NULL CHECK(amount>0),payment_method TEXT NOT NULL CHECK(payment_method IN ('bca_transfer','qris_dana')),state TEXT NOT NULL DEFAULT 'awaiting_proof' CHECK(state IN ('awaiting_proof','submitted','confirmed','rejected')),created_at INTEGER NOT NULL,submitted_at INTEGER,confirmed_at INTEGER,confirmed_by TEXT,proof_key TEXT,proof_mime TEXT,source TEXT NOT NULL DEFAULT 'customer' CHECK(source IN ('customer','owner')),note TEXT,notify_status TEXT NOT NULL DEFAULT 'pending',notify_lease INTEGER NOT NULL DEFAULT 0,delivery_chat TEXT,message_id TEXT);
--> statement-breakpoint
CREATE UNIQUE INDEX reserve_one_pending_payment ON reserve_payments(order_id) WHERE state IN ('awaiting_proof','submitted');
--> statement-breakpoint
CREATE INDEX reserve_payment_history ON reserve_payments(order_id,created_at,id);
--> statement-breakpoint
CREATE TABLE reserve_audit(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),action TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL,previous_deadline INTEGER,new_deadline INTEGER,payment_id TEXT,amount INTEGER,note TEXT);
--> statement-breakpoint
CREATE TABLE reserve_config(id INTEGER PRIMARY KEY CHECK(id=1),policy_text TEXT NOT NULL DEFAULT '',policy_version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER);
--> statement-breakpoint
INSERT INTO reserve_config(id) VALUES(1);
--> statement-breakpoint
CREATE TABLE reserve_event_values(event_id TEXT PRIMARY KEY REFERENCES analytics_events(id) ON DELETE CASCADE,values_json TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER reserve_protect_inventory BEFORE UPDATE OF qty ON size_groups
WHEN COALESCE(NEW.qty,0)<COALESCE((SELECT SUM(i.quantity) FROM reserve_items i JOIN orders o ON o.id=i.order_id WHERE i.group_id=OLD.id AND i.state='active' AND o.reservation_status IN ('RESERVED','PARTIALLY_PAID') AND o.reservation_deadline>unixepoch('subsec')*1000),0)
BEGIN SELECT RAISE(ABORT,'Stock is locked by an active Reserve order'); END;
--> statement-breakpoint
CREATE TRIGGER reserve_protect_variant BEFORE DELETE ON size_groups
WHEN EXISTS(SELECT 1 FROM reserve_items i JOIN orders o ON o.id=i.order_id WHERE i.group_id=OLD.id AND i.state='active' AND o.reservation_status IN ('RESERVED','PARTIALLY_PAID') AND o.reservation_deadline>unixepoch('subsec')*1000)
BEGIN SELECT RAISE(ABORT,'Variant is locked by an active Reserve order'); END;
