CREATE TABLE `location_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipping_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`origin_json` text NOT NULL,
	`updated_at` text NOT NULL
);
