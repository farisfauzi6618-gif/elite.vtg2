DROP TRIGGER analytics_order_confirmed;
--> statement-breakpoint
CREATE TRIGGER analytics_order_confirmed AFTER UPDATE OF payment_state ON orders
WHEN NEW.payment_state='payment_confirmed' AND COALESCE(NEW.confirmed_at,CAST(strftime('%s','now') AS INTEGER)*1000)>=(SELECT started_at FROM analytics_config WHERE id=1)
BEGIN
 INSERT OR IGNORE INTO analytics_events(id,dedupe_key,event_name,timestamp,session_id,visitor_id,user_id,order_id,traffic_source,utm_source,utm_medium,utm_campaign,utm_content)
 SELECT 'completed:'||NEW.id,'completed:'||NEW.id,'order_completed',COALESCE(NEW.confirmed_at,CAST(strftime('%s','now') AS INTEGER)*1000),s.id,s.visitor_id,NEW.customer_id,NEW.id,COALESCE(s.traffic_source,'Other'),s.utm_source,s.utm_medium,s.utm_campaign,s.utm_content
 FROM (SELECT 1) LEFT JOIN analytics_order_context c ON c.order_id=NEW.id LEFT JOIN analytics_sessions s ON s.id=c.session_id;
 INSERT OR IGNORE INTO analytics_event_products(event_id,product_id)
 SELECT 'completed:'||NEW.id,json_extract(CASE WHEN type='object' THEN value ELSE '{}' END,'$.productId')
 FROM json_each(CASE WHEN json_valid(NEW.catalog_items_json) THEN NEW.catalog_items_json ELSE '[]' END)
 WHERE json_type(CASE WHEN type='object' THEN value ELSE '{}' END,'$.productId')='text'
 AND length(json_extract(CASE WHEN type='object' THEN value ELSE '{}' END,'$.productId')) BETWEEN 1 AND 100;
END;
