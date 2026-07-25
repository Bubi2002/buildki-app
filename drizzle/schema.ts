import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Local auth fields
  passwordHash: varchar("passwordHash", { length: 255 }),
  emailVerified: boolean("emailVerified").default(false),
  emailVerifyToken: varchar("emailVerifyToken", { length: 64 }),
  emailVerifyExpiry: timestamp("emailVerifyExpiry"),
  resetToken: varchar("resetToken", { length: 64 }),
  resetExpiry: timestamp("resetExpiry"),
  // Subscription / billing
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  subscriptionStatus: varchar("subscriptionStatus", { length: 32 }),
  trialStartedAt: timestamp("trialStartedAt"),
  // Profile
  phone: varchar("phone", { length: 32 }),
  company: varchar("company", { length: 255 }),
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Current account-level privacy choices. One row per authenticated user.
export const privacyConsents = mysqlTable("privacy_consents", {
  userId: int("userId").primaryKey(),
  version: int("version").notNull(),
  aiProcessing: boolean("aiProcessing").default(false).notNull(),
  cloudSync: boolean("cloudSync").default(false).notNull(),
  gpsTracking: boolean("gpsTracking").default(false).notNull(),
  acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  source: varchar("source", { length: 32 }).default("app").notNull(),
});

export type PrivacyConsentRecord = typeof privacyConsents.$inferSelect;
export type InsertPrivacyConsentRecord = typeof privacyConsents.$inferInsert;

// Append-only evidence of purpose grants and withdrawals.
export const privacyConsentEvents = mysqlTable("privacy_consent_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  version: int("version").notNull(),
  purpose: mysqlEnum("purpose", ["aiProcessing", "cloudSync", "gpsTracking"]).notNull(),
  granted: boolean("granted").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  source: varchar("source", { length: 32 }).default("app").notNull(),
});

export type PrivacyConsentEvent = typeof privacyConsentEvents.$inferSelect;
export type InsertPrivacyConsentEvent = typeof privacyConsentEvents.$inferInsert;

// Protocol table for cloud sync
export const protocols = mysqlTable("protocols", {
  id: int("id").autoincrement().primaryKey(),
  localId: varchar("localId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  title: text("title"),
  transcription: text("transcription"),
  protocol: text("protocol"),
  templateName: varchar("templateName", { length: 128 }),
  templateId: varchar("templateId", { length: 64 }),
  todos: text("todos"),
  markers: text("markers"),
  photos: text("photos"),
  duration: int("duration"),
  recordingMode: varchar("recordingMode", { length: 16 }),
  calendarEventId: varchar("calendarEventId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = typeof protocols.$inferInsert;

// ─── Projects table for cloud sync ────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  localId: varchar("localId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  prefix: varchar("prefix", { length: 16 }),
  color: varchar("color", { length: 32 }),
  address: text("address"),
  client: varchar("client", { length: 255 }),
  status: varchar("status", { length: 32 }).default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Defects table for cloud sync ─────────────────────────────────────────────
export const defects = mysqlTable("defects", {
  id: int("id").autoincrement().primaryKey(),
  localId: varchar("localId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("offen"),
  priority: varchar("priority", { length: 16 }).notNull().default("mittel"),
  category: varchar("category", { length: 64 }),
  gewerk: varchar("gewerk", { length: 64 }),
  photos: text("photos"), // JSON array of URLs
  beforePhotos: text("beforePhotos"), // JSON array
  afterPhotos: text("afterPhotos"), // JSON array
  assignee: varchar("assignee", { length: 128 }),
  assigneeFirma: varchar("assigneeFirma", { length: 128 }),
  dueDate: varchar("dueDate", { length: 32 }),
  location: varchar("location", { length: 255 }),
  floor: varchar("floor", { length: 64 }),
  room: varchar("room", { length: 128 }),
  positionCode: varchar("positionCode", { length: 32 }),
  followUpDate: varchar("followUpDate", { length: 32 }),
  followUpResult: varchar("followUpResult", { length: 32 }),
  source: varchar("source", { length: 32 }),
  confidence: int("confidence"), // stored as 0-100
  protocolId: varchar("protocolId", { length: 64 }),
  analysisId: varchar("analysisId", { length: 64 }),
  // Matterport integration
  matterportModelId: varchar("matterportModelId", { length: 128 }),
  matterportPosition: text("matterportPosition"), // JSON {x,y,z}
  matterportNormal: text("matterportNormal"), // JSON {x,y,z}
  matterportSweepId: varchar("matterportSweepId", { length: 128 }),
  matterportFloorIndex: int("matterportFloorIndex"),
  matterportFloorName: varchar("matterportFloorName", { length: 128 }),
  matterportRoomId: varchar("matterportRoomId", { length: 128 }),
  matterportRoomName: varchar("matterportRoomName", { length: 128 }),
  // KI integration
  aiSummary: text("aiSummary"),
  voiceNoteUri: text("voiceNoteUri"),
  // Signatures (JSON array of {role, paths, signedAt})
  signatures: text("signatures"),
  // Comments (JSON array)
  comments: text("comments"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type DbDefect = typeof defects.$inferSelect;
export type InsertDefect = typeof defects.$inferInsert;

// ─── Attachments table for file sync ──────────────────────────────────────────
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  entityType: varchar("entityType", { length: 32 }).notNull(), // "defect" | "protocol" | "project" | "diary"
  entityLocalId: varchar("entityLocalId", { length: 64 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 512 }).notNull(),
  originalName: varchar("originalName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  sizeBytes: int("sizeBytes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ─── Daily Reports (Bautagebuch) ──────────────────────────────────────────────
export const dailyReports = mysqlTable("daily_reports", {
  id: int("id").autoincrement().primaryKey(),
  localId: varchar("localId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  weather: text("weather"), // JSON {temp, condition, wind}
  attendance: text("attendance"), // JSON array
  defectsSummary: text("defectsSummary"), // JSON array of defect refs
  activities: text("activities"), // JSON array of activities
  notes: text("notes"),
  generatedReport: text("generatedReport"), // LLM-generated Markdown
  photos: text("photos"), // JSON array of photo URLs
  status: varchar("status", { length: 32 }).default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = typeof dailyReports.$inferInsert;
