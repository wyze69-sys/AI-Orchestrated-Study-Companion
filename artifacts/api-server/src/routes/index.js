import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import sessionsRouter from "./sessions.js";
import documentsRouter from "./documents.js";
import chatRouter from "./chat.js";
import dashboardRouter from "./dashboard.js";
const router = Router();
router.use(healthRouter);
router.use(authRouter);
router.use(sessionsRouter);
router.use(documentsRouter);
router.use(chatRouter);
router.use(dashboardRouter);
var stdin_default = router;
export {
  stdin_default as default
};
