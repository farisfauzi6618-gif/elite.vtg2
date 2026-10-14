ALTER TABLE products ADD COLUMN color_variants TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN default_color_variant_id TEXT;
--> statement-breakpoint
ALTER TABLE size_groups ADD COLUMN color_variant_id TEXT;
--> statement-breakpoint
CREATE INDEX idx_size_groups_color ON size_groups(product_id,color_variant_id);

--> statement-breakpoint
DROP TRIGGER product_sold_after_group_insert;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_group_insert AFTER INSERT ON size_groups BEGIN
 UPDATE products SET sold_at=CASE
 WHEN EXISTS(SELECT 1 FROM size_groups g WHERE product_id=NEW.product_id AND (qty IS NULL OR qty>0) AND (g.color_variant_id IS NULL OR EXISTS(SELECT 1 FROM json_each(products.color_variants) c WHERE json_extract(c.value,'$.id')=g.color_variant_id AND json_extract(c.value,'$.active')=1))) THEN NULL
 WHEN status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=NEW.product_id;
END;

--> statement-breakpoint
DROP TRIGGER product_sold_after_stock_update;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_stock_update AFTER UPDATE OF qty,color_variant_id ON size_groups BEGIN
 UPDATE products SET sold_at=CASE
 WHEN EXISTS(SELECT 1 FROM size_groups g WHERE product_id=NEW.product_id AND (qty IS NULL OR qty>0) AND (g.color_variant_id IS NULL OR EXISTS(SELECT 1 FROM json_each(products.color_variants) c WHERE json_extract(c.value,'$.id')=g.color_variant_id AND json_extract(c.value,'$.active')=1))) THEN NULL
 WHEN status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=NEW.product_id;
END;

--> statement-breakpoint
DROP TRIGGER product_sold_after_group_delete;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_group_delete AFTER DELETE ON size_groups BEGIN
 UPDATE products SET sold_at=CASE
 WHEN NOT EXISTS(SELECT 1 FROM size_groups g WHERE product_id=OLD.product_id)
 OR EXISTS(SELECT 1 FROM size_groups g WHERE product_id=OLD.product_id AND (qty IS NULL OR qty>0) AND (g.color_variant_id IS NULL OR EXISTS(SELECT 1 FROM json_each(products.color_variants) c WHERE json_extract(c.value,'$.id')=g.color_variant_id AND json_extract(c.value,'$.active')=1))) THEN NULL
 WHEN status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=OLD.product_id;
END;

--> statement-breakpoint
DROP TRIGGER product_sold_after_publication;
--> statement-breakpoint
CREATE TRIGGER product_sold_after_publication AFTER UPDATE OF status,color_variants ON products BEGIN
 UPDATE products SET sold_at=CASE
 WHEN NOT EXISTS(SELECT 1 FROM size_groups g WHERE product_id=NEW.id)
 OR EXISTS(SELECT 1 FROM size_groups g WHERE product_id=NEW.id AND (qty IS NULL OR qty>0) AND (g.color_variant_id IS NULL OR EXISTS(SELECT 1 FROM json_each(products.color_variants) c WHERE json_extract(c.value,'$.id')=g.color_variant_id AND json_extract(c.value,'$.active')=1))) THEN NULL
 WHEN NEW.status='published' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END
 WHERE id=NEW.id;
END;

--> statement-breakpoint
CREATE TABLE analytics_color_values(event_id TEXT PRIMARY KEY REFERENCES analytics_events(id),variant_id TEXT NOT NULL,color_name TEXT NOT NULL);
