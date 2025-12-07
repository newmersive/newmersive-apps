import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import {
  createAllwainOffer,
  createOfferInterest,
  createOrderGroup,
  getAllwainProductByEan,
  getAllwainProductById,
  joinOrderGroup,
  listAllwainOffers,
  listOrderGroups,
} from "../services/allwain.service";

const router = Router();

router.get("/scan-demo", authRequired, (req: AuthRequest, res) => {
  res.json({
    result: "Etiqueta leída",
    productName: "Café molido",
    suggestions: ["Tienda A", "Tienda B"],
    user: req.user?.email,
  });
});

router.get("/products/:id", authRequired, (req: AuthRequest, res) => {
  const product = getAllwainProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  }
  res.json({ product });
});

router.get("/products", authRequired, (req: AuthRequest, res) => {
  const ean = req.query.ean as string | undefined;
  if (!ean) {
    return res.status(400).json({ error: "EAN_REQUIRED" });
  }

  const product = getAllwainProductByEan(ean);
  if (!product) {
    return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  }

  res.json({ product });
});

router.get("/offers", authRequired, (req: AuthRequest, res) => {
  const hasLocation = req.query.lat && req.query.lng;
  const location = hasLocation
    ? {
        lat: Number(req.query.lat),
        lng: Number(req.query.lng),
      }
    : undefined;

  const items = listAllwainOffers(location);
  res.json({ items });
});

router.post("/offers", authRequired, (req: AuthRequest, res) => {
  const { title, description, price, tokens, productId, meta } = req.body as any;

  if (!title || !description) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  const offer = createAllwainOffer({
    title,
    description,
    price,
    tokens,
    productId,
    meta,
    ownerUserId: req.user!.id,
  });

  res.status(201).json({ offer });
});

router.post(
  "/offers/:id/interest",
  authRequired,
  (req: AuthRequest, res) => {
    try {
      const lead = createOfferInterest(req.params.id, req.user!, req.body?.message);
      res.status(201).json({ lead });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "OFFER_NOT_FOUND") {
        return res.status(404).json({ error: "OFFER_NOT_FOUND" });
      }
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.get("/order-groups", authRequired, (_req, res) => {
  res.json({ items: listOrderGroups() });
});

router.post("/order-groups", authRequired, (req: AuthRequest, res) => {
  const { productId, totalUnits, minUnitsPerClient } = req.body as any;

  if (!productId || typeof totalUnits !== "number" || typeof minUnitsPerClient !== "number") {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  if (totalUnits <= 0 || minUnitsPerClient <= 0) {
    return res.status(400).json({ error: "INVALID_UNITS" });
  }

  try {
    const orderGroup = createOrderGroup({ productId, totalUnits, minUnitsPerClient });
    res.status(201).json({ orderGroup });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "PRODUCT_NOT_FOUND") {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post(
  "/order-groups/:id/join",
  authRequired,
  (req: AuthRequest, res) => {
    const { units } = req.body as any;
    if (typeof units !== "number" || units <= 0) {
      return res.status(400).json({ error: "INVALID_UNITS" });
    }

    try {
      const orderGroup = joinOrderGroup(req.params.id, {
        userId: req.user!.id,
        units,
      });
      res.json({ orderGroup });
    } catch (err: unknown) {
      if (!(err instanceof Error)) {
        return res.status(500).json({ error: "INTERNAL_ERROR" });
      }

      if (err.message === "ORDER_GROUP_NOT_FOUND") {
        return res.status(404).json({ error: "ORDER_GROUP_NOT_FOUND" });
      }
      if (err.message === "ORDER_GROUP_CLOSED") {
        return res.status(400).json({ error: "ORDER_GROUP_CLOSED" });
      }
      if (err.message === "MIN_UNITS_NOT_MET") {
        return res.status(400).json({ error: "MIN_UNITS_NOT_MET" });
      }
      if (err.message === "ORDER_GROUP_FULL") {
        return res.status(400).json({ error: "ORDER_GROUP_FULL" });
      }

      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
