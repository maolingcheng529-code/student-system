CREATE TABLE `course_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_url` text NOT NULL,
	`payload` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`imported_at` text NOT NULL
);
