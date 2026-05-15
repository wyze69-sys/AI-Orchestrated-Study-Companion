import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { studySessionsTable, documentsTable } from "@workspace/db";
import { eq, and, isNull, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const MAX_DOCUMENTS_PER_SESSION = 20;

// Known binary file signatures (magic bytes) that should never appear in text files.
const BINARY_SIGNATURES = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG
  Buffer.from([0xff, 0xd8, 0xff]),         // JPEG
  Buffer.from([0x47, 0x49, 0x46]),         // GIF
  Buffer.from([0x25, 0x50, 0x44, 0x46]),   // PDF
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),   // ZIP/DOCX/XLSX
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),   // ELF
  Buffer.from([0x4d, 0x5a]),               // Windows EXE
  Buffer.from([0x52, 0x61, 0x72, 0x21]),   // RAR
];

/**
 * Sanitize a filename: strip path separators, control chars, and only keep
 * safe characters (letters, digits, spaces, underscores, hyphens, dots).
 */
function sanitizeFilename(raw: string): string {
  // Remove path components
  let name = raw.replace(/^.*[\\/]/, "");
  // Remove control characters
  name = name.replace(/[\x00-\x1f\x7f]/g, "");
  // Keep only safe characters
  name = name.replace(/[^a-zA-Z0-9 _\-\.]/g, "_");
  // Collapse multiple underscores/spaces
  name = name.replace(/_{2,}/g, "_").trim();
  // Ensure it's not empty
  return name || "document.txt";
}

/**
 * Validate that a buffer contains valid UTF-8 text, not binary data.
 */
function isValidTextContent(buffer: Buffer): { valid: boolean; reason?: string } {
  // Check for null bytes — strong indicator of binary
  if (buffer.includes(0x00)) {
    return { valid: false, reason: "File contains null bytes and appears to be binary." };
  }

  // Check for known binary signatures
  for (const sig of BINARY_SIGNATURES) {
    if (buffer.length >= sig.length && buffer.subarray(0, sig.length).equals(sig)) {
      return { valid: false, reason: "File has a binary signature and is not a text file." };
    }
  }

  // Verify valid UTF-8 by round-tripping through TextDecoder
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
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,                   // Only one file per request
    parts: 2,                   // file field + at most one other field
  },
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
    // Verify session ownership
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

    // Enforce per-session document cap
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(documentsTable)
      .where(eq(documentsTable.sessionId, sessionId));

    if (Number(cnt) >= MAX_DOCUMENTS_PER_SESSION) {
      res.status(400).json({
        error: `Maximum of ${MAX_DOCUMENTS_PER_SESSION} documents per session reached.`,
      });
      return;
    }

    // Validate content is actually text (not a renamed binary)
    const validation = isValidTextContent(req.file.buffer);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    const content = req.file.buffer.toString("utf-8");
    const filename = sanitizeFilename(req.file.originalname);
    const id = randomUUID();

    const [doc] = await db
      .insert(documentsTable)
      .values({
        id,
        sessionId,
        filename,
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

    // Return metadata only in list view (content is fetched via session detail)
    res.json(
      docs.map((d) => ({
        id: d.id,
        sessionId: d.sessionId,
        filename: d.filename,
        mimeType: d.mimeType,
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
    // Single ownership-checked delete: join doc → session to confirm user owns it
    const [doc] = await db
      .select({ id: documentsTable.id, sessionId: documentsTable.sessionId })
      .from(documentsTable)
      .innerJoin(
        studySessionsTable,
        eq(documentsTable.sessionId, studySessionsTable.id)
      )
      .where(
        and(
          eq(documentsTable.id, docId),
          eq(studySessionsTable.userId, req.user!.id)
        )
      )
      .limit(1);

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

export default router;
