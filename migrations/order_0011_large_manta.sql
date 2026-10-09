ALTER TABLE `orders` ADD `catalog_checkout_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `catalog_token` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `catalog_items_json` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_sync_state` text DEFAULT 'unlinked' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_sync_error` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_catalog_checkout` ON `orders` (`catalog_checkout_id`);