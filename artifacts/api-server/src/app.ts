import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimit } from "./middlewares/rate-limit";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limit: 100 requests per minute per IP
app.use(rateLimit({ windowMs: 60_000, max: 100 }));

// Stricter rate limit on auth endpoints (10 attempts per minute)
app.use("/api/auth", rateLimit({ windowMs: 60_000, max: 10, message: "Too many auth attempts, try again later." }));

app.use("/api", router);

// --------------------------------------------------------------------------
// Global error handler — catches Multer errors and unexpected exceptions
// --------------------------------------------------------------------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Multer-specific errors (file too large, wrong type, etc.)
  if (err instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: "File is too large. Maximum size is 5 MB.",
      LIMIT_FILE_COUNT: "Too many files. Only one file is allowed per upload.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
    };
    res.status(400).json({ error: messages[err.code] ?? err.message });
    return;
  }

  // Errors thrown by our multer fileFilter (e.g. "Only .txt and .md files are allowed")
  if (err instanceof Error && err.message.includes("Only")) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Fallback: unexpected server error
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
