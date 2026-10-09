ALTER TABLE `orders` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `items_json` text;