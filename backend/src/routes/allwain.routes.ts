import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { listOffers } from "../services/market.service";
import { buildAllwainScanDemo } from "../services/allwain-demo.service";

const router = Router();

router.get("/scan-demo", authRequired, (_req: AuthRequest, res) => {
  const scanDemo = buildAllwainScanDemo();

  res.json({
    product: scanDemo.product,
    offers: scanDemo.offers,
    message: scanDemo.message,
  });
});

router.get("/offers", authRequired, (_req, res) => {
  res.json({ items: listOffers("allwain") });
});

export default router;
