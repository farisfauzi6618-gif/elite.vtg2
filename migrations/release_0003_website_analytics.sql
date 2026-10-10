ALTER TABLE team_access ADD COLUMN analytics_allowed INTEGER NOT NULL DEFAULT 0 CHECK(analytics_allowed IN (0,1));
CREATE TABLE analytics_config(id INTEGER PRIMARY KEY CHECK(id=1), started_at INTEGER NOT NULL);
INSERT INTO analytics_config VALUES(1,CAST(strftime('%s','now') AS INTEGER)*1000);
CREATE TABLE analytics_sessions(
 id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, user_id TEXT, started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
 traffic_source TEXT NOT NULL, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT
);
CREATE INDEX idx_analytics_sessions_time ON analytics_sessions(started_at,visitor_id);
CREATE TABLE analytics_events(
 id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, event_name TEXT NOT NULL, timestamp INTEGER NOT NULL,
 session_id TEXT, visitor_id TEXT, user_id TEXT, product_id TEXT, order_id TEXT, search_query TEXT, result_count INTEGER,
 traffic_source TEXT NOT NULL, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, error_code TEXT
);
CREATE INDEX idx_analytics_events_time ON analytics_events(timestamp,event_name,visitor_id);
CREATE INDEX idx_analytics_events_product ON analytics_events(product_id,timestamp,event_name);
CREATE INDEX idx_analytics_events_source ON analytics_events(traffic_source,timestamp,event_name);
CREATE INDEX idx_analytics_events_session ON analytics_events(session_id,event_name,timestamp);
CREATE TABLE analytics_event_products(event_id TEXT NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY(event_id,product_id));
CREATE INDEX idx_analytics_event_products_product ON analytics_event_products(product_id,event_id);
CREATE TABLE analytics_checkout_context(checkout_id TEXT PRIMARY KEY, session_id TEXT NOT NULL);
CREATE TABLE analytics_order_context(order_id TEXT PRIMARY KEY, session_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER analytics_order_confirmed AFTER UPDATE OF payment_state ON orders
WHEN NEW.payment_state='payment_confirmed' AND COALESCE(NEW.confirmed_at,CAST(strftime('%s','now') AS INTEGER)*1000)>=(SELECT started_at FROM analytics_config WHERE id=1)
BEGIN
 INSERT OR IGNORE INTO analytics_events(id,dedupe_key,event_name,timestamp,session_id,visitor_id,user_id,order_id,traffic_source,utm_source,utm_medium,utm_campaign,utm_content)
 SELECT 'completed:'||NEW.id,'completed:'||NEW.id,'order_completed',COALESCE(NEW.confirmed_at,CAST(strftime('%s','now') AS INTEGER)*1000),s.id,s.visitor_id,NEW.customer_id,NEW.id,COALESCE(s.traffic_source,'Other'),s.utm_source,s.utm_medium,s.utm_campaign,s.utm_content
 FROM (SELECT 1) LEFT JOIN analytics_order_context c ON c.order_id=NEW.id LEFT JOIN analytics_sessions s ON s.id=c.session_id;
 INSERT OR IGNORE INTO analytics_event_products(event_id,product_id)
 SELECT 'completed:'||NEW.id,json_extract(value,'$.productId') FROM json_each(CASE WHEN json_valid(NEW.catalog_items_json) THEN NEW.catalog_items_json ELSE '[]' END) WHERE json_extract(value,'$.productId') IS NOT NULL;
END;
