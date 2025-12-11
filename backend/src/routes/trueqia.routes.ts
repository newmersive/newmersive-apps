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

/* =========================
   GET /trueqia/offers
========================= */

router.get(
  "/offers",
  authRequired,
  (req: Request, res: Response): void => {
    try {
      const excludeMine =
        req.query.excludeMine === "true" ||
        req.query.excludeMine === "1";

      const userId = (req as any).user?.id as string | undefined;

      const offers = listTrueqiaOffers(
        excludeMine ? userId : undefined
      );

      res.json({ items: offers });
    } catch (err) {
      console.error("Error in GET /trueqia/offers:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /trueqia/offers
========================= */

router.post(
  "/offers",
  authRequired,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { title, description, tokens, meta } = req.body as {
        title?: string;
        description?: string;
        tokens?: number;
        meta?: Record<string, unknown>;
      };

      if (!userId || !title || !description || typeof tokens !== "number") {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const offer = createTrueqiaOffer(
        userId,
        title,
        description,
        tokens,
        meta
      );

      res.status(201).json(offer);
    } catch (err) {
      console.error("Error in POST /trueqia/offers:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   GET /trueqia/trades
========================= */

router.get(
  "/trades",
  authRequired,
  (req: Request, res: Response): void => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      const trades = listTradesForUser(userId);
      res.json({ items: trades });
    } catch (err) {
      console.error("Error in GET /trueqia/trades:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /trueqia/trades
========================= */

router.post(
  "/trades",
  authRequired,
  (req: Request, res: Response): void => {
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

      const trade = createTrade(
        fromUserId,
        toUserId,
        offerId,
        typeof tokens === "number" ? tokens : undefined
      );

      res.status(201).json(trade);
    } catch (err: any) {
      if (err instanceof Error && err.message === "INVALID_TOKEN_AMOUNT") {
        res.status(400).json({ error: "INVALID_TOKEN_AMOUNT" });
        return;
      }

      console.error("Error in POST /trueqia/trades:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /trueqia/trades/:id/accept
========================= */

router.post(
  "/trades/:id/accept",
  authRequired,
  (req: Request, res: Response): void => {
    try {
      const tradeId = req.params.id;
      const trade = acceptTrade(tradeId);
      res.json(trade);
    } catch (err: any) {
      if (err instanceof Error) {
        if (err.message === "TRADE_NOT_FOUND") {
          res.status(404).json({ error: "TRADE_NOT_FOUND" });
          return;
        }
        if (err.message === "INSUFFICIENT_TOKENS") {
          res.status(400).json({ error: "INSUFFICIENT_TOKENS" });
          return;
        }
      }

      console.error("Error in accept trade:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /trueqia/trades/:id/reject
========================= */

router.post(
  "/trades/:id/reject",
  authRequired,
  (req: Request, res: Response): void => {
    try {
      const tradeId = req.params.id;
      const trade = rejectTrade(tradeId);
      res.json(trade);
    } catch (err: any) {
      if (err instanceof Error && err.message === "TRADE_NOT_FOUND") {
        res.status(404).json({ error: "TRADE_NOT_FOUND" });
        return;
      }

      console.error("Error in reject trade:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /trueqia/contracts/preview
========================= */

router.post(
  "/contracts/preview",
  authRequired,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerTitle, requesterName, providerName, tokens } =
        req.body as {
          offerTitle?: string;
          requesterName?: string;
          providerName?: string;
          tokens?: number;
        };

      if (
        !offerTitle ||
        !requesterName ||
        !providerName ||
        typeof tokens !== "number"
      ) {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const contract = await generateContractPreview({
        offerTitle,
        requesterName,
        providerName,
        tokens,
      });

      res.status(201).json(contract);
    } catch (err) {
      console.error("Error in preview contract:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
