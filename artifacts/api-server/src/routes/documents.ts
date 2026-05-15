import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = file.originalname.toLowerCase();
    const allowedMimes = ["text/plain", "text/markdown", "text/x-markdown"];
    if (allowedMimes.includes(file.mimetype) || ext.endsWith(".txt") || ext.endsWith(".md")) {
      cb(null, true);
    } else {
      cb(new Error("Only .txt and .md files are allowed"));
    }
  },
});

router.post("/sessions/:id/documents", requireAuth, upload.single("file"), async (req, res) => {
  const sessionId = req.params.id as string;

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user!.id),
          isNull(studySessionsTable.deletedAt)
        )
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const content = req.file.buffer.toString("utf-8");
    const id = randomUUID();

    const [doc] = await db
      .insert(documentsTable)
      .values({
        id,
        sessionId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        content,
      })
      .returning();

    res.status(201).json({
      id: doc.id,
      sessionId: doc.sessionId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      content: doc.content,
      uploadedAt: doc.uploadedAt,
    });
  } catch (err: unknown) {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Upload document error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sessions/:id/documents", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;

  try {
    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, sessionId),
          eq(studySessionsTable.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const docs = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.sessionId, sessionId));

    res.json(
      docs.map((d) => ({
        id: d.id,
        sessionId: d.sessionId,
        filename: d.filename,
        mimeType: d.mimeType,
        content: d.content,
        uploadedAt: d.uploadedAt,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List documents error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id", requireAuth, async (req, res) => {
  const docId = req.params.id as string;

  try {
    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, docId))
      .limit(1);

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const [session] = await db
      .select()
      .from(studySessionsTable)
      .where(
        and(
          eq(studySessionsTable.id, doc.sessionId),
          eq(studySessionsTable.userId, req.user!.id)
        )
      )
      .limit(1);

    if (!session) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.delete(documentsTable).where(eq(documentsTable.id, docId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete document error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
