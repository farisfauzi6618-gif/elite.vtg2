CREATE TABLE `catalog_features` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`group_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "feature_group_valid" CHECK("catalog_features"."group_id" IN ('opening','knit','sleeve','style'))
);
--> statement-breakpoint
CREATE TABLE `feature_aliases` (
	`alias_key` text PRIMARY KEY NOT NULL,
	`feature_id` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`feature_id`) REFERENCES `catalog_features`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feature_alias_term` ON `feature_aliases` (`feature_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `legacy_category` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `feature_ids` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('quarter-zip','Quarter Zip','opening',0);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('quarterzip','quarter-zip','Quarterzip');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('half-zip','Half Zip','opening',1);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('halfzip','half-zip','Halfzip');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('full-zip','Full Zip','opening',2);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('fullzip','full-zip','Fullzip');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('half-button','Half Button','opening',3);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('halfbutton','half-button','Halfbutton');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('cable-knit','Cable Knit','knit',4);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('cableknit','cable-knit','Cableknit');

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('cableknits','cable-knit','Cable Knits');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('long-sleeve','Long Sleeve','sleeve',5);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('longsleeve','long-sleeve','Longsleeve');

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('longsleeves','long-sleeve','Long Sleeves');

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('lenganpanjang','long-sleeve','Lengan panjang');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('short-sleeve','Short Sleeve','sleeve',6);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('shortsleeve','short-sleeve','Shortsleeve');

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('shortsleeves','short-sleeve','Short Sleeves');

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('lenganpendek','short-sleeve','Lengan pendek');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('crewneck','Crewneck','style',7);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('crewneck','crewneck','Crew Neck');

--> statement-breakpoint
INSERT INTO catalog_features(id,label,group_id,sort_order) VALUES('hoodie','Hoodie','style',8);

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('hoodie','hoodie','Hoodie');

--> statement-breakpoint
INSERT INTO feature_aliases(alias_key,feature_id,value) VALUES('hooded','hoodie','Hooded');

--> statement-breakpoint
UPDATE products SET legacy_category=category;

--> statement-breakpoint
UPDATE products SET category=CASE lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) WHEN 'polo' THEN 'Polo' WHEN 'shirt' THEN 'Kemeja' WHEN 'shirts' THEN 'Kemeja' WHEN 'kemeja' THEN 'Kemeja' WHEN 'tshirt' THEN 'Kaos' WHEN 'tshirts' THEN 'Kaos' WHEN 'kaos' THEN 'Kaos' WHEN 'knitwear' THEN 'Sweater & Knitwear' WHEN 'sweater' THEN 'Sweater & Knitwear' WHEN 'sweaters' THEN 'Sweater & Knitwear' WHEN 'sweaterknitwear' THEN 'Sweater & Knitwear' WHEN 'sweatshirt' THEN 'Sweatshirt & Hoodie' WHEN 'sweatshirts' THEN 'Sweatshirt & Hoodie' WHEN 'sweatshirthoodie' THEN 'Sweatshirt & Hoodie' WHEN 'jaket' THEN 'Jaket & Outerwear' WHEN 'jacket' THEN 'Jaket & Outerwear' WHEN 'jackets' THEN 'Jaket & Outerwear' WHEN 'outerwear' THEN 'Jaket & Outerwear' WHEN 'jaketouterwear' THEN 'Jaket & Outerwear' ELSE '' END;

--> statement-breakpoint
UPDATE products SET feature_ids=(SELECT json_group_array(id) FROM (SELECT f.id FROM catalog_features f WHERE (f.id='quarter-zip' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' quarter zip ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' quarterzip ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('quarterzip','quarterzip'))) OR (f.id='half-zip' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' halfzip ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' half zip ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('halfzip','halfzip'))) OR (f.id='full-zip' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' full zip ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' fullzip ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('fullzip','fullzip'))) OR (f.id='half-button' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' half button ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' halfbutton ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('halfbutton','halfbutton'))) OR (f.id='cable-knit' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' cable knits ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' cable knit ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' cableknit ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('cableknits','cableknit','cableknit'))) OR (f.id='long-sleeve' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' lengan panjang ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' long sleeve ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' longsleeve ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' long sleeves ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('lenganpanjang','longsleeve','longsleeve','longsleeves'))) OR (f.id='short-sleeve' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' lengan pendek ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' short sleeve ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' shortsleeve ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' short sleeves ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('lenganpendek','shortsleeve','shortsleeve','shortsleeves'))) OR (f.id='crewneck' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' crewneck ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' crew neck ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('crewneck','crewneck'))) OR (f.id='hoodie' AND (instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' hoodie ')>0 OR instr(' '||lower(replace(replace(replace(replace(replace(name,'-',' '),'_',' '),'/',' '),'—',' '),'–',' '))||' ',' hooded ')>0 OR lower(replace(replace(replace(trim(legacy_category),' ',''),'-',''),'&','')) IN ('hoodie','hooded'))) ORDER BY f.sort_order)),version=version+1;
