CREATE TABLE `admin_access` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "admin_access_single_owner" CHECK("admin_access"."id" = 1)
);
