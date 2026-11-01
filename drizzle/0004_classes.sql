CREATE TABLE `class_members` (
	`class_id` text NOT NULL,
	`player_id` text NOT NULL,
	`display_name` text NOT NULL,
	`name_key` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`class_id`, `player_id`),
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_members_name` ON `class_members` (`class_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`category_id` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_code_unique` ON `classes` (`code`);--> statement-breakpoint
CREATE TABLE `player_badges` (
	`player_id` text NOT NULL,
	`class_id` text NOT NULL,
	`badge` text NOT NULL,
	`attempt_id` text,
	`earned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`player_id`, `class_id`, `badge`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_hash_unique` ON `players` (`token_hash`);--> statement-breakpoint
CREATE TABLE `publications` (
	`quiz_id` text NOT NULL,
	`site_url` text NOT NULL,
	`class_code` text NOT NULL,
	`class_name` text DEFAULT '' NOT NULL,
	`remote_quiz_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`published_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`quiz_id`, `site_url`, `class_code`),
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD `player_id` text;--> statement-breakpoint
CREATE INDEX `attempts_player` ON `attempts` (`player_id`);--> statement-breakpoint
ALTER TABLE `quizzes` ADD `class_id` text;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `study_tips` text;