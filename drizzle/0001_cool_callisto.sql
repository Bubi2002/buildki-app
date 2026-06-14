CREATE TABLE `protocols` (
	`id` int AUTO_INCREMENT NOT NULL,
	`localId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`title` text,
	`transcription` text,
	`protocol` text,
	`templateName` varchar(128),
	`templateId` varchar(64),
	`todos` text,
	`markers` text,
	`photos` text,
	`duration` int,
	`recordingMode` varchar(16),
	`calendarEventId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `protocols_id` PRIMARY KEY(`id`)
);
