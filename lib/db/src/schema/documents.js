import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studySessionsTable } from "./study-sessions.js";

export const documentsTable = pgTable("documents", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => studySessionsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  content: text("content").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  uploadedAt: true,
});
