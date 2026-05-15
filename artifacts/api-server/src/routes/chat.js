import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable, messagesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ai } from "@workspace/integrations-gemini-ai";
const router = Router();
const SYSTEM_PROMPT = "You are a focused study assistant. Answer questions ONLY using the provided study material. If the answer is not in the material, say so clearly. Do not make up information.";
router.post("/chat", requireAuth, async (req, res) => {
  const { sessionId, documentId, message, includeNotes } = req.body;
  if (!sessionId || !documentId || !message?.trim()) {
    res.status(400).json({ error: "sessionId, documentId, and message are required" });
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
    const [doc] = await db.select().from(documentsTable).where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.sessionId, sessionId)
      )
    ).limit(1);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    await db.insert(messagesTable).values({
      id: randomUUID(),
      sessionId,
      documentId,
      role: "user",
      content: message.trim()
    });
    const priorMessages = await db.select().from(messagesTable).where(eq(messagesTable.sessionId, sessionId)).orderBy(messagesTable.createdAt).limit(10);
    const notesSection = includeNotes && session.notes?.trim() ? `

Student's personal notes:
---
${session.notes.trim()}
---` : "";
    const documentContext = `Study material:
---
${doc.content}
---${notesSection}

Student question: `;
    const conversationHistory = priorMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const userTurn = {
      role: "user",
      parts: [{ text: documentContext + message.trim() }]
    };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const controller = new AbortController();
    let fullResponse = "";
    let aborted = false;
    let streamError = false;
    const onClose = () => {
      aborted = true;
      controller.abort();
    };
    req.on("close", onClose);
    try {
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [...conversationHistory, userTurn],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: 8192,
          abortSignal: controller.signal
        }
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}

`);
        }
      }
    } catch (streamErr) {
      const isAbort = streamErr instanceof Error && streamErr.name === "AbortError" || controller.signal.aborted;
      if (!isAbort) {
        streamError = true;
        req.log.error({ err: streamErr }, "Gemini stream error");
      }
    } finally {
      req.off("close", onClose);
    }
    if (!aborted) {
      if (streamError) {
        res.write(`data: ${JSON.stringify({ error: "AI response was interrupted." })}

`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}

`);
    }
    res.end();
    if (fullResponse) {
      try {
        await db.insert(messagesTable).values({
          id: randomUUID(),
          sessionId,
          documentId,
          role: "assistant",
          content: fullResponse
        });
        await db.update(studySessionsTable).set({ lastAccessed: /* @__PURE__ */ new Date() }).where(eq(studySessionsTable.id, sessionId));
      } catch (dbErr) {
        req.log.error({ err: dbErr }, "Chat DB write error");
      }
    }
  } catch (err) {
    req.log.error({ err }, "Chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream failed" })}

`);
      res.end();
    }
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
