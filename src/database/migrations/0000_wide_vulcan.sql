CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_name` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_data` text,
	`new_data` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`user` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`contact_person` text,
	`phone` text,
	`address` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`address` text,
	`vehicle_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`item` text PRIMARY KEY NOT NULL,
	`current_stock` real DEFAULT 0 NOT NULL,
	`weighted_average_cost` integer DEFAULT 0 NOT NULL,
	`last_transaction_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`contact_person` text,
	`phone` text,
	`address` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_number` text NOT NULL,
	`transaction_type` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`destination_type` text NOT NULL,
	`destination_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` integer NOT NULL,
	`selling_rate` integer NOT NULL,
	`average_cost_snapshot` integer NOT NULL,
	`profit_snapshot` integer NOT NULL,
	`reference_number` text,
	`reference_type` text,
	`transaction_date` text NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`plate_number` text NOT NULL,
	`description` text,
	`capacity` real DEFAULT 0 NOT NULL,
	`assigned_driver_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_name`,`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transaction_number_unique` ON `transactions` (`transaction_number`);--> statement-breakpoint
CREATE INDEX `tx_source_idx` ON `transactions` (`source_id`);--> statement-breakpoint
CREATE INDEX `tx_dest_idx` ON `transactions` (`destination_id`);--> statement-breakpoint
CREATE INDEX `tx_date_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `tx_type_idx` ON `transactions` (`transaction_type`);