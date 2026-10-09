CREATE TABLE `shipments` (
	`order_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'payment_confirmed' NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`environment` text,
	`config_json` text,
	`weight_grams` integer,
	`max_cost` integer,
	`destination_json` text,
	`request_json` text,
	`create_sent_at` integer,
	`provider_id` text,
	`provider_no` text,
	`awb` text,
	`pickup_state` text DEFAULT 'pending' NOT NULL,
	`pickup_json` text,
	`label_pdf` text,
	`label_png` text,
	`pdf_message` text,
	`png_message` text,
	`summary_message` text,
	`last_error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_shipments_provider_no` ON `shipments` (`provider_no`);--> statement-breakpoint
CREATE TABLE `telegram_receipts` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`lease` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_state` text DEFAULT 'awaiting_proof' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `confirmed_by` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `shipping_cipher` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `shipping_config` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `webhook_cipher` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `webhook_active` integer DEFAULT 0 NOT NULL;