import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const JWT_SECRET_MIN_LENGTH = 64;
const JWT_ALGORITHMS = ["HS256"];

function getJwtSecret() {
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

function validPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof payload.id === "string" &&
      payload.id.length > 0 &&
      typeof payload.email === "string"
  );
}

async function verifyUserToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), { algorithms: JWT_ALGORITHMS });
  if (!validPayload(payload)) {
    throw new Error("Unexpected token payload shape");
  }
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, payload.id))
    .limit(1);
  if (!row) {
    throw new Error("User no longer exists");
  }
  return payload;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  let user;
  try {
    user = await verifyUserToken(token);
  } catch (err) {
    req.log?.info({ err }, "Token rejected");
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = user;
  next();
}

export {
  getJwtSecret,
  requireAuth,
  verifyUserToken
};