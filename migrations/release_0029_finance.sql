CREATE TABLE finance_config(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,policy_version INTEGER NOT NULL DEFAULT 1);
INSERT INTO finance_config(id) VALUES(1);
CREATE TABLE finance_lots(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,group_id TEXT NOT NULL,product_name TEXT NOT NULL,label TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100000),acquired_on TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('inventory','historical')),created_revision INTEGER NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,note TEXT NOT NULL DEFAULT '');
CREATE INDEX finance_lots_group ON finance_lots(group_id,acquired_on,id);
CREATE TABLE finance_lot_versions(id TEXT PRIMARY KEY,lot_id TEXT NOT NULL REFERENCES finance_lots(id),revision INTEGER NOT NULL,unit_cost INTEGER NOT NULL CHECK(unit_cost>=0),additional_cost INTEGER NOT NULL CHECK(additional_cost>=0),capital_owner TEXT NOT NULL CHECK(capital_owner IN ('KAKAK','ADIK')),kakak_bps INTEGER NOT NULL CHECK(kakak_bps BETWEEN 0 AND 10000),created_at INTEGER NOT NULL,created_by TEXT NOT NULL,note TEXT NOT NULL,UNIQUE(lot_id,revision));
CREATE TABLE finance_sales(id TEXT PRIMARY KEY,source TEXT NOT NULL CHECK(source IN ('website','manual_order','instagram')),source_order_id TEXT UNIQUE,external_ref TEXT UNIQUE,month TEXT NOT NULL,sold_at INTEGER NOT NULL,gross_merchandise INTEGER,net_merchandise INTEGER,unit_count INTEGER NOT NULL,needs_review INTEGER NOT NULL DEFAULT 0,review_reason TEXT NOT NULL DEFAULT '',stock_ref TEXT UNIQUE,created_at INTEGER NOT NULL,created_by TEXT NOT NULL);
CREATE INDEX finance_sales_month ON finance_sales(month,sold_at,id);
CREATE TABLE finance_units(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES finance_sales(id),unit_no INTEGER NOT NULL,product_id TEXT NOT NULL,group_id TEXT NOT NULL,product_name TEXT NOT NULL,label TEXT NOT NULL,gross_revenue INTEGER NOT NULL CHECK(gross_revenue>=0),net_revenue INTEGER NOT NULL CHECK(net_revenue>=0 AND net_revenue<=gross_revenue),lot_id TEXT REFERENCES finance_lots(id),cost_version_id TEXT REFERENCES finance_lot_versions(id),cost_basis INTEGER,capital_owner TEXT CHECK(capital_owner IN ('KAKAK','ADIK')),kakak_bps INTEGER CHECK(kakak_bps BETWEEN 0 AND 10000),policy_version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,UNIQUE(sale_id,unit_no));
CREATE INDEX finance_units_lot ON finance_units(lot_id);
CREATE INDEX finance_units_sale ON finance_units(sale_id);
CREATE TABLE finance_stock_claims(history_id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES finance_sales(id),product_id TEXT NOT NULL,group_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),reviewed_undo_id TEXT);
CREATE INDEX finance_stock_claims_sale ON finance_stock_claims(sale_id);
CREATE TABLE finance_expenses(id TEXT PRIMARY KEY,month TEXT NOT NULL,spent_on TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),paid_by TEXT NOT NULL CHECK(paid_by IN ('KAKAK','ADIK','BUSINESS')),kind TEXT NOT NULL CHECK(kind IN ('shared','direct')),sale_id TEXT REFERENCES finance_sales(id),unit_id TEXT REFERENCES finance_units(id),description TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,voided INTEGER NOT NULL DEFAULT 0 CHECK(voided IN (0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,CHECK((kind='shared' AND sale_id IS NULL AND unit_id IS NULL) OR (kind='direct' AND sale_id IS NOT NULL)));
CREATE INDEX finance_expenses_month ON finance_expenses(month,spent_on,id);
CREATE TABLE finance_periods(month TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),version INTEGER NOT NULL DEFAULT 0,closing_id TEXT);
CREATE TABLE finance_closings(id TEXT PRIMARY KEY,month TEXT NOT NULL,version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,digest TEXT NOT NULL,note TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,UNIQUE(month,version));
CREATE INDEX finance_closings_month ON finance_closings(month,version);
CREATE TABLE finance_adjustments(id TEXT PRIMARY KEY,month TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('revenue','cogs','exceptional')),amount INTEGER NOT NULL CHECK(amount!=0),party TEXT NOT NULL CHECK(party IN ('KAKAK','ADIK','UNALLOCATED')),capital_delta INTEGER NOT NULL DEFAULT 0,source_order_id TEXT,reference TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,CHECK(party!='UNALLOCATED' OR capital_delta=0));
CREATE INDEX finance_adjustments_month ON finance_adjustments(month,created_at,id);
CREATE TABLE finance_cash_movements(id TEXT PRIMARY KEY,month TEXT NOT NULL,paid_on TEXT NOT NULL,party TEXT NOT NULL CHECK(party IN ('KAKAK','ADIK')),kind TEXT NOT NULL CHECK(kind IN ('capital','expense','profit')),direction TEXT NOT NULL CHECK(direction IN ('out','return')),amount INTEGER NOT NULL CHECK(amount>0),expense_id TEXT REFERENCES finance_expenses(id),reference TEXT NOT NULL,note TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL);
CREATE INDEX finance_cash_month ON finance_cash_movements(month,created_at,id);
CREATE INDEX finance_cash_expense ON finance_cash_movements(expense_id);
CREATE TABLE finance_audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,actor TEXT NOT NULL,request_hash TEXT NOT NULL,details_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX finance_audit_time ON finance_audit(created_at,id);
CREATE TABLE finance_order_events(order_id TEXT PRIMARY KEY,confirmed_at INTEGER NOT NULL,finance_revision INTEGER NOT NULL,payload TEXT NOT NULL,latest_payload TEXT NOT NULL,review_required INTEGER NOT NULL DEFAULT 0,imported_at INTEGER);
CREATE INDEX finance_events_pending ON finance_order_events(imported_at,confirmed_at,order_id);
CREATE INDEX finance_orders_confirmed_month ON orders(confirmed_at,id) WHERE payment_state='payment_confirmed';
--> statement-breakpoint
CREATE TRIGGER finance_capture_confirmed_insert AFTER INSERT ON orders
WHEN NEW.payment_state='payment_confirmed' AND (NEW.order_type!='reserve' OR NEW.reservation_status='PAID')
BEGIN
 INSERT OR IGNORE INTO finance_order_events(order_id,confirmed_at,finance_revision,payload,latest_payload) VALUES(NEW.id,COALESCE(NEW.confirmed_at,0),(SELECT revision FROM finance_config WHERE id=1),json_object('id',NEW.id,'confirmed_at',NEW.confirmed_at,'quantity',NEW.quantity,'catalog_checkout_id',NEW.catalog_checkout_id,'lines_json',NEW.catalog_items_json,'item_amount',NEW.item_amount,'item_subtotal',NEW.item_subtotal,'discount_amount',NEW.discount_amount,'status',NEW.status,'order_type',NEW.order_type,'reservation_status',NEW.reservation_status),json_object('id',NEW.id,'confirmed_at',NEW.confirmed_at,'quantity',NEW.quantity,'catalog_checkout_id',NEW.catalog_checkout_id,'lines_json',NEW.catalog_items_json,'item_amount',NEW.item_amount,'item_subtotal',NEW.item_subtotal,'discount_amount',NEW.discount_amount,'status',NEW.status,'order_type',NEW.order_type,'reservation_status',NEW.reservation_status));
END;
--> statement-breakpoint
CREATE TRIGGER finance_capture_confirmed_update AFTER UPDATE OF payment_state,reservation_status,status,confirmed_at,item_amount,item_subtotal,discount_amount,catalog_items_json,catalog_checkout_id,order_type,quantity ON orders
WHEN (NEW.payment_state='payment_confirmed' AND (NEW.order_type!='reserve' OR NEW.reservation_status='PAID')) OR EXISTS(SELECT 1 FROM finance_order_events WHERE order_id=NEW.id)
BEGIN
 INSERT OR IGNORE INTO finance_order_events(order_id,confirmed_at,finance_revision,payload,latest_payload) SELECT NEW.id,COALESCE(NEW.confirmed_at,0),(SELECT revision FROM finance_config WHERE id=1),json_object('id',NEW.id,'confirmed_at',NEW.confirmed_at,'quantity',NEW.quantity,'catalog_checkout_id',NEW.catalog_checkout_id,'lines_json',NEW.catalog_items_json,'item_amount',NEW.item_amount,'item_subtotal',NEW.item_subtotal,'discount_amount',NEW.discount_amount,'status',NEW.status,'order_type',NEW.order_type,'reservation_status',NEW.reservation_status),json_object('id',NEW.id,'confirmed_at',NEW.confirmed_at,'quantity',NEW.quantity,'catalog_checkout_id',NEW.catalog_checkout_id,'lines_json',NEW.catalog_items_json,'item_amount',NEW.item_amount,'item_subtotal',NEW.item_subtotal,'discount_amount',NEW.discount_amount,'status',NEW.status,'order_type',NEW.order_type,'reservation_status',NEW.reservation_status) WHERE NEW.payment_state='payment_confirmed' AND (NEW.order_type!='reserve' OR NEW.reservation_status='PAID');
 UPDATE finance_order_events SET latest_payload=json_object('id',NEW.id,'confirmed_at',NEW.confirmed_at,'quantity',NEW.quantity,'catalog_checkout_id',NEW.catalog_checkout_id,'lines_json',NEW.catalog_items_json,'item_amount',NEW.item_amount,'item_subtotal',NEW.item_subtotal,'discount_amount',NEW.discount_amount,'status',NEW.status,'order_type',NEW.order_type,'reservation_status',NEW.reservation_status,'payment_state',NEW.payment_state),review_required=1 WHERE order_id=NEW.id AND OLD.payment_state='payment_confirmed' AND (OLD.order_type!='reserve' OR OLD.reservation_status='PAID') AND (NEW.confirmed_at IS NOT OLD.confirmed_at OR NEW.item_amount IS NOT OLD.item_amount OR NEW.item_subtotal IS NOT OLD.item_subtotal OR NEW.discount_amount IS NOT OLD.discount_amount OR NEW.catalog_items_json IS NOT OLD.catalog_items_json OR NEW.quantity IS NOT OLD.quantity OR NEW.catalog_checkout_id IS NOT OLD.catalog_checkout_id OR NEW.order_type IS NOT OLD.order_type OR (NEW.status IS NOT OLD.status AND (NEW.status IN ('cancelled','expired','refunded','failed') OR OLD.status IN ('cancelled','expired','refunded','failed'))) OR (OLD.payment_state='payment_confirmed' AND NEW.payment_state!='payment_confirmed') OR (OLD.reservation_status='PAID' AND NEW.reservation_status IS NOT 'PAID')) AND order_id IN (SELECT order_id FROM finance_order_events WHERE payload!=latest_payload OR NEW.payment_state='payment_confirmed' OR OLD.payment_state='payment_confirmed');
END;
--> statement-breakpoint
CREATE TRIGGER finance_closing_no_update BEFORE UPDATE ON finance_closings BEGIN SELECT RAISE(ABORT,'Finance closing snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER finance_closing_no_delete BEFORE DELETE ON finance_closings BEGIN SELECT RAISE(ABORT,'Finance closing snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER finance_cost_version_no_update BEFORE UPDATE ON finance_lot_versions BEGIN SELECT RAISE(ABORT,'Finance cost versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER finance_cost_version_no_delete BEFORE DELETE ON finance_lot_versions BEGIN SELECT RAISE(ABORT,'Finance cost versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER finance_unit_protect_snapshot BEFORE UPDATE ON finance_units
WHEN OLD.sale_id IS NOT NEW.sale_id OR OLD.unit_no IS NOT NEW.unit_no OR OLD.product_id IS NOT NEW.product_id OR OLD.group_id IS NOT NEW.group_id OR OLD.gross_revenue IS NOT NEW.gross_revenue OR OLD.net_revenue IS NOT NEW.net_revenue OR (OLD.cost_basis IS NOT NULL AND (OLD.cost_basis IS NOT NEW.cost_basis OR OLD.capital_owner IS NOT NEW.capital_owner OR OLD.kakak_bps IS NOT NEW.kakak_bps OR OLD.cost_version_id IS NOT NEW.cost_version_id OR OLD.lot_id IS NOT NEW.lot_id))
BEGIN SELECT RAISE(ABORT,'Finance sold unit snapshots are immutable; use an adjustment'); END;
--> statement-breakpoint
CREATE TRIGGER finance_expense_closed_update BEFORE UPDATE ON finance_expenses
WHEN EXISTS(SELECT 1 FROM finance_periods WHERE month IN (OLD.month,NEW.month) AND status='closed')
BEGIN SELECT RAISE(ABORT,'Finance month is closed'); END;
--> statement-breakpoint
CREATE TRIGGER finance_expense_no_delete BEFORE DELETE ON finance_expenses BEGIN SELECT RAISE(ABORT,'Void an expense instead of deleting finance history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_lots_no_delete BEFORE DELETE ON finance_lots BEGIN SELECT RAISE(ABORT,'Finance lot masters are immutable; retain history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_units_no_delete BEFORE DELETE ON finance_units BEGIN SELECT RAISE(ABORT,'Finance sold units are immutable; retain history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_sales_no_delete BEFORE DELETE ON finance_sales BEGIN SELECT RAISE(ABORT,'Finance sales are immutable; retain history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_adjustments_no_delete BEFORE DELETE ON finance_adjustments BEGIN SELECT RAISE(ABORT,'Finance adjustments are immutable; retain history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_cash_movements_no_delete BEFORE DELETE ON finance_cash_movements BEGIN SELECT RAISE(ABORT,'Finance recorded transfers are immutable; retain history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_audit_no_delete BEFORE DELETE ON finance_audit BEGIN SELECT RAISE(ABORT,'Finance audit history are immutable; retain history'); END;

--> statement-breakpoint
CREATE TRIGGER finance_lots_no_update BEFORE UPDATE ON finance_lots BEGIN SELECT RAISE(ABORT,'Finance lot masters are immutable; append a correction'); END;

--> statement-breakpoint
CREATE TRIGGER finance_adjustments_no_update BEFORE UPDATE ON finance_adjustments BEGIN SELECT RAISE(ABORT,'Finance adjustments are immutable; append a correction'); END;

--> statement-breakpoint
CREATE TRIGGER finance_cash_movements_no_update BEFORE UPDATE ON finance_cash_movements BEGIN SELECT RAISE(ABORT,'Finance recorded transfers are immutable; append a correction'); END;

--> statement-breakpoint
CREATE TRIGGER finance_audit_no_update BEFORE UPDATE ON finance_audit BEGIN SELECT RAISE(ABORT,'Finance audit history are immutable; append a correction'); END;

--> statement-breakpoint
CREATE TRIGGER finance_source_protect_snapshot BEFORE UPDATE ON finance_order_events WHEN OLD.order_id IS NOT NEW.order_id OR OLD.confirmed_at IS NOT NEW.confirmed_at OR OLD.finance_revision IS NOT NEW.finance_revision OR OLD.payload IS NOT NEW.payload BEGIN SELECT RAISE(ABORT,'Finance source snapshots are immutable'); END;
