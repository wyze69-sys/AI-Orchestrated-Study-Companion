import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable, messagesTable } from "@workspace/db";
import { eq, and, isNull, count, desc, inArray, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
const router = Router();
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
        createdAt: m.createdAt
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
