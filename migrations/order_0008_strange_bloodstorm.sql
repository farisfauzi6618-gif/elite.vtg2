CREATE TABLE `shipment_tracking` (
	`order_id` text PRIMARY KEY NOT NULL,
	`awb` text NOT NULL,
	`payload` text,
	`checked_at` integer,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tracking_links` (
	`order_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`token_cipher` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tracking_links_token_hash` ON `tracking_links` (`token_hash`);