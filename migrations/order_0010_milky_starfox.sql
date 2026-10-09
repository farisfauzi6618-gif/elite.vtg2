CREATE TABLE `kirimin_search_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `kirimin_webhook_cipher` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `kirimin_webhook_active` integer DEFAULT 0 NOT NULL;