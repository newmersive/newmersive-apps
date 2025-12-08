import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import {
  createAllwainOffer,
  createOfferInterest,
  createOrderGroup,
  getAllwainProductByEan,
  getAllwainProductById,
  joinOrderGroup,
  listOrderGroups,
  listAllwainOffers,
  getSponsorSummary,
  registerAllwainSaving,
} from "../services/allwain.service";
import { scanProductImage } from "../services/scan.service";

const router = Router();

/**
 * Demo de escaneo Allwain (flujo inicial / demo)
 */
router.get("/scan-demo", authRequired, async (_req: AuthRequest, res) => {
  const scanDemo = await scanProductImage({ provider: "mock" });

  res.json({
    product: scanDemo.product,
    offers: scanDemo.rawData?.offers ?? [],
    message: scanDemo.rawData?.message ?? "Demo de escaneo Allwain",
  });
});

/**
 * Productos por ID
 */
router.get("/products/:id", authRequired, (req: AuthRequest, res) => {
  const product = getAllwainProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  }
  res.json({ product });
});

/**
 * Productos por EAN
 */
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

/**
 * Ofertas Allwain (filtro por localización opcional)
 */
router.get("/offers", authRequired, (req: AuthRequest, res) => {
  const hasLatLng = req.query.lat !== undefined || req.query.lng !== undefined;
  const rawLocation = (req.query.location as string | undefined)?.split(",");

  let location: { lat: number; lng: number } | undefined;

  if (hasLatLng) {
    if (req.query.lat === undefined || req.query.lng === undefined) {
      return res.status(400).json({ error: "INVALID_LOCATION" });
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "INVALID_LOCATION" });
    }

    location = { lat, lng };
  } else if (rawLocation?.length === 2) {
    const [latStr, lngStr] = rawLocation;
    const lat = Number(latStr);
    const lng = Number(lngStr);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "INVALID_LOCATION" });
    }

    location = { lat, lng };
  }

  const items = listAllwainOffers(location);
  res.json({ items });
});

/**
 * Crear oferta Allwain
 */
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

/**
 * Marcar interés en una oferta (lead)
 */
router.post("/offers/:id/interest", authRequired, (req: AuthRequest, res) => {
  try {
    const lead = createOfferInterest(
      req.params.id,
      req.user!.id,
      (req.body as any)?.message
    );
    res.status(201).json({ lead });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "OFFER_NOT_FOUND") {
      return res.status(404).json({ error: "OFFER_NOT_FOUND" });
    }
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * Grupos de pedido (pedidos agrupados Allwain)
 */
router.get("/order-groups", authRequired, (_req, res) => {
  res.json({ items: listOrderGroups() });
});

router.post("/order-groups", authRequired, (req: AuthRequest, res) => {
  const { productId, totalUnits, minUnitsPerClient } = req.body as any;

  if (
    !productId ||
    typeof totalUnits !== "number" ||
    typeof minUnitsPerClient !== "number"
  ) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  if (totalUnits <= 0 || minUnitsPerClient <= 0) {
    return res.status(400).json({ error: "INVALID_UNITS" });
  }

  try {
    const orderGroup = createOrderGroup({
      productId,
      totalUnits,
      minUnitsPerClient,
    });
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

/**
 * Sistema de ahorro / sponsors Allwain
 * - /savings: registrar ahorro de un usuario (base para cálculo de comisión)
 * - /sponsors/summary: resumen de ganancias por invitaciones
 */

router.post("/savings", authRequired, (req: AuthRequest, res) => {
  const amount = Number((req.body as any)?.amount ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "El ahorro debe ser mayor que 0",
    });
  }

  try {
    const result = registerAllwainSaving(req.user!.id, amount);
    res.status(201).json(result);
  } catch (error: unknown) {
    const err = error as any;
    res.status(400).json({ error: err?.message ?? "ERROR" });
  }
});

router.get("/sponsors/summary", authRequired, (req: AuthRequest, res) => {
  const summary = getSponsorSummary(req.user!.id);
  res.json(summary);
});

export default router;

