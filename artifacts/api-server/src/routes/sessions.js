import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable, messagesTable, flashcardProgressTable, quizResultsTable } from "@workspace/db";
import { eq, and, isNull, count, desc, inArray, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { validateQuizResultInput } from "../lib/quiz-persistence.js";
import { validateFlashcardStatusInput } from "../lib/flashcard-status.js";
const router = Router();

async function resolveOwnedMessageId(messageId, sessionId) {
  if (!messageId) return null;
  const [message] = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.id, String(messageId)),
        eq(messagesTable.sessionId, sessionId)
      )
    )
    .limit(1);
  return message?.id ?? null;
}

router.get("/sessions", requireAuth, async (req, res) => {
  try {
    const sessions = await db.select().from(studySessionsTable).where(
      and(
        eq(studySessionsTable.userId, req.user.id),
        isNull(studySessionsTable.deletedAt)
      )
    ).orderBy(desc(studySessionsTable.lastAccessed));
    const sessionIds = sessions.map((s) => s.id);
    const [docCountRows, msgCountRows] = await Promise.all([
      sessionIds.length ? db.select({ sessionId: documentsTable.sessionId, cnt: count() }).from(documentsTable).where(inArray(documentsTable.sessionId, sessionIds)).groupBy(documentsTable.sessionId) : Promise.resolve([]),
      sessionIds.length ? db.select({ sessionId: messagesTable.sessionId, cnt: count() }).from(messagesTable).where(inArray(messagesTable.sessionId, sessionIds)).groupBy(messagesTable.sessionId) : Promise.resolve([])
    ]);
    const docMap = new Map(docCountRows.map((d) => [d.sessionId, Number(d.cnt)]));
    const msgMap = new Map(msgCountRows.map((m) => [m.sessionId, Number(m.cnt)]));
    res.json(
      sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        title: s.title,
        createdAt: s.createdAt,
        lastAccessed: s.lastAccessed,
        documentCount: docMap.get(s.id) ?? 0,
        messageCount: msgMap.get(s.id) ?? 0
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List sessions error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/sessions/search", requireAuth, async (req, res) => {
  const query = String(req.query?.q ?? "").trim();
  try {
    const sessions = await db.select().from(studySessionsTable).where(
      and(
        eq(studySessionsTable.userId, req.user.id),
        isNull(studySessionsTable.deletedAt)
      )
    ).orderBy(desc(studySessionsTable.lastAccessed));
    const sessionIds = sessions.map((s) => s.id);
    let matchingSessionIds = new Set(sessionIds);
    if (query) {
      const pattern = `%${query}%`;
      const titleMatches = sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())).map((s) => s.id);
      const messageMatches = sessionIds.length ? await db.select({ sessionId: messagesTable.sessionId }).from(messagesTable).where(
        and(
          inArray(messagesTable.sessionId, sessionIds),
          ilike(messagesTable.content, pattern)
        )
      ) : [];
      matchingSessionIds = new Set([
        ...titleMatches,
        ...messageMatches.map((m) => m.sessionId)
      ]);
    }
    const filteredSessions = sessions.filter((s) => matchingSessionIds.has(s.id));
    const filteredSessionIds = filteredSessions.map((s) => s.id);
    const [docCountRows, msgCountRows] = await Promise.all([
      filteredSessionIds.length ? db.select({ sessionId: documentsTable.sessionId, cnt: count() }).from(documentsTable).where(inArray(documentsTable.sessionId, filteredSessionIds)).groupBy(documentsTable.sessionId) : Promise.resolve([]),
      filteredSessionIds.length ? db.select({ sessionId: messagesTable.sessionId, cnt: count() }).from(messagesTable).where(inArray(messagesTable.sessionId, filteredSessionIds)).groupBy(messagesTable.sessionId) : Promise.resolve([])
    ]);
    const docMap = new Map(docCountRows.map((d) => [d.sessionId, Number(d.cnt)]));
    const msgMap = new Map(msgCountRows.map((m) => [m.sessionId, Number(m.cnt)]));
    res.json(
      filteredSessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        title: s.title,
        createdAt: s.createdAt,
        lastAccessed: s.lastAccessed,
        documentCount: docMap.get(s.id) ?? 0,
        messageCount: msgMap.get(s.id) ?? 0
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Search sessions error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.post("/sessions", requireAuth, async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  try {
    const id = randomUUID();
    const [session] = await db.insert(studySessionsTable).values({ id, userId: req.user.id, title: title.trim() }).returning();
    res.status(201).json({
      id: session.id,
      userId: session.userId,
      title: session.title,
      createdAt: session.createdAt,
      lastAccessed: session.lastAccessed,
      documentCount: 0,
      messageCount: 0
    });
  } catch (err) {
    req.log.error({ err }, "Create session error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/sessions/:id", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db.select().from(studySessionsTable).where(
      and(
        eq(studySessionsTable.id, sessionId),
        eq(studySessionsTable.userId, req.user.id),
        isNull(studySessionsTable.deletedAt)
      )
    ).limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await db.update(studySessionsTable).set({ lastAccessed: /* @__PURE__ */ new Date() }).where(eq(studySessionsTable.id, session.id));
    const documents = await db.select().from(documentsTable).where(eq(documentsTable.sessionId, session.id));
    res.json({
      id: session.id,
      userId: session.userId,
      title: session.title,
      notes: session.notes ?? null,
      createdAt: session.createdAt,
      lastAccessed: session.lastAccessed,
      documents: documents.map((d) => ({
        id: d.id,
        sessionId: d.sessionId,
        filename: d.filename,
        mimeType: d.mimeType,
        content: d.content,
        uploadedAt: d.uploadedAt
      }))
    });
  } catch (err) {
    req.log.error({ err }, "Get session error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.patch("/sessions/:id/notes", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const { notes } = req.body;
  if (typeof notes !== "string") {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  try {
    const [session] = await db.select().from(studySessionsTable).where(
      and(
        eq(studySessionsTable.id, sessionId),
        eq(studySessionsTable.userId, req.user.id),
        isNull(studySessionsTable.deletedAt)
      )
    ).limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await db.update(studySessionsTable).set({ notes }).where(eq(studySessionsTable.id, sessionId));
    const documents = await db.select().from(documentsTable).where(eq(documentsTable.sessionId, sessionId));
    res.json({
      id: session.id,
      userId: session.userId,
      title: session.title,
      notes,
      createdAt: session.createdAt,
      lastAccessed: session.lastAccessed,
      documents: documents.map((d) => ({
        id: d.id,
        sessionId: d.sessionId,
        filename: d.filename,
        mimeType: d.mimeType,
        content: d.content,
        uploadedAt: d.uploadedAt
      }))
    });
  } catch (err) {
    req.log.error({ err }, "Update notes error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.delete("/sessions/:id", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db.select().from(studySessionsTable).where(
      and(
        eq(studySessionsTable.id, sessionId),
        eq(studySessionsTable.userId, req.user.id)
      )
    ).limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await db.update(studySessionsTable).set({ deletedAt: /* @__PURE__ */ new Date() }).where(eq(studySessionsTable.id, sessionId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete session error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/sessions/:id/messages", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db.select().from(studySessionsTable).where(
      and(
        eq(studySessionsTable.id, sessionId),
        eq(studySessionsTable.userId, req.user.id)
      )
    ).limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const messages = await db.select().from(messagesTable).where(eq(messagesTable.sessionId, sessionId)).orderBy(messagesTable.createdAt);
    res.json(
      messages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        documentId: m.documentId,
        role: m.role,
        content: m.content,
        sources: m.role === "assistant" ? (m.sources ?? []) : [],
        createdAt: m.createdAt
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/sessions/:id/flashcards/progress", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user.id),
          isNull(studySessionsTable.deletedAt)
        )
      )
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const progress = await db
      .select()
      .from(flashcardProgressTable)
      .where(
        and(
          eq(flashcardProgressTable.sessionId, sessionId),
          eq(flashcardProgressTable.userId, req.user.id)
        )
      );
    res.json(
      progress.map((p) => ({
        id: p.id,
        userId: p.userId,
        sessionId: p.sessionId,
        documentId: p.documentId ?? null,
        messageId: p.messageId ?? null,
        cardId: p.cardId,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Get flashcard progress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sessions/:id/flashcards/progress", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user.id),
          isNull(studySessionsTable.deletedAt)
        )
      )
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const rawItems = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.progress)
      ? req.body.progress
      : req.body
      ? [req.body]
      : [];

    const statusValidation = validateFlashcardStatusInput(rawItems);
    if (!statusValidation.valid) {
      res.status(400).json({ error: statusValidation.error });
      return;
    }

    const upserted = [];
    for (const item of rawItems) {
      const messageId = await resolveOwnedMessageId(item.messageId, sessionId);
      const cardIdStr = String(item.cardId).trim();
      const status = item.status;
      const [record] = await db
        .insert(flashcardProgressTable)
        .values({
          id: randomUUID(),
          userId: req.user.id,
          sessionId,
          documentId: item.documentId || null,
          messageId,
          cardId: cardIdStr,
          status,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [flashcardProgressTable.sessionId, flashcardProgressTable.cardId],
          set: {
            status,
            updatedAt: new Date()
          }
        })
        .returning();
      upserted.push({
        id: record.id,
        userId: record.userId,
        sessionId: record.sessionId,
        documentId: record.documentId ?? null,
        messageId: record.messageId ?? null,
        cardId: record.cardId,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      });
    }

    res.json({ success: true, progress: upserted });
  } catch (err) {
    req.log.error({ err }, "Post flashcard progress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sessions/:id/flashcards/progress", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user.id),
          isNull(studySessionsTable.deletedAt)
        )
      )
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await db
      .delete(flashcardProgressTable)
      .where(
        and(
          eq(flashcardProgressTable.sessionId, sessionId),
          eq(flashcardProgressTable.userId, req.user.id)
        )
      );
    res.json({ success: true, message: "Flashcard progress reset successfully" });
  } catch (err) {
    req.log.error({ err }, "Delete flashcard progress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

const handleGetQuizResults = async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user.id),
          isNull(studySessionsTable.deletedAt)
        )
      )
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const results = await db
      .select()
      .from(quizResultsTable)
      .where(
        and(
          eq(quizResultsTable.sessionId, sessionId),
          eq(quizResultsTable.userId, req.user.id)
        )
      );
    res.json(
      results.map((r) => ({
        id: r.id,
        userId: r.userId,
        sessionId: r.sessionId,
        documentId: r.documentId ?? null,
        messageId: r.messageId ?? null,
        quizId: r.quizId,
        totalQuestions: r.totalQuestions,
        score: r.score,
        percentage: r.percentage,
        answerState: r.answerState ?? {},
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Get quiz results error");
    res.status(500).json({ error: "Internal server error" });
  }
};

const handlePostQuizResult = async (req, res) => {
  const sessionId = req.params.id;
  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user.id),
          isNull(studySessionsTable.deletedAt)
        )
      )
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const validation = validateQuizResultInput(req.body);
    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { quizId, totalQuestions, score, percentage, answerState, documentId, messageId } = req.body;
    const normalizedMessageId = await resolveOwnedMessageId(messageId, sessionId);
    const now = new Date();

    const [saved] = await db
      .insert(quizResultsTable)
      .values({
        id: randomUUID(),
        userId: req.user.id,
        sessionId,
        documentId: documentId || null,
        messageId: normalizedMessageId,
        quizId: String(quizId).trim(),
        totalQuestions: Number(totalQuestions),
        score: Number(score),
        percentage: Number(percentage),
        answerState: answerState ?? {},
        completedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [quizResultsTable.sessionId, quizResultsTable.quizId],
        set: {
          totalQuestions: Number(totalQuestions),
          score: Number(score),
          percentage: Number(percentage),
          answerState: answerState ?? {},
          completedAt: now,
          updatedAt: now
        }
      })
      .returning();

    res.json({
      success: true,
      result: {
        id: saved.id,
        userId: saved.userId,
        sessionId: saved.sessionId,
        documentId: saved.documentId ?? null,
        messageId: saved.messageId ?? null,
        quizId: saved.quizId,
        totalQuestions: saved.totalQuestions,
        score: saved.score,
        percentage: saved.percentage,
        answerState: saved.answerState ?? {},
        completedAt: saved.completedAt,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      }
    });
  } catch (err) {
    req.log.error({ err }, "Save quiz result error");
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/sessions/:id/quizzes/results", requireAuth, handleGetQuizResults);
router.get("/sessions/:id/quiz-results", requireAuth, handleGetQuizResults);
router.post("/sessions/:id/quizzes/results", requireAuth, handlePostQuizResult);
router.post("/sessions/:id/quiz-results", requireAuth, handlePostQuizResult);

var stdin_default = router;
export {
  stdin_default as default
};
