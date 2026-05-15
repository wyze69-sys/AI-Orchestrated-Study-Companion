import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { documentsTable } from "./documents.js";
import { studySessionsTable } from "./study-sessions.js";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => studySessionsTable.id, { onDelete: "cascade" }),
  documentId: text("document_id").references(() => documentsTable.id, {
    onDelete: "set null",
  }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});
