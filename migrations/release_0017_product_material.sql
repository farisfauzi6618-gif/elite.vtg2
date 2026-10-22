ALTER TABLE products ADD COLUMN primary_material TEXT CHECK(primary_material IS NULL OR primary_material IN ('cotton','wool','linen','polyester','nylon','cashmere','silk','leather','suede','denim','fleece','viscose','acrylic','other','unknown'));
--> statement-breakpoint
ALTER TABLE products ADD COLUMN material_composition TEXT CHECK(material_composition IS NULL OR (json_valid(material_composition) AND json_type(material_composition)='array'));
--> statement-breakpoint
ALTER TABLE products ADD COLUMN material_source TEXT CHECK(material_source IS NULL OR material_source IN ('LABEL','ESTIMATED','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE products ADD COLUMN material_details TEXT CHECK(material_details IS NULL OR length(material_details)<=500);
--> statement-breakpoint
CREATE INDEX idx_products_primary_material ON products(primary_material);
