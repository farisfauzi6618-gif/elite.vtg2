ALTER TABLE products ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0,1));
--> statement-breakpoint
ALTER TABLE products ADD COLUMN featured_position INTEGER CHECK(featured_position BETWEEN 1 AND 8);
--> statement-breakpoint
CREATE INDEX idx_products_featured ON products(is_featured,featured_position,id);
--> statement-breakpoint
CREATE TABLE analytics_featured_values(event_id TEXT PRIMARY KEY REFERENCES analytics_events(id),featured_position INTEGER NOT NULL CHECK(featured_position BETWEEN 1 AND 8));
