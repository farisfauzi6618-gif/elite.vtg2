DROP INDEX `idx_shipments_provider_no`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipments_provider_no` ON `shipments` (`provider_no`);