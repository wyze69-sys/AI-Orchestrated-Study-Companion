import { Router } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
const router = Router();
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});
var stdin_default = router;
export {
  stdin_default as default
};
