import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { usersTable, studySessionsTable, documentsTable, messagesTable, quizResultsTable, flashcardProgressTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getJwtSecret, requireAuth } from "../middlewares/auth";
import { validateAuthInput } from "../lib/auth-validation.js";
const router = Router();
const JWT_EXPIRES_IN = "7d";

// Fixed-cost comparison target so a missing account does not return measurably
// faster than one that exists (reduces account-enumeration timing signals).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 12);
router.post("/auth/register", async (req, res) => {
  const validation = validateAuthInput(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }
  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, validation.email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await bcrypt.hash(validation.password, 12);
    const id = randomUUID();
    const [user] = await db.insert(usersTable).values({ id, email: validation.email, passwordHash }).returning();
    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN
    });
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt }
    });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.post("/auth/login", async (req, res) => {
  const validation = validateAuthInput(req.body);
  if (!validation.ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, validation.email)).limit(1);
    const valid = await bcrypt.compare(validation.password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN
    });
    res.json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt }
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});
router.delete("/auth/me", requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    await db.transaction(async (tx) => {
      const sessions = await tx
        .select({ id: studySessionsTable.id })
        .from(studySessionsTable)
        .where(eq(studySessionsTable.userId, userId));
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        await tx.delete(messagesTable).where(inArray(messagesTable.sessionId, sessionIds));
        await tx.delete(documentsTable).where(inArray(documentsTable.sessionId, sessionIds));
        await tx.delete(quizResultsTable).where(eq(quizResultsTable.userId, userId));
        await tx.delete(flashcardProgressTable).where(eq(flashcardProgressTable.userId, userId));
        await tx.delete(studySessionsTable).where(eq(studySessionsTable.userId, userId));
      }
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });
    res.json({ success: true, message: "Account deleted" });
  } catch (err) {
    req.log.error({ err }, "Delete account error");
    res.status(500).json({ error: "Internal server error" });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
