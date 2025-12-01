import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { generateDemoContract } from "../ia/contracts.service";
import { listOffers, listTrades } from "../services/market.service";

const router = Router();

router.get("/offers", authRequired, (req: AuthRequest, res) => {
  res.json({ items: listOffers("trueqia"), user: req.user });
});

router.get("/trades", authRequired, (_req, res) => {
  res.json({ items: listTrades() });
});

router.post("/contracts/preview", authRequired, (req: AuthRequest, res) => {
  const text = generateDemoContract(req.body);
  res.json({ contractText: text });
});

export default router;
