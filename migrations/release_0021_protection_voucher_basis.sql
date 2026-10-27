-- New quotes insure the sale subtotal before vouchers. Legacy invoices keep
-- their original net-value basis, totals and immutable proof accounting.
DROP TRIGGER protected_order_total_insert;
--> statement-breakpoint
CREATE TRIGGER protected_order_total_insert BEFORE INSERT ON orders
WHEN NEW.shipping_protection_fee IS NOT NULL AND (
 NEW.declared_shipping_value IS NULL OR NEW.declared_shipping_value IS NOT
 CASE WHEN json_extract(NEW.shipping_json,'$.protection.valueBasis')='before_voucher'
 THEN COALESCE(NEW.item_subtotal,NEW.item_amount+COALESCE(NEW.discount_amount,0))
 ELSE NEW.item_amount END OR
 NEW.total IS NOT (NEW.item_amount + COALESCE(NEW.shipping_amount,0) + NEW.shipping_protection_fee) OR
 NEW.shipping_protection_source IS NULL)
BEGIN SELECT RAISE(ABORT,'Protected shipping total mismatch'); END;
--> statement-breakpoint
DROP TRIGGER protected_order_total_update;
--> statement-breakpoint
CREATE TRIGGER protected_order_total_update BEFORE UPDATE ON orders
WHEN NEW.shipping_protection_fee IS NOT NULL AND (
 NEW.declared_shipping_value IS NULL OR NEW.declared_shipping_value IS NOT
 CASE WHEN json_extract(NEW.shipping_json,'$.protection.valueBasis')='before_voucher'
 THEN COALESCE(NEW.item_subtotal,NEW.item_amount+COALESCE(NEW.discount_amount,0))
 ELSE NEW.item_amount END OR
 NEW.total IS NOT (NEW.item_amount + COALESCE(NEW.shipping_amount,0) + NEW.shipping_protection_fee) OR
 NEW.shipping_protection_source IS NULL)
BEGIN SELECT RAISE(ABORT,'Protected shipping total mismatch'); END;
