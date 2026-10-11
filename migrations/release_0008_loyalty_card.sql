CREATE TABLE loyalty_config(id INTEGER PRIMARY KEY CHECK(id=1),started_at INTEGER NOT NULL);
INSERT INTO loyalty_config VALUES(1,CAST(strftime('%s','now') AS INTEGER)*1000);
CREATE TABLE loyalty_order_credits(
 order_id TEXT PRIMARY KEY REFERENCES orders(id),customer_id TEXT NOT NULL REFERENCES customers(id),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),stamp_start INTEGER NOT NULL,stamp_end INTEGER NOT NULL,
 credited_at INTEGER NOT NULL,reversed_at INTEGER
);
CREATE INDEX idx_loyalty_credit_customer ON loyalty_order_credits(customer_id,reversed_at);
CREATE TABLE loyalty_cycles(
 id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),cycle_number INTEGER NOT NULL,
 stamp_count INTEGER NOT NULL CHECK(stamp_count BETWEEN 0 AND 10),status TEXT NOT NULL CHECK(status IN ('ACTIVE','COMPLETED','ARCHIVED')),
 started_at INTEGER NOT NULL,completed_at INTEGER,UNIQUE(customer_id,cycle_number)
);
CREATE INDEX idx_loyalty_cycle_customer ON loyalty_cycles(customer_id,status,cycle_number);
CREATE TABLE loyalty_rewards(
 id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),cycle_id TEXT NOT NULL REFERENCES loyalty_cycles(id),
 milestone INTEGER NOT NULL CHECK(milestone IN (3,5,10)),reward_type TEXT NOT NULL DEFAULT 'fixed',reward_value INTEGER NOT NULL,
 minimum_purchase INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('LOCKED','UNLOCKED','REDEEMED')),
 unlocked_at INTEGER,unlocked_order_id TEXT REFERENCES orders(id),redeemed_at INTEGER,redeemed_order_id TEXT REFERENCES orders(id),
 voucher_id TEXT UNIQUE REFERENCES purchase_vouchers(id),UNIQUE(cycle_id,milestone)
);
CREATE INDEX idx_loyalty_reward_customer ON loyalty_rewards(customer_id,status);
CREATE TABLE loyalty_stamp_history(
 id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id TEXT NOT NULL REFERENCES customers(id),order_id TEXT NOT NULL REFERENCES orders(id),
 cycle_id TEXT NOT NULL REFERENCES loyalty_cycles(id),stamps INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('EARNED','REVERSED')),timestamp INTEGER NOT NULL,
 UNIQUE(order_id,cycle_id,kind)
);
CREATE INDEX idx_loyalty_history_customer ON loyalty_stamp_history(customer_id,id);
--> statement-breakpoint
CREATE TRIGGER loyalty_order_confirmed AFTER UPDATE OF payment_state ON orders
WHEN NEW.payment_state='payment_confirmed' AND OLD.confirmed_at IS NULL
 AND NEW.confirmed_at IS NOT NULL AND NEW.confirmed_at>=(SELECT started_at FROM loyalty_config WHERE id=1)
 AND NEW.customer_id IS NOT NULL AND NEW.proof_key IS NOT NULL
 AND NEW.status NOT IN ('cancelled','expired','failed','refunded')
 AND typeof(NEW.quantity)='integer' AND NEW.quantity BETWEEN 1 AND 20
 AND NOT EXISTS(SELECT 1 FROM loyalty_order_credits WHERE order_id=NEW.id)
BEGIN
 INSERT INTO loyalty_order_credits(order_id,customer_id,quantity,stamp_start,stamp_end,credited_at)
 SELECT NEW.id,NEW.customer_id,NEW.quantity,COALESCE(SUM(quantity),0),COALESCE(SUM(quantity),0)+NEW.quantity,NEW.confirmed_at
 FROM loyalty_order_credits WHERE customer_id=NEW.customer_id AND reversed_at IS NULL;
 INSERT INTO loyalty_cycles(id,customer_id,cycle_number,stamp_count,status,started_at,completed_at)
 SELECT 'elc-'||lower(hex(randomblob(16))),NEW.customer_id,n,MIN(10,MAX(0,x.stamp_end-(n-1)*10)),
 CASE WHEN x.stamp_end>=n*10 THEN 'COMPLETED' ELSE 'ACTIVE' END,NEW.confirmed_at,CASE WHEN x.stamp_end>=n*10 THEN NEW.confirmed_at END
 FROM (WITH RECURSIVE numbers(n) AS (SELECT stamp_start/10+1 FROM loyalty_order_credits WHERE order_id=NEW.id UNION ALL SELECT n+1 FROM numbers WHERE n<(SELECT stamp_end/10+1 FROM loyalty_order_credits WHERE order_id=NEW.id)) SELECT n FROM numbers) numbers
 JOIN loyalty_order_credits x ON x.order_id=NEW.id WHERE 1
 ON CONFLICT(customer_id,cycle_number) DO UPDATE SET stamp_count=excluded.stamp_count,status=excluded.status,completed_at=CASE WHEN excluded.status='COMPLETED' THEN COALESCE(loyalty_cycles.completed_at,excluded.completed_at) ELSE loyalty_cycles.completed_at END;
 INSERT OR IGNORE INTO loyalty_rewards(id,customer_id,cycle_id,milestone,reward_value,minimum_purchase,status)
 SELECT 'loyalty-'||lower(hex(randomblob(16))),NEW.customer_id,c.id,m.n,CASE m.n WHEN 3 THEN 50000 WHEN 5 THEN 100000 ELSE 250000 END,CASE m.n WHEN 3 THEN 0 ELSE 500000 END,'LOCKED'
 FROM loyalty_cycles c CROSS JOIN (SELECT 3 n UNION ALL SELECT 5 UNION ALL SELECT 10) m WHERE c.customer_id=NEW.customer_id;
 INSERT INTO purchase_vouchers(id,label,owner_user_id,type,fixed_amount,minimum_order,valid_from,usage_limit)
 SELECT r.id,'ELITE Reward Rp'||CASE r.milestone WHEN 3 THEN '50.000' WHEN 5 THEN '100.000' ELSE '250.000' END||' · Card '||c.cycle_number||CASE WHEN r.milestone=3 THEN '' ELSE ' · Min. Rp500.000' END,
 r.customer_id,'fixed',r.reward_value,r.minimum_purchase,NEW.confirmed_at,1
 FROM loyalty_rewards r JOIN loyalty_cycles c ON c.id=r.cycle_id WHERE r.customer_id=NEW.customer_id AND r.status='LOCKED' AND c.stamp_count>=r.milestone
 ON CONFLICT(id) DO UPDATE SET active=1,valid_from=excluded.valid_from;
 UPDATE loyalty_rewards SET status='UNLOCKED',unlocked_at=NEW.confirmed_at,unlocked_order_id=NEW.id,voucher_id=id
 WHERE customer_id=NEW.customer_id AND status='LOCKED' AND milestone<=(SELECT stamp_count FROM loyalty_cycles WHERE id=cycle_id);
 INSERT INTO loyalty_stamp_history(customer_id,order_id,cycle_id,stamps,kind,timestamp)
 SELECT NEW.customer_id,NEW.id,c.id,MIN(x.stamp_end,c.cycle_number*10)-MAX(x.stamp_start,(c.cycle_number-1)*10),'EARNED',NEW.confirmed_at
 FROM loyalty_cycles c JOIN loyalty_order_credits x ON x.order_id=NEW.id
 WHERE c.customer_id=NEW.customer_id AND MIN(x.stamp_end,c.cycle_number*10)>MAX(x.stamp_start,(c.cycle_number-1)*10) ORDER BY c.cycle_number;
END;
--> statement-breakpoint
CREATE TRIGGER loyalty_reward_redeemed AFTER UPDATE OF payment_state ON orders
WHEN NEW.payment_state='payment_confirmed' AND NEW.status NOT IN ('cancelled','expired','failed','refunded')
BEGIN
 UPDATE loyalty_rewards SET status='REDEEMED',redeemed_at=COALESCE(redeemed_at,NEW.confirmed_at,CAST(strftime('%s','now') AS INTEGER)*1000),redeemed_order_id=NEW.id
 WHERE voucher_id IN (SELECT voucher_id FROM purchase_voucher_claims WHERE order_id=NEW.id AND customer_id=NEW.customer_id) AND status!='REDEEMED';
END;
--> statement-breakpoint
CREATE TRIGGER loyalty_order_reversed AFTER UPDATE OF status,payment_state ON orders
WHEN (NEW.status IN ('cancelled','expired','failed','refunded') OR NEW.payment_state!='payment_confirmed')
 AND EXISTS(SELECT 1 FROM loyalty_order_credits WHERE order_id=NEW.id AND reversed_at IS NULL)
BEGIN
 UPDATE loyalty_order_credits SET reversed_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE order_id=NEW.id AND reversed_at IS NULL;
 INSERT OR IGNORE INTO loyalty_stamp_history(customer_id,order_id,cycle_id,stamps,kind,timestamp)
 SELECT customer_id,order_id,cycle_id,-stamps,'REVERSED',CAST(strftime('%s','now') AS INTEGER)*1000 FROM loyalty_stamp_history WHERE order_id=NEW.id AND kind='EARNED';
 UPDATE loyalty_cycles SET stamp_count=MIN(10,MAX(0,(SELECT COALESCE(SUM(quantity),0) FROM loyalty_order_credits WHERE customer_id=NEW.customer_id AND reversed_at IS NULL)-(cycle_number-1)*10)),
 status=CASE WHEN cycle_number*10<=(SELECT COALESCE(SUM(quantity),0) FROM loyalty_order_credits WHERE customer_id=NEW.customer_id AND reversed_at IS NULL) THEN 'COMPLETED' WHEN cycle_number=(SELECT COALESCE(SUM(quantity),0)/10+1 FROM loyalty_order_credits WHERE customer_id=NEW.customer_id AND reversed_at IS NULL) THEN 'ACTIVE' ELSE 'ARCHIVED' END
 WHERE customer_id=NEW.customer_id;
 UPDATE purchase_vouchers SET active=0 WHERE id IN (SELECT r.voucher_id FROM loyalty_rewards r JOIN loyalty_cycles c ON c.id=r.cycle_id WHERE r.customer_id=NEW.customer_id AND r.status='UNLOCKED' AND c.stamp_count<r.milestone);
 UPDATE loyalty_rewards SET status='LOCKED',unlocked_at=NULL,unlocked_order_id=NULL WHERE customer_id=NEW.customer_id AND status='UNLOCKED' AND milestone>(SELECT stamp_count FROM loyalty_cycles WHERE id=cycle_id);
END;
