CREATE TABLE `shipping_locations` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipping_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shipping_quotes_expires` ON `shipping_quotes` (`expires_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `item_amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_json` text;