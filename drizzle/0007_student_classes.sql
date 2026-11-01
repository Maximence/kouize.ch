CREATE TABLE `class_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_invites_token_hash_unique` ON `class_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `class_invites_email` ON `class_invites` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_invites_class_email` ON `class_invites` (`class_id`,`email`);--> statement-breakpoint
ALTER TABLE `classes` ADD `kind` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `classes` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `players` ADD `user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `players_user` ON `players` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `name` text DEFAULT '' NOT NULL;