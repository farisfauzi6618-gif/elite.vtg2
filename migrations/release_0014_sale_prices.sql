ALTER TABLE products ADD COLUMN sale_price INTEGER CHECK(sale_price IS NULL OR (typeof(sale_price)='integer' AND sale_price>0 AND sale_price<=1000000000));
--> statement-breakpoint
ALTER TABLE products ADD COLUMN discount_title TEXT;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN sale_colors_shared INTEGER NOT NULL DEFAULT 0 CHECK(sale_colors_shared IN (0,1));
--> statement-breakpoint
ALTER TABLE size_groups ADD COLUMN sale_price INTEGER CHECK(sale_price IS NULL OR (typeof(sale_price)='integer' AND sale_price>0 AND sale_price<=1000000000));
--> statement-breakpoint
ALTER TABLE size_groups ADD COLUMN discount_title TEXT;
