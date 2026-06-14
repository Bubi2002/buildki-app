import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  todos: text("todos"), // JSON string
  markers: text("markers"), // JSON string
  photos: text("photos"), // JSON string of photo URLs
  duration: int("duration"),
  recordingMode: varchar("recordingMode", { length: 16 }),
  calendarEventId: varchar("calendarEventId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = typeof protocols.$inferInsert;
