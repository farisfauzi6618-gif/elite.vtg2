CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`session_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`postcode` text NOT NULL,
	`item` text NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'awaiting_proof' NOT NULL,
	`proof_key` text,
	`proof_mime` text,
	`notify_status` text DEFAULT 'pending' NOT NULL,
	`invoice_message` text,
	`proof_message` text,
	`notify_lease` integer DEFAULT 0 NOT NULL,
	`delivery_chat` text
);
--> statement-breakpoint
CREATE INDEX `idx_orders_created` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text,
	`merchant` text DEFAULT 'ELITE.VTG' NOT NULL,
	`qris_key` text,
	`qris_mime` text,
	`bot_cipher` text,
	`bot_username` text,
	`chat_id` text,
	`chat_name` text,
	`pair_nonce` text,
	`pair_expires` integer,
	`candidate_id` text,
	`candidate_name` text
);
