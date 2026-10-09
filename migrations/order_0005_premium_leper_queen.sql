ALTER TABLE `shipments` ADD `insurance_state` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipments` ADD `insured_value` integer;--> statement-breakpoint
ALTER TABLE `shipments` ADD `insurance_fee` real;