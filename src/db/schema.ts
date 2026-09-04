import { jsonb, pgTable, real, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: varchar("id", { length: 64 }).primaryKey(),
  version: real("version").notNull().default(1),
  title: text("title").notNull(),
  artist: text("artist").notNull().default(""),
  document: jsonb("document").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("project_id", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  sha256: text("sha256"),
  path: text("path").notNull(),
  durationSec: real("duration_sec"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("project_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  progress: real("progress").notNull().default(0),
  stage: text("stage").notNull().default(""),
  error: text("error"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const asrCache = pgTable(
  "asr_cache",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    audioSha256: text("audio_sha256").notNull(),
    modelId: text("model_id").notNull(),
    language: text("language").notNull().default("en"),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("asr_cache_sha_model").on(table.audioSha256, table.modelId, table.language)],
);

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  groqKey: text("groq_key"),
  persist: varchar("persist", { length: 16 }).notNull().default("session"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
