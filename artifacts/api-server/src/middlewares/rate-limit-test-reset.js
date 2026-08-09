import { resetRateLimits } from "./rate-limit.js";

function registerRateLimitTestResetRoute(app) {
  if (process.env.NODE_ENV !== "test") return;

  app.post("/api/test/reset-rate-limits", (_req, res) => {
    resetRateLimits();
    res.json({ success: true, message: "Rate limit stores cleared" });
  });
}

export { registerRateLimitTestResetRoute };
