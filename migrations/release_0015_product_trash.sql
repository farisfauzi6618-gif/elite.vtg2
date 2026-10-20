ALTER TABLE products ADD COLUMN deleted_at TEXT;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN deleted_by TEXT;
--> statement-breakpoint
CREATE INDEX idx_products_trash ON products(deleted_at,created_at);
--> statement-breakpoint
CREATE TRIGGER product_trash_keeps_draft BEFORE UPDATE OF status ON products
WHEN NEW.deleted_at IS NOT NULL AND NEW.status!='draft'
BEGIN SELECT RAISE(ABORT,'Catalog product is in trash'); END;
--> statement-breakpoint
CREATE TRIGGER product_trash_order_insert BEFORE INSERT ON orders
WHEN NEW.catalog_checkout_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM catalog_checkouts c,json_each(c.lines_json) line JOIN products p ON p.id=json_extract(line.value,'$.productId')
 WHERE c.id=NEW.catalog_checkout_id AND p.deleted_at IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'Catalog product is in trash'); END;
--> statement-breakpoint
CREATE TRIGGER product_trash_order_update BEFORE UPDATE OF catalog_checkout_id ON orders
WHEN NEW.catalog_checkout_id IS NOT NULL AND NEW.catalog_checkout_id IS NOT OLD.catalog_checkout_id AND EXISTS(
 SELECT 1 FROM catalog_checkouts c,json_each(c.lines_json) line JOIN products p ON p.id=json_extract(line.value,'$.productId')
 WHERE c.id=NEW.catalog_checkout_id AND p.deleted_at IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'Catalog product is in trash'); END;
