import { Router } from "express";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable, messagesTable } from "@workspace/db";
import { eq, and, isNull, count, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Fetch only this user's active sessions
    const sessions = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(eq(studySessionsTable.userId, userId), isNull(studySessionsTable.deletedAt))
      )
      .orderBy(desc(studySessionsTable.lastAccessed));

    const sessionIds = sessions.map((s) => s.id);

    // Scoped counts — only over the user's own sessions
    const [docCountRows, msgCountRows] = await Promise.all([
      sessionIds.length
        ? db
            .select({ sessionId: documentsTable.sessionId, cnt: count() })
            .from(documentsTable)
            .where(inArray(documentsTable.sessionId, sessionIds))
            .groupBy(documentsTable.sessionId)
        : Promise.resolve([]),
      sessionIds.length
        ? db
            .select({ sessionId: messagesTable.sessionId, cnt: count() })
            .from(messagesTable)
            .where(inArray(messagesTable.sessionId, sessionIds))
            .groupBy(messagesTable.sessionId)
        : Promise.resolve([]),
    ]);

    const docMap = new Map(docCountRows.map((d) => [d.sessionId, Number(d.cnt)]));
    const msgMap = new Map(msgCountRows.map((m) => [m.sessionId, Number(m.cnt)]));

    const totalDocuments = [...docMap.values()].reduce((sum, n) => sum + n, 0);
    const totalMessages = [...msgMap.values()].reduce((sum, n) => sum + n, 0);

    const enrichedSessions = sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      title: s.title,
      createdAt: s.createdAt,
      lastAccessed: s.lastAccessed,
      documentCount: docMap.get(s.id) ?? 0,
      messageCount: msgMap.get(s.id) ?? 0,
    }));

    res.json({
      totalSessions: sessions.length,
      totalDocuments,
      totalMessages,
      recentSessions: enrichedSessions.slice(0, 5),
    });
  } catch (err) {
    req.log.error({ err }, "Dashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
