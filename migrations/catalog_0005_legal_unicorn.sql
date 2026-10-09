CREATE TABLE `team_access` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` integer NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_cipher` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "team_slot_valid" CHECK("team_access"."slot" BETWEEN 1 AND 3),
	CONSTRAINT "team_active_valid" CHECK("team_access"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_slot` ON `team_access` (`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_token` ON `team_access` (`token_hash`);--> statement-breakpoint
CREATE TABLE `team_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`access_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`access_id`) REFERENCES `team_access`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_team_session_access` ON `team_sessions` (`access_id`);--> statement-breakpoint
CREATE INDEX `idx_team_session_expiry` ON `team_sessions` (`expires_at`);