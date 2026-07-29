import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import syncRouter from "./sync";
import tempoVideosRouter from "./tempoVideos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(syncRouter);
router.use(tempoVideosRouter);

export default router;
