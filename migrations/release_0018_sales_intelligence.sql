CREATE TABLE sales_leads (
 id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', instagram TEXT UNIQUE,
 customer_id TEXT UNIQUE REFERENCES customers(id) ON DELETE SET NULL,
 source TEXT NOT NULL CHECK(source IN ('Instagram','Website','Other')),
 contact_preference TEXT NOT NULL DEFAULT 'MANUAL' CHECK(contact_preference IN ('MANUAL','INSTAGRAM','WHATSAPP','NONE')),
 do_not_contact INTEGER NOT NULL DEFAULT 0 CHECK(do_not_contact IN (0,1)),
 notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_sales_leads_activity ON sales_leads(updated_at DESC,id);
CREATE TABLE sales_requests (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES sales_leads(id),
 wanted TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','MATCHED','CONTACTED','INTERESTED','CONVERTED','CLOSED','DO_NOT_CONTACT')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_sales_requests_lead ON sales_requests(lead_id,updated_at DESC);
CREATE INDEX idx_sales_requests_status ON sales_requests(status,updated_at DESC);
CREATE TABLE sales_outreach (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES sales_leads(id),
 request_id TEXT NOT NULL REFERENCES sales_requests(id), product_id TEXT REFERENCES products(id),
 group_id TEXT REFERENCES size_groups(id), draft TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 outcome TEXT NOT NULL CHECK(outcome IN ('DRAFT','SENT','REPLIED','INTERESTED','NO_RESPONSE','PURCHASED','NOT_INTERESTED')),
 sent_at INTEGER, order_id TEXT UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, mutation TEXT NOT NULL,
 CHECK(order_id IS NULL OR (outcome='PURCHASED' AND sent_at IS NOT NULL))
);
CREATE INDEX idx_sales_outreach_lead ON sales_outreach(lead_id,sent_at DESC);
CREATE INDEX idx_sales_outreach_request ON sales_outreach(request_id,created_at DESC);
CREATE INDEX idx_sales_outreach_time ON sales_outreach(created_at DESC,id);
CREATE TABLE sales_product_actions (
 product_id TEXT PRIMARY KEY REFERENCES products(id), reviewed_at INTEGER, promoted_at INTEGER,
 dismissed_until INTEGER, updated_at INTEGER NOT NULL, actor TEXT NOT NULL
);
CREATE TABLE sales_config (id INTEGER PRIMARY KEY CHECK(id=1),cooldown_days INTEGER NOT NULL DEFAULT 3 CHECK(cooldown_days BETWEEN 0 AND 90));
INSERT INTO sales_config(id,cooldown_days) VALUES(1,3);
