CREATE TABLE `privacy_consents` (
  `userId` int NOT NULL,
  `version` int NOT NULL,
  `aiProcessing` boolean NOT NULL DEFAULT false,
  `cloudSync` boolean NOT NULL DEFAULT false,
  `gpsTracking` boolean NOT NULL DEFAULT false,
  `acceptedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `source` varchar(32) NOT NULL DEFAULT 'app',
  CONSTRAINT `privacy_consents_userId` PRIMARY KEY(`userId`)
);--> statement-breakpoint
CREATE TABLE `privacy_consent_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `version` int NOT NULL,
  `purpose` enum('aiProcessing','cloudSync','gpsTracking') NOT NULL,
  `granted` boolean NOT NULL,
  `occurredAt` timestamp NOT NULL DEFAULT (now()),
  `source` varchar(32) NOT NULL DEFAULT 'app',
  CONSTRAINT `privacy_consent_events_id` PRIMARY KEY(`id`)
);
