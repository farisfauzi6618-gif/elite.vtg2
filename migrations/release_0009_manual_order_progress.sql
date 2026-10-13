ALTER TABLE orders ADD COLUMN proof_received_at INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN preparing_at INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN shipped_at INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN courier_name TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN post_purchase_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN post_purchase_updated_by TEXT;
--> statement-breakpoint
CREATE TRIGGER order_proof_received_timestamp AFTER UPDATE OF proof_key ON orders
WHEN OLD.proof_key IS NULL AND NEW.proof_key IS NOT NULL
BEGIN
 UPDATE orders SET proof_received_at=COALESCE(proof_received_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id;
END;
