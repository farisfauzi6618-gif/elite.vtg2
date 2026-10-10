ALTER TABLE orders ADD discount_voucher_id TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD discount_label TEXT;
--> statement-breakpoint
CREATE TABLE purchase_vouchers (
 id TEXT PRIMARY KEY NOT NULL,
 label TEXT NOT NULL,
 owner_user_id TEXT REFERENCES customers(id),
 type TEXT NOT NULL CHECK(type IN ('percentage','fixed')),
 percentage INTEGER CHECK(percentage BETWEEN 1 AND 100),
 fixed_amount INTEGER CHECK(fixed_amount BETWEEN 1 AND 10000000),
 minimum_order INTEGER NOT NULL DEFAULT 0 CHECK(minimum_order BETWEEN 0 AND 10000000),
 maximum_discount INTEGER CHECK(maximum_discount BETWEEN 1 AND 10000000),
 valid_from INTEGER NOT NULL,
 valid_until INTEGER,
 usage_limit INTEGER CHECK(usage_limit>0),
 usage_count INTEGER NOT NULL DEFAULT 0 CHECK(usage_count>=0),
 applicable_categories TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(applicable_categories)),
 applicable_products TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(applicable_products)),
 first_order_only INTEGER NOT NULL DEFAULT 0 CHECK(first_order_only IN (0,1)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 CHECK((type='percentage' AND percentage IS NOT NULL AND fixed_amount IS NULL) OR (type='fixed' AND fixed_amount IS NOT NULL AND percentage IS NULL)),
 CHECK(valid_until IS NULL OR valid_until>valid_from),
 CHECK(id!='first-purchase-5')
);
--> statement-breakpoint
CREATE TABLE purchase_voucher_claims (
 voucher_id TEXT NOT NULL REFERENCES purchase_vouchers(id),
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 customer_id TEXT NOT NULL REFERENCES customers(id),
 reserved_at INTEGER NOT NULL,
 redeemed_at INTEGER,
 PRIMARY KEY(voucher_id,order_id)
);
--> statement-breakpoint
CREATE INDEX idx_purchase_voucher_owner ON purchase_vouchers(owner_user_id,active,valid_until);
--> statement-breakpoint
CREATE INDEX idx_purchase_voucher_claim ON purchase_voucher_claims(voucher_id,redeemed_at);
--> statement-breakpoint
CREATE TRIGGER purchase_voucher_confirmed AFTER UPDATE OF payment_state ON orders
WHEN NEW.payment_state='payment_confirmed'
BEGIN
 UPDATE purchase_vouchers SET usage_count=usage_count+1 WHERE id IN (SELECT voucher_id FROM purchase_voucher_claims WHERE order_id=NEW.id AND redeemed_at IS NULL);
 UPDATE purchase_voucher_claims SET redeemed_at=COALESCE(redeemed_at,NEW.confirmed_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE order_id=NEW.id;
END;
