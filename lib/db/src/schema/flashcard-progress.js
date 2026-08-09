import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users.js";
import { studySessionsTable } from "./study-sessions.js";
import { documentsTable } from "./documents.js";
import { messagesTable } from "./messages.js";

export const flashcardProgressTable = pgTable(
  "flashcard_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => studySessionsTable.id, { onDelete: "cascade" }),
    documentId: text("document_id").references(() => documentsTable.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id").references(() => messagesTable.id, {
      onDelete: "set null",
    }),
    cardId: text("card_id").notNull(),
    status: text("status").notNull(), // 'known' | 'review'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionCardIdx: uniqueIndex("flashcard_progress_session_card_idx").on(
      table.sessionId,
      table.cardId
    ),
  })
);

export const insertFlashcardProgressSchema = createInsertSchema(
  flashcardProgressTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
