import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { getSponsorSummary, registerAllwainSaving } from "../services/allwain.service";
import { listOffers } from "../services/market.service";

const router = Router();

router.get("/scan-demo", authRequired, (req: AuthRequest, res) => {
  res.json({
    result: "Etiqueta leída",
    productName: "Café molido",
    suggestions: ["Tienda A", "Tienda B"],
    user: req.user?.email,
  });
});

router.get("/offers", authRequired, (_req, res) => {
  res.json({ items: listOffers("allwain") });
});

router.post("/savings", authRequired, (req: AuthRequest, res) => {
  const amount = Number(req.body?.amount ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "El ahorro debe ser mayor que 0",
    });
  }

  try {
    const result = registerAllwainSaving(req.user!.id, amount);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message ?? "ERROR" });
  }
});

router.get("/sponsors/summary", authRequired, (req: AuthRequest, res) => {
  const summary = getSponsorSummary(req.user!.id);
  res.json(summary);
});

export default router;
