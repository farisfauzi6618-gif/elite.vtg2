CREATE TABLE `import_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`instagram_url` text NOT NULL,
	`source` text NOT NULL,
	`caption_status` text NOT NULL,
	`photo_status` text NOT NULL,
	`parse_status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_imports_time` ON `import_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE `photos` (
	`key` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`shortcode` text NOT NULL,
	`instagram_url` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`price` integer,
	`condition` text,
	`defects` text,
	`photo_key` text,
	`caption` text DEFAULT '' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`version` integer DEFAULT 0 NOT NULL,
	`last_mutation` text,
	CONSTRAINT "product_price_valid" CHECK("products"."price" IS NULL OR ("products"."price" >= 0 AND "products"."price" <= 1000000000)),
	CONSTRAINT "product_status_valid" CHECK("products"."status" IN ('draft','published'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_shortcode` ON `products` (`shortcode`);--> statement-breakpoint
CREATE INDEX `idx_products_status_published` ON `products` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `size_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`tag_size` text DEFAULT '' NOT NULL,
	`fits` text DEFAULT '[]' NOT NULL,
	`length_cm` real,
	`width_cm` real,
	`qty` integer,
	`price` integer,
	`condition` text,
	`defects` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "group_qty_valid" CHECK("size_groups"."qty" IS NULL OR (typeof("size_groups"."qty") = 'integer' AND "size_groups"."qty" >= 0 AND "size_groups"."qty" <= 100000)),
	CONSTRAINT "group_price_valid" CHECK("size_groups"."price" IS NULL OR ("size_groups"."price" >= 0 AND "size_groups"."price" <= 1000000000))
);
--> statement-breakpoint
CREATE INDEX `idx_groups_product` ON `size_groups` (`product_id`);--> statement-breakpoint
CREATE TABLE `stock_history` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`product_id` text NOT NULL,
	`before_qty` integer,
	`after_qty` integer,
	`before_revision` integer NOT NULL,
	`after_revision` integer NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`undo_of` text,
	FOREIGN KEY (`group_id`) REFERENCES `size_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_history_product_time` ON `stock_history` (`product_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_history_undo` ON `stock_history` (`undo_of`);