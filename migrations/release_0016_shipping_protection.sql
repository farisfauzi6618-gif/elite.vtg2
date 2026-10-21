ALTER TABLE orders ADD COLUMN shipping_protection_fee INTEGER CHECK(shipping_protection_fee IS NULL OR shipping_protection_fee > 0);
ALTER TABLE orders ADD COLUMN declared_shipping_value INTEGER CHECK(declared_shipping_value IS NULL OR declared_shipping_value > 0);
ALTER TABLE orders ADD COLUMN shipping_protection_source TEXT;
ALTER TABLE orders ADD COLUMN shipping_protection_confirmed_at INTEGER;
ALTER TABLE orders ADD COLUMN shipping_protection_reference TEXT;

CREATE TABLE shipping_protection_config (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 mode TEXT NOT NULL DEFAULT 'courier_api' CHECK(mode IN ('courier_api','jnt_counter')),
 rate_bps INTEGER NOT NULL DEFAULT 20 CHECK(rate_bps BETWEEN 1 AND 100),
 rounding_unit INTEGER NOT NULL DEFAULT 1 CHECK(rounding_unit BETWEEN 1 AND 1000),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER,
 updated_by TEXT
);
INSERT INTO shipping_protection_config(id) VALUES(1);

--> statement-breakpoint
CREATE TRIGGER protected_order_total_insert BEFORE INSERT ON orders
WHEN NEW.shipping_protection_fee IS NOT NULL AND (
 NEW.declared_shipping_value IS NULL OR NEW.declared_shipping_value IS NOT NEW.item_amount OR
 NEW.total IS NOT (NEW.item_amount + COALESCE(NEW.shipping_amount,0) + NEW.shipping_protection_fee) OR
 NEW.shipping_protection_source IS NULL)
BEGIN SELECT RAISE(ABORT,'Protected shipping total mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER protected_order_total_update BEFORE UPDATE ON orders
WHEN NEW.shipping_protection_fee IS NOT NULL AND (
 NEW.declared_shipping_value IS NULL OR NEW.declared_shipping_value IS NOT NEW.item_amount OR
 NEW.total IS NOT (NEW.item_amount + COALESCE(NEW.shipping_amount,0) + NEW.shipping_protection_fee) OR
 NEW.shipping_protection_source IS NULL)
BEGIN SELECT RAISE(ABORT,'Protected shipping total mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER protected_invoice_immutable BEFORE UPDATE OF shipping_protection_fee,declared_shipping_value,shipping_protection_source ON orders
WHEN OLD.proof_key IS NOT NULL AND (NEW.shipping_protection_fee IS NOT OLD.shipping_protection_fee OR
 NEW.declared_shipping_value IS NOT OLD.declared_shipping_value OR NEW.shipping_protection_source IS NOT OLD.shipping_protection_source)
BEGIN SELECT RAISE(ABORT,'Submitted protection is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER protected_manual_shipping BEFORE UPDATE OF shipped_at,tracking_number ON orders
WHEN NEW.shipping_protection_fee IS NOT NULL AND NEW.shipped_at IS NOT NULL AND
 (NEW.shipping_protection_confirmed_at IS NULL OR NEW.shipping_protection_reference IS NOT NEW.tracking_number)
BEGIN SELECT RAISE(ABORT,'Shipping Protection confirmation required'); END;
