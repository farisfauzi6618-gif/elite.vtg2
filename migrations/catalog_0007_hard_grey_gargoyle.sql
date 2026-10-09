CREATE TABLE `customer_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_session_expiry` ON `customer_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`identity` text NOT NULL,
	`email` text,
	`phone` text,
	`birthday` text,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customer_identity` ON `customers` (`identity`);--> statement-breakpoint
ALTER TABLE `catalog_checkouts` ADD `customer_id` text REFERENCES customers(id);