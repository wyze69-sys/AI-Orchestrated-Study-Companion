import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET_MIN_LENGTH = 64;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required but not set.");
  }
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters long for adequate security (got ${secret.length}).`
    );
  }
  return secret;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
