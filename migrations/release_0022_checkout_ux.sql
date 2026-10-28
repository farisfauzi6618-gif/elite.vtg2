ALTER TABLE orders ADD COLUMN checkout_request_hash TEXT;
ALTER TABLE orders ADD COLUMN checkout_request_fingerprint TEXT;
CREATE UNIQUE INDEX idx_order_checkout_request ON orders(checkout_request_hash) WHERE checkout_request_hash IS NOT NULL;
ALTER TABLE analytics_events ADD COLUMN checkout_id TEXT;
ALTER TABLE analytics_events ADD COLUMN checkout_entry TEXT;
ALTER TABLE analytics_events ADD COLUMN checkout_actor TEXT;
ALTER TABLE analytics_events ADD COLUMN device_class TEXT;
CREATE INDEX idx_analytics_checkout_flow ON analytics_events(checkout_id,event_name,timestamp) WHERE checkout_id IS NOT NULL;
CREATE INDEX idx_analytics_order_progress ON analytics_events(order_id,event_name,timestamp) WHERE order_id IS NOT NULL;
