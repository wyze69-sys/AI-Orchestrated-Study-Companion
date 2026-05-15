import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable } from "@workspace/db";
import { eq, and, isNull, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
const router = Router();
const MAX_DOCUMENTS_PER_SESSION = 20;
const BINARY_SIGNATURES = [
  Buffer.from([137, 80, 78, 71]),
  // PNG
  Buffer.from([255, 216, 255]),
  // JPEG
  Buffer.from([71, 73, 70]),
  // GIF
  Buffer.from([37, 80, 68, 70]),
  // PDF
  Buffer.from([80, 75, 3, 4]),
  // ZIP/DOCX/XLSX
  Buffer.from([127, 69, 76, 70]),
  // ELF
  Buffer.from([77, 90]),
  // Windows EXE
  Buffer.from([82, 97, 114, 33])
  // RAR
];
function sanitizeFilename(raw) {
  let name = raw.replace(/^.*[\\/]/, "");
  name = name.replace(/[\x00-\x1f\x7f]/g, "");
  name = name.replace(/[^a-zA-Z0-9 _\-\.]/g, "_");
  name = name.replace(/_{2,}/g, "_").trim();
  return name || "document.txt";
}
function isValidTextContent(buffer) {
  if (buffer.includes(0)) {
    return { valid: false, reason: "File contains null bytes and appears to be binary." };
  }
  for (const sig of BINARY_SIGNATURES) {
    if (buffer.length >= sig.length && buffer.subarray(0, sig.length).equals(sig)) {
      return { valid: false, reason: "File has a binary signature and is not a text file." };
    }
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    decoder.decode(buffer);
  } catch {
    return { valid: false, reason: "File is not valid UTF-8 text." };
  }
  return { valid: true };
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    // 5 MB
    files: 1,
    // Only one file per request
    parts: 2
    // file field + at most one other field
  },
  fileFilter(_req, file, cb) {
    const ext = file.originalname.toLowerCase();
    const allowedMimes = ["text/plain", "text/markdown", "text/x-markdown"];
    if (allowedMimes.includes(file.mimetype) || ext.endsWith(".txt") || ext.endsWith(".md")) {
      cb(null, true);
    } else {
      cb(new Error("Only .txt and .md files are allowed"));
    }
  }
});
router.post("/sessions/:id/documents", requireAuth, upload.single("file"), async (req, res) => {
  const sessionId = req.params.id;
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
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
    const [{ cnt }] = await db.select({ cnt: count() }).from(documentsTable).where(eq(documentsTable.sessionId, sessionId));
    if (Number(cnt) >= MAX_DOCUMENTS_PER_SESSION) {
      res.status(400).json({
        error: `Maximum of ${MAX_DOCUMENTS_PER_SESSION} documents per session reached.`
      });
      return;
    }
    const validation = isValidTextContent(req.file.buffer);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }
    const content = req.file.buffer.toString("utf-8");
    const filename = sanitizeFilename(req.file.originalname);
    const id = randomUUID();
    const [doc] = await db.insert(documentsTable).values({
      id,
      sessionId,
      filename,
      mimeType: req.file.mimetype,
      content
    }).returning();
    res.status(201).json({
      id: doc.id,
      sessionId: doc.sessionId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      content: doc.content,
      uploadedAt: doc.uploadedAt
    });
  } catch (err) {
    req.log.error({ err }, "Upload document error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/sessions/:id/documents", requireAuth, async (req, res) => {
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
    const docs = await db.select().from(documentsTable).where(eq(documentsTable.sessionId, sessionId));
    res.json(
      docs.map((d) => ({
        id: d.id,
        sessionId: d.sessionId,
        filename: d.filename,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List documents error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.delete("/documents/:id", requireAuth, async (req, res) => {
  const docId = req.params.id;
  try {
    const [doc] = await db.select({ id: documentsTable.id, sessionId: documentsTable.sessionId }).from(documentsTable).innerJoin(
      studySessionsTable,
      eq(documentsTable.sessionId, studySessionsTable.id)
    ).where(
      and(
        eq(documentsTable.id, docId),
        eq(studySessionsTable.userId, req.user.id)
      )
    ).limit(1);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    await db.delete(documentsTable).where(eq(documentsTable.id, docId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete document error");
    res.status(500).json({ error: "Internal server error" });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
