import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable, messagesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ai } from "@workspace/integrations-gemini-ai";
import { resolveChatMode, modeInstruction } from "../lib/chat-modes.js";
import { extractVerifiedSources } from "../lib/source-extraction.js";
import { createGroundedChatFallback } from "../lib/chat-fallback.js";
const router = Router();
const SYSTEM_PROMPT = `You are a focused, expert AI study assistant. Your goal is to help the student learn and master their study material.

CRITICAL INSTRUCTIONS:
1. ALWAYS fulfill the specific request made in the latest user prompt:
   - "Summarise" / General questions (e.g. "what this talk about"): Output a clean, direct explanation or bulleted summary of key points from the material. DO NOT generate quiz questions.
   - "Flashcards": Generate 5 distinct Question (Q:) and Answer (A:) flashcards based on the material.
   - "Explain simply": Explain the core concepts in plain English for a beginner.
   - "Quiz me": Generate 5 multiple-choice questions (A, B, C, D) with actual populated choices, followed by a completed Answer Key at the end (e.g. 1. A, 2. C, 3. B...).
2. Ground your answers ONLY in the provided study material (and personal notes if attached). If information is not in the material, state that clearly.
3. NEVER output raw prompt template instructions, placeholder text like '[letter]' or '[question text]', or echo instructions. Always provide real, helpful content.
4. DO NOT copy or repeat the format of past messages in the conversation (such as previous quizzes). Evaluate the LATEST user request independently and answer it directly.`;

router.post("/chat", requireAuth, async (req, res) => {
  const { sessionId, documentId, message, includeNotes, mode } = req.body;
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
---${notesSection}`;

    const { mode: chatMode, isQuizRequest, isFlashcardRequest } = resolveChatMode({ mode });

    // Filter out past quiz and flashcard turns (both user prompts and assistant outputs)
    // when the current user prompt is asking a general question or summary.
    const filteredPriorMessages = priorMessages.slice(0, -1).filter((m) => {
      const contentLower = m.content.toLowerCase();
      const isPastQuiz = contentLower.includes("quiz") ||
                         contentLower.includes("multiple-choice") ||
                         contentLower.includes("multiple choice") ||
                         m.content.includes("Question 1") ||
                         m.content.includes("Question 2") ||
                         m.content.includes("A) ") ||
                         m.content.includes("B) ");

      const isPastFlashcard = contentLower.includes("flashcard") ||
                              m.content.includes("Card 1") ||
                              m.content.includes("Card 2");

      if (!isQuizRequest && isPastQuiz) {
        return false;
      }
      if (!isFlashcardRequest && isPastFlashcard) {
        return false;
      }
      return true;
    });

    const conversationHistory = filteredPriorMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const modeInstructionText = modeInstruction(chatMode);

    const userTurn = {
      role: "user",
      parts: [{ text: `${documentContext}\n\n[CRITICAL DIRECTIVE: ${modeInstructionText}]\n\nCurrent Student Request: ${message.trim()}` }]
    };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const controller = new AbortController();
    let fullResponse = "";
    let verifiedSources = [];
    let aborted = false;
    let streamError = false;
    const onClose = () => {
      aborted = true;
      controller.abort();
    };
    req.on("close", onClose);
    try {
      const stream = await ai.models.generateContentStream({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
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
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
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
        const fallback = createGroundedChatFallback(doc.content, message);
        fullResponse = fallback.content;
        verifiedSources = fallback.sources;
        res.write(`data: ${JSON.stringify({ content: fullResponse })}\n\n`);
      }
      if (!streamError && fullResponse.trim()) {
        try {
          verifiedSources = await extractVerifiedSources(doc.content, fullResponse, ai, controller.signal);
        } catch (srcErr) {
          req.log.error({ err: srcErr }, "Source extraction error");
          verifiedSources = [];
        }
      }
      res.write(`data: ${JSON.stringify({ done: true, sources: verifiedSources })}\n\n`);
    }
    res.end();
    if (fullResponse) {
      try {
        await db.insert(messagesTable).values({
          id: randomUUID(),
          sessionId,
          documentId,
          role: "assistant",
          content: fullResponse,
          sources: verifiedSources
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
