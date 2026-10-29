CREATE TABLE photo_public_references(photo_key TEXT NOT NULL,product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,PRIMARY KEY(photo_key,product_id)) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX photo_public_references_product ON photo_public_references(product_id);
--> statement-breakpoint
INSERT OR IGNORE INTO photo_public_references(photo_key,product_id) SELECT photo_key,id FROM (SELECT photo_key,id FROM products WHERE status='published' AND deleted_at IS NULL 
 UNION SELECT j.value,p.id FROM products p,json_each(p.photo_keys) j WHERE p.status='published' AND p.deleted_at IS NULL 
 UNION SELECT json_extract(c.value,'$.photoKey'),p.id FROM products p,json_each(p.color_variants) c WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 
 UNION SELECT json_extract(c.value,'$.swatchImage'),p.id FROM products p,json_each(p.color_variants) c WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 
 UNION SELECT g.value,p.id FROM products p,json_each(p.color_variants) c,json_each(c.value,'$.photoKeys') g WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 ) WHERE typeof(photo_key)='text' AND length(photo_key)=36;
--> statement-breakpoint
CREATE TRIGGER photo_references_insert AFTER INSERT ON products BEGIN INSERT OR IGNORE INTO photo_public_references(photo_key,product_id) SELECT photo_key,id FROM (SELECT photo_key,id FROM products WHERE status='published' AND deleted_at IS NULL AND id=NEW.id
 UNION SELECT j.value,p.id FROM products p,json_each(p.photo_keys) j WHERE p.status='published' AND p.deleted_at IS NULL AND p.id=NEW.id
 UNION SELECT json_extract(c.value,'$.photoKey'),p.id FROM products p,json_each(p.color_variants) c WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 AND p.id=NEW.id
 UNION SELECT json_extract(c.value,'$.swatchImage'),p.id FROM products p,json_each(p.color_variants) c WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 AND p.id=NEW.id
 UNION SELECT g.value,p.id FROM products p,json_each(p.color_variants) c,json_each(c.value,'$.photoKeys') g WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 AND p.id=NEW.id) WHERE typeof(photo_key)='text' AND length(photo_key)=36; END;
--> statement-breakpoint
CREATE TRIGGER photo_references_update AFTER UPDATE OF photo_key,photo_keys,color_variants,status,deleted_at ON products BEGIN DELETE FROM photo_public_references WHERE product_id=OLD.id; INSERT OR IGNORE INTO photo_public_references(photo_key,product_id) SELECT photo_key,id FROM (SELECT photo_key,id FROM products WHERE status='published' AND deleted_at IS NULL AND id=NEW.id
 UNION SELECT j.value,p.id FROM products p,json_each(p.photo_keys) j WHERE p.status='published' AND p.deleted_at IS NULL AND p.id=NEW.id
 UNION SELECT json_extract(c.value,'$.photoKey'),p.id FROM products p,json_each(p.color_variants) c WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 AND p.id=NEW.id
 UNION SELECT json_extract(c.value,'$.swatchImage'),p.id FROM products p,json_each(p.color_variants) c WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 AND p.id=NEW.id
 UNION SELECT g.value,p.id FROM products p,json_each(p.color_variants) c,json_each(c.value,'$.photoKeys') g WHERE p.status='published' AND p.deleted_at IS NULL AND json_extract(c.value,'$.active')=1 AND p.id=NEW.id) WHERE typeof(photo_key)='text' AND length(photo_key)=36; END;
--> statement-breakpoint
CREATE TRIGGER photo_references_delete AFTER DELETE ON products BEGIN DELETE FROM photo_public_references WHERE product_id=OLD.id; END;
--> statement-breakpoint
CREATE TABLE photo_public_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO photo_public_budget SELECT 1,COALESCE(SUM(CASE WHEN state!='ready' THEN 524288 ELSE byte_size END),0) FROM photo_public_derivatives;
--> statement-breakpoint
CREATE TRIGGER photo_budget_insert AFTER INSERT ON photo_public_derivatives BEGIN UPDATE photo_public_budget SET bytes=bytes+(CASE WHEN NEW.state!='ready' THEN 524288 ELSE NEW.byte_size END) WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER photo_budget_update AFTER UPDATE OF state,byte_size ON photo_public_derivatives BEGIN UPDATE photo_public_budget SET bytes=bytes-(CASE WHEN OLD.state!='ready' THEN 524288 ELSE OLD.byte_size END)+(CASE WHEN NEW.state!='ready' THEN 524288 ELSE NEW.byte_size END) WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER photo_budget_delete AFTER DELETE ON photo_public_derivatives BEGIN UPDATE photo_public_budget SET bytes=bytes-(CASE WHEN OLD.state!='ready' THEN 524288 ELSE OLD.byte_size END) WHERE id=1; END;
