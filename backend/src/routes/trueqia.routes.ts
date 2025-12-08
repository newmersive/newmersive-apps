import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import {
  createContractDemo,
  createOffer,
  createTrade,
  listOffers,
  listTrades,
} from "../services/trueqia.service";

const router = Router();

router.get("/offers", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const items = await listOffers(req.user!.id);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/offers", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { title, description, tokens } = req.body || {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "INVALID_TITLE", message: "title es obligatorio" });
    }
    if (tokens !== undefined && typeof tokens !== "number") {
      return res
        .status(400)
        .json({ error: "INVALID_TOKENS", message: "tokens debe ser numérico" });
    }

    const offer = await createOffer(req.user!.id, { title, description, tokens });
    res.status(201).json(offer);
  } catch (error) {
    next(error);
  }
});

router.get("/trades", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const items = await listTrades(req.user!.id);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/trades", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { title, tokens, offerId } = req.body || {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "INVALID_TITLE", message: "title es obligatorio" });
    }
    if (tokens !== undefined && typeof tokens !== "number") {
      return res
        .status(400)
        .json({ error: "INVALID_TOKENS", message: "tokens debe ser numérico" });
    }
    if (offerId !== undefined && typeof offerId !== "string") {
      return res
        .status(400)
        .json({ error: "INVALID_OFFER", message: "offerId debe ser string" });
    }

    const trade = await createTrade(req.user!.id, { title, tokens, offerId });
    res.status(201).json(trade);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/contracts-demo",
  authRequired,
  async (req: AuthRequest, res, next) => {
    try {
      const { tradeId } = req.body || {};
      if (!tradeId || typeof tradeId !== "string") {
        return res
          .status(400)
          .json({ error: "INVALID_TRADE", message: "tradeId es obligatorio" });
      }

      const contract = await createContractDemo(tradeId);
      res.status(201).json(contract);
    } catch (error) {
      if (error instanceof Error && error.message === "TRADE_NOT_FOUND") {
        return res.status(404).json({ error: "TRADE_NOT_FOUND" });
      }
      next(error);
    }
  }
);

export default router;
