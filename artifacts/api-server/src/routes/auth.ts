import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getJwtSecret } from "../middlewares/auth";

const router = Router();
const JWT_EXPIRES_IN = "7d";

router.post("/auth/register", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();

    const [user] = await db
      .insert(usersTable)
      .values({ id, email: email.toLowerCase(), passwordHash })
      .returning();

    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
