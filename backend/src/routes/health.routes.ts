import { Router } from "express";
import { ENV } from "../config/env";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, env: ENV.NODE_ENV }));

export default router;
