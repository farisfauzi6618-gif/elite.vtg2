CREATE TABLE catalog_revision(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO catalog_revision VALUES(1,1);
--> statement-breakpoint
CREATE TABLE catalog_time_events(source TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(source,at)) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX catalog_time_events_at ON catalog_time_events(at);
--> statement-breakpoint
INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(orderable_at)-2440587.5)*86400000) AS INTEGER) FROM products WHERE orderable_at IS NOT NULL AND julianday(orderable_at) IS NOT NULL ;
--> statement-breakpoint
 INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(sold_at)-2440587.5)*86400000) AS INTEGER)+604800001 FROM products WHERE sold_at IS NOT NULL AND julianday(sold_at) IS NOT NULL ;
--> statement-breakpoint
 INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(sold_at)-2440587.5)*86400000) AS INTEGER)+2592000001 FROM products WHERE sold_at IS NOT NULL AND julianday(sold_at) IS NOT NULL ;
--> statement-breakpoint
INSERT OR IGNORE INTO catalog_time_events SELECT 'o:'||id,reservation_deadline FROM orders WHERE reservation_deadline IS NOT NULL ;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_products_insert AFTER INSERT ON products BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1; DELETE FROM catalog_time_events WHERE source='p:'||NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(orderable_at)-2440587.5)*86400000) AS INTEGER) FROM products WHERE orderable_at IS NOT NULL AND julianday(orderable_at) IS NOT NULL AND id=NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(sold_at)-2440587.5)*86400000) AS INTEGER)+604800001 FROM products WHERE sold_at IS NOT NULL AND julianday(sold_at) IS NOT NULL AND id=NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(sold_at)-2440587.5)*86400000) AS INTEGER)+2592000001 FROM products WHERE sold_at IS NOT NULL AND julianday(sold_at) IS NOT NULL AND id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_products_update AFTER UPDATE ON products BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1; DELETE FROM catalog_time_events WHERE source='p:'||NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(orderable_at)-2440587.5)*86400000) AS INTEGER) FROM products WHERE orderable_at IS NOT NULL AND julianday(orderable_at) IS NOT NULL AND id=NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(sold_at)-2440587.5)*86400000) AS INTEGER)+604800001 FROM products WHERE sold_at IS NOT NULL AND julianday(sold_at) IS NOT NULL AND id=NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'p:'||id,CAST(ROUND((julianday(sold_at)-2440587.5)*86400000) AS INTEGER)+2592000001 FROM products WHERE sold_at IS NOT NULL AND julianday(sold_at) IS NOT NULL AND id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_products_delete AFTER DELETE ON products BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1; DELETE FROM catalog_time_events WHERE source='p:'||OLD.id;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_size_groups_insert AFTER INSERT ON size_groups BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_size_groups_update AFTER UPDATE ON size_groups BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_size_groups_delete AFTER DELETE ON size_groups BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_catalog_features_insert AFTER INSERT ON catalog_features BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_catalog_features_update AFTER UPDATE ON catalog_features BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_catalog_features_delete AFTER DELETE ON catalog_features BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_feature_aliases_insert AFTER INSERT ON feature_aliases BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_feature_aliases_update AFTER UPDATE ON feature_aliases BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_feature_aliases_delete AFTER DELETE ON feature_aliases BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_reserve_items_insert AFTER INSERT ON reserve_items BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_reserve_items_update AFTER UPDATE ON reserve_items BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_reserve_items_delete AFTER DELETE ON reserve_items BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1;  END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_orders_insert AFTER INSERT ON orders BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1; DELETE FROM catalog_time_events WHERE source='o:'||NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'o:'||id,reservation_deadline FROM orders WHERE reservation_deadline IS NOT NULL AND id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_orders_update AFTER UPDATE ON orders BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1; DELETE FROM catalog_time_events WHERE source='o:'||NEW.id; INSERT OR IGNORE INTO catalog_time_events SELECT 'o:'||id,reservation_deadline FROM orders WHERE reservation_deadline IS NOT NULL AND id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_orders_delete AFTER DELETE ON orders BEGIN UPDATE catalog_revision SET revision=revision+1 WHERE id=1; DELETE FROM catalog_time_events WHERE source='o:'||OLD.id;  END;
