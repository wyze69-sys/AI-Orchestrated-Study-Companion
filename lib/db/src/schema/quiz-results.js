import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users.js";
import { studySessionsTable } from "./study-sessions.js";
import { documentsTable } from "./documents.js";
import { messagesTable } from "./messages.js";

export const quizResultsTable = pgTable(
  "quiz_results",
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
    quizId: text("quiz_id").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    score: integer("score").notNull(),
    percentage: integer("percentage").notNull(),
    answerState: jsonb("answer_state").notNull().default({}),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionQuizIdx: uniqueIndex("quiz_results_session_quiz_idx").on(
      table.sessionId,
      table.quizId
    ),
  })
);

export const insertQuizResultSchema = createInsertSchema(quizResultsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
