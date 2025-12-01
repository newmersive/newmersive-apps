import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
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

export default router;
