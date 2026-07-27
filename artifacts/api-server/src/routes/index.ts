import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(syncRouter);

export default router;
