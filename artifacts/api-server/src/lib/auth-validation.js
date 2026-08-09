const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 1024;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return null;
  if (/\s/.test(value)) return null;
  if (!EMAIL_RE.test(value)) return null;
  const [local] = value.split("@");
  if (local.length > 64) return null;
  return value;
}

export function validateAuthInput(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Email and password are required" };
  }
  const email = normalizeEmail(body.email);
  if (!email) {
    return { ok: false, error: "A valid email address is required" };
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: "Password is too long" };
  }
  return { ok: true, email, password };
}