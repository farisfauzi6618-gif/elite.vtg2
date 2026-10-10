ALTER TABLE products ADD COLUMN sold_at TEXT;
--> statement-breakpoint
CREATE INDEX idx_products_status_sold ON products(status,sold_at);
--> statement-breakpoint
UPDATE products SET sold_at=COALESCE(
 (SELECT MAX(h.created_at) FROM stock_history h WHERE h.product_id=products.id AND h.after_qty=0 AND h.before_qty>0),
 updated_at,published_at,created_at
) WHERE status='published' AND EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=products.id)
 AND NOT EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=products.id AND (g.qty IS NULL OR g.qty>0));
--> statement-breakpoint
CREATE TRIGGER product_sold_after_group_insert AFTER INSERT ON size_groups BEGIN
 UPDATE products SET sold_at=CASE
 WHEN EXISTS(SELECT 1 FROM size_groups WHERE product_id=NEW.product_id AND (qty IS NULL OR qty>0)) THEN NULL
 WHEN status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=NEW.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_stock_update AFTER UPDATE OF qty ON size_groups BEGIN
 UPDATE products SET sold_at=CASE
 WHEN EXISTS(SELECT 1 FROM size_groups WHERE product_id=NEW.product_id AND (qty IS NULL OR qty>0)) THEN NULL
 WHEN status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=NEW.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_group_delete AFTER DELETE ON size_groups BEGIN
 UPDATE products SET sold_at=CASE
 WHEN NOT EXISTS(SELECT 1 FROM size_groups WHERE product_id=OLD.product_id)
 OR EXISTS(SELECT 1 FROM size_groups WHERE product_id=OLD.product_id AND (qty IS NULL OR qty>0)) THEN NULL
 WHEN status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=OLD.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_publication AFTER UPDATE OF status ON products BEGIN
 UPDATE products SET sold_at=CASE
 WHEN NOT EXISTS(SELECT 1 FROM size_groups WHERE product_id=NEW.id)
 OR EXISTS(SELECT 1 FROM size_groups WHERE product_id=NEW.id AND (qty IS NULL OR qty>0)) THEN NULL
 WHEN NEW.status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=NEW.id;
END;
