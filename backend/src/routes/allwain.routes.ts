import { Router, Request, Response } from "express";
import {
  scanDemoProduct,
  listAllwainOffers,
  createAllwainOffer,
  listOrderGroups,
  createOrderGroup,
  joinOrderGroup,
  registerSaving,
  getSponsorSummary,
} from "../services/allwain.service";
import { authRequired } from "../middleware/auth.middleware";

const router = Router();

/* =========================
   GET /allwain/scan-demo
========================= */

router.get("/scan-demo", authRequired, async (req: Request, res: Response) => {
  try {
    const { ean } = req.query as { ean?: string };
    const result = await scanDemoProduct(ean);
    res.json(result);
  } catch (err) {
    console.error("Error in GET /allwain/scan-demo:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /allwain/offers
========================= */

router.get("/offers", authRequired, async (req: Request, res: Response) => {
  try {
    const offers = await listAllwainOffers();
    res.json({ items: offers });
  } catch (err) {
    console.error("Error in GET /allwain/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   POST /allwain/offers
========================= */

router.post("/offers", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const { title, description, price, productId, meta } = req.body as {
      title?: string;
      description?: string;
      price?: number;
      productId?: string;
      meta?: Record<string, unknown>;
    };

    if (!userId || !title || !description || typeof price !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const offer = await createAllwainOffer(
      userId,
      title,
      description,
      price,
      productId,
      meta
    );

    res.status(201).json(offer);
  } catch (err) {
    console.error("Error in POST /allwain/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /allwain/order-groups
========================= */

router.get("/order-groups", authRequired, async (req: Request, res: Response) => {
  try {
    const groups = await listOrderGroups();
    res.json({ items: groups });
  } catch (err) {
    console.error("Error in GET /allwain/order-groups:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   POST /allwain/order-groups
========================= */

router.post("/order-groups", authRequired, async (req: Request, res: Response) => {
  try {
    const { productId, minUnitsPerClient } = req.body as {
      productId?: string;
      minUnitsPerClient?: number;
    };

    if (!productId || typeof minUnitsPerClient !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const group = await createOrderGroup(productId, minUnitsPerClient);
    res.status(201).json(group);
  } catch (err) {
    console.error("Error in POST /allwain/order-groups:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   POST /allwain/order-groups/:id/join
========================= */

router.post(
  "/order-groups/:id/join",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { units } = req.body as { units?: number };
      const groupId = req.params.id;

      if (!userId || typeof units !== "number") {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const group = await joinOrderGroup(groupId, userId, units);
      res.json(group);
    } catch (err: any) {
      if (err instanceof Error && err.message === "GROUP_NOT_FOUND") {
        res.status(404).json({ error: "GROUP_NOT_FOUND" });
        return;
      }

      console.error("Error in join order group:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   POST /allwain/savings
========================= */

router.post("/savings", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const { amount } = req.body as { amount?: number };

    if (!userId || typeof amount !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const result = await registerSaving(userId, amount);
    res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    console.error("Error in POST /allwain/savings:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GET /allwain/sponsors/summary
========================= */

router.get(
  "/sponsors/summary",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const summary = await getSponsorSummary(userId);
      res.json(summary);
    } catch (err) {
      console.error("Error in GET /allwain/sponsors/summary:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
