CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_secrets` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `categories` ADD `user_id` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_user` ON `categories` (`user_id`);--> statement-breakpoint
-- Existing AI settings and keys belong to the computer's owner (the local user).
INSERT INTO `user_settings` (`user_id`, `key`, `value`) SELECT 'local', `key`, `value` FROM `settings` WHERE `key` NOT LIKE 'health.%';--> statement-breakpoint
DELETE FROM `settings` WHERE `key` NOT LIKE 'health.%';--> statement-breakpoint
INSERT INTO `user_secrets` (`user_id`, `key`, `value`, `updated_at`) SELECT 'local', `key`, `value`, `updated_at` FROM `secrets`;
