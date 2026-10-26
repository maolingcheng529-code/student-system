CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`model` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
