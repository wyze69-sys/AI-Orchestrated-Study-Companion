import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import sessionsRouter from "./sessions";
import documentsRouter from "./documents";
import chatRouter from "./chat";
import dashboardRouter from "./dashboard";
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
