CREATE TABLE `prayer_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`startMinutes` int NOT NULL,
	`endMinutes` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prayer_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `prayer_slots_token_unique` UNIQUE(`token`)
);
