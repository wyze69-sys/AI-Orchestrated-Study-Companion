import express from "express";
import cors from "cors";
import multer from "multer";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimit } from "./middlewares/rate-limit";
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
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 6e4, max: 100 }));
app.use("/api/auth", rateLimit({ windowMs: 6e4, max: 10, message: "Too many auth attempts, try again later." }));
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
