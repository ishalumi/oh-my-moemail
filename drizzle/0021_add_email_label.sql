ALTER TABLE `email` ADD `label` text;--> statement-breakpoint
CREATE INDEX `email_label_lower_idx` ON `email` (LOWER("label"));