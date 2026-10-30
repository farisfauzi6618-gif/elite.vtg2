DROP TRIGGER catalog_revision_orders_update;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_orders_update AFTER UPDATE ON orders
WHEN OLD.id IS NOT NEW.id
 OR OLD.reservation_status IS NOT NEW.reservation_status
 OR OLD.reservation_deadline IS NOT NEW.reservation_deadline
BEGIN
 UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
 DELETE FROM catalog_time_events WHERE source='o:'||OLD.id OR source='o:'||NEW.id;
 INSERT OR IGNORE INTO catalog_time_events SELECT 'o:'||id,reservation_deadline FROM orders WHERE reservation_deadline IS NOT NULL AND id=NEW.id;
END;
