import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users.js";

export const studySessionsTable = pgTable("study_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastAccessed: timestamp("last_accessed").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertStudySessionSchema = createInsertSchema(
  studySessionsTable,
).omit({
  id: true,
  createdAt: true,
  lastAccessed: true,
  deletedAt: true,
});
