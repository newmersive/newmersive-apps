import { Router, Request, Response } from "express";
import {
  listTrueqiaOffers,
  createTrueqiaOffer,
  createTrade,
  acceptTrade,
  rejectTrade,
  generateContractPreview,
  listTradesForUser,
} from "../services/trueqia.service";
import { authRequired } from "../middleware/auth.middleware";

const router = Router();

router.get("/offers", authRequired, async (req: Request, res: Response) => {
  try {
    const excludeMine = req.query.excludeMine === "true" || req.query.excludeMine === "1";
    const userId = (req as any).user?.id as string | undefined;
    const offers = await listTrueqiaOffers(excludeMine ? userId : undefined);
    res.json({ items: offers });
  } catch (err) {
    console.error("Error in GET /trueqia/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/offers", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const { title, description, tokens, meta, isUnique } = req.body as {
      title?: string;
      description?: string;
      tokens?: number;
      meta?: Record<string, unknown>;
      isUnique?: boolean;
    };

    if (!userId || !title || !description || typeof tokens !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const offer = await createTrueqiaOffer(userId, title, description, tokens, meta, Boolean(isUnique));
    res.status(201).json(offer);
  } catch (err) {
    console.error("Error in POST /trueqia/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/trades", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const trades = await listTradesForUser(userId);
    res.json({ items: trades });
  } catch (err) {
    console.error("Error in GET /trueqia/trades:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades", authRequired, async (req: Request, res: Response) => {
  try {
    const fromUserId = (req as any).user?.id as string | undefined;
    const { toUserId, offerId, tokens } = req.body as {
      toUserId?: string;
      offerId?: string;
      tokens?: number;
    };

    if (!fromUserId || !toUserId || !offerId) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const trade = await createTrade(fromUserId, toUserId, offerId, typeof tokens === "number" ? tokens : undefined);
    res.status(201).json(trade);
  } catch (err: any) {
    if (err instanceof Error) {
      if (err.message === "INVALID_TOKEN_AMOUNT") return void res.status(400).json({ error: "INVALID_TOKEN_AMOUNT" });
      if (err.message === "OFFER_NOT_FOUND") return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
      if (err.message === "OFFER_ALREADY_CLAIMED") return void res.status(409).json({ error: "OFFER_ALREADY_CLAIMED" });
    }
    console.error("Error in POST /trueqia/trades:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/accept", authRequired, async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.id;
    const trade = await acceptTrade(tradeId);
    res.json(trade);
  } catch (err: any) {
    if (err instanceof Error) {
      if (err.message === "TRADE_NOT_FOUND") return void res.status(404).json({ error: "TRADE_NOT_FOUND" });
      if (err.message === "INSUFFICIENT_TOKENS") return void res.status(400).json({ error: "INSUFFICIENT_TOKENS" });
      if (err.message === "OFFER_ALREADY_CLAIMED") return void res.status(409).json({ error: "OFFER_ALREADY_CLAIMED" });
      if (err.message === "OFFER_NOT_FOUND") return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
    }
    console.error("Error in accept trade:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/reject", authRequired, async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.id;
    const trade = await rejectTrade(tradeId);
    res.json(trade);
  } catch (err: any) {
    if (err instanceof Error && err.message === "TRADE_NOT_FOUND") {
      res.status(404).json({ error: "TRADE_NOT_FOUND" });
      return;
    }
    console.error("Error in reject trade:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/contracts/preview", authRequired, async (req: Request, res: Response) => {
  try {
    const { offerTitle, requesterName, providerName, tokens } = req.body as {
      offerTitle?: string;
      requesterName?: string;
      providerName?: string;
      tokens?: number;
    };

    if (!offerTitle || !requesterName || !providerName || typeof tokens !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const contract = await generateContractPreview({ offerTitle, requesterName, providerName, tokens });
    res.status(201).json(contract);
  } catch (err) {
    console.error("Error in preview contract:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
