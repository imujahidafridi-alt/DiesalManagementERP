CREATE INDEX `audit_timestamp_idx` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `customers_deleted_idx` ON `customers` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `customers_company_name_idx` ON `customers` (`company_name`);--> statement-breakpoint
CREATE INDEX `drivers_deleted_idx` ON `drivers` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `drivers_status_idx` ON `drivers` (`status`);--> statement-breakpoint
CREATE INDEX `drivers_name_idx` ON `drivers` (`name`);--> statement-breakpoint
CREATE INDEX `suppliers_deleted_idx` ON `suppliers` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `suppliers_company_name_idx` ON `suppliers` (`company_name`);--> statement-breakpoint
CREATE INDEX `tx_deleted_idx` ON `transactions` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `tx_created_at_idx` ON `transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `tx_ref_num_idx` ON `transactions` (`reference_number`);--> statement-breakpoint
CREATE INDEX `tx_keyset_idx` ON `transactions` (`transaction_date`,`created_at`,`id`);