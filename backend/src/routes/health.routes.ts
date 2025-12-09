import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /health
 *
 * Endpoint sencillo de estado del backend.
 * Se expone como: GET /api/health
 * (asumiendo que en index.ts se monta con router.use("/health", healthRoutes))
 */
router.get(
  "/",
  (req: Request, res: Response): void => {
    try {
      res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || "development",
      });
    } catch (err) {
      console.error("Error in GET /health:", err);
      res.status(500).json({ status: "error" });
    }
  }
);

export default router;
