import jwt from "jsonwebtoken";
const JWT_SECRET_MIN_LENGTH = 64;
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
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
export {
  getJwtSecret,
  requireAuth
};
