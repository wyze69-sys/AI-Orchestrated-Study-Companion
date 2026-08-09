import express from "express";
import cors from "cors";
import multer from "multer";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger";
import { rateLimit } from "./middlewares/rate-limit.js";
import { registerRateLimitTestResetRoute } from "./middlewares/rate-limit-test-reset.js";

function resolveCorsOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !raw.trim()) return null; // dev default: reflect request origin
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsOrigin(origin, callback) {
  const allowlist = resolveCorsOrigins();
  if (!origin || !allowlist) {
    callback(null, true);
    return;
  }
  if (allowlist.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin ${origin} is not allowed by CORS`));
}

const app = express();
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0]
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    }
  })
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (_req.path.startsWith("/api/auth")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.use(cors({ credentials: true, origin: corsOrigin }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(rateLimit({ scope: "global", windowMs: 6e4, max: 100 }));
app.use("/api/auth/login", rateLimit({ scope: "auth-attempt", windowMs: 6e4, max: 10, message: "Too many auth attempts, try again later." }));
app.use("/api/auth/register", rateLimit({ scope: "auth-attempt", windowMs: 6e4, max: 10, message: "Too many auth attempts, try again later." }));

registerRateLimitTestResetRoute(app);
app.use("/api", router);
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "File is too large. Maximum size is 5 MB.",
      LIMIT_FILE_COUNT: "Too many files. Only one file is allowed per upload.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field."
    };
    res.status(400).json({ error: messages[err.code] ?? err.message });
    return;
  }
  if (err instanceof Error && err.message.includes("Only")) {
    res.status(400).json({ error: err.message });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});
var stdin_default = app;
export {
  stdin_default as default
};
