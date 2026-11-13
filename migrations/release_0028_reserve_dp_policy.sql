ALTER TABLE orders ADD COLUMN reserve_policy_version INTEGER NOT NULL DEFAULT 1 CHECK(reserve_policy_version IN (1, 2));
--> statement-breakpoint
CREATE INDEX reserve_audit_order_action ON reserve_audit(order_id, action);
--> statement-breakpoint
DROP TRIGGER reserve_protect_inventory;
--> statement-breakpoint
CREATE TRIGGER reserve_protect_inventory BEFORE UPDATE OF qty ON size_groups
WHEN COALESCE(NEW.qty,0)<COALESCE((
  SELECT SUM(i.quantity) FROM reserve_items i JOIN orders o ON o.id=i.order_id
  WHERE i.group_id=OLD.id AND i.state='active' AND o.reservation_status IN ('RESERVED','PARTIALLY_PAID')
    AND (o.reservation_deadline>unixepoch('subsec')*1000 OR (EXISTS(
      SELECT 1 FROM reserve_payments p WHERE p.order_id=o.id AND p.state='submitted'
        AND p.submitted_at<=o.reservation_deadline AND (p.proof_key IS NOT NULL OR p.source='owner')
    )))
),0)
BEGIN SELECT RAISE(ABORT,'Stock is locked by an active Reserve order'); END;
--> statement-breakpoint
DROP TRIGGER reserve_protect_variant;
--> statement-breakpoint
CREATE TRIGGER reserve_protect_variant BEFORE DELETE ON size_groups
WHEN EXISTS(
  SELECT 1 FROM reserve_items i JOIN orders o ON o.id=i.order_id
  WHERE i.group_id=OLD.id AND i.state='active' AND o.reservation_status IN ('RESERVED','PARTIALLY_PAID')
    AND (o.reservation_deadline>unixepoch('subsec')*1000 OR (EXISTS(
      SELECT 1 FROM reserve_payments p WHERE p.order_id=o.id AND p.state='submitted'
        AND p.submitted_at<=o.reservation_deadline AND (p.proof_key IS NOT NULL OR p.source='owner')
    )))
)
BEGIN SELECT RAISE(ABORT,'Variant is locked by an active Reserve order'); END;
