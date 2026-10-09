CREATE TABLE `catalog_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`lines_json` text NOT NULL,
	`amount` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catalog_checkout_token` ON `catalog_checkouts` (`token_hash`);--> statement-breakpoint
CREATE TABLE `catalog_sales` (
	`order_id` text PRIMARY KEY NOT NULL,
	`checkout_id` text NOT NULL,
	`marker` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`checkout_id`) REFERENCES `catalog_checkouts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catalog_sale_checkout` ON `catalog_sales` (`checkout_id`);