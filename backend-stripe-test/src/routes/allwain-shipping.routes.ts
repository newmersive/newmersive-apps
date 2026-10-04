import { Router, type Request, type Response } from "express";
import { authRequired } from "../middleware/auth.middleware";
import {
  createAllwainCarrierQuotes,
  createAllwainCarrierShipment,
  getAllwainCarrierShipment,
  getAllwainShippingConfig,
  processAllwainSendcloudWebhook,
} from "../services/allwain-shipping.service";

const router = Router();

function userId(req: Request) {
  return (req as any).user?.id as string | undefined;
}

function shippingError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "SHIPPING_ERROR";
  if (code === "INVALID_SENDCLOUD_SIGNATURE") {
    return res.status(401).json({ error: code });
  }
  if (code === "OFFER_NOT_FOUND" || code === "CARRIER_QUOTE_NOT_FOUND" || code === "ORDER_NOT_FOUND") {
    return res.status(404).json({ error: code });
  }
  if (code === "FORBIDDEN") return res.status(403).json({ error: code });
  if (
    [
      "CANNOT_ACCEPT_OWN_OFFER",
      "OFFER_NOT_AVAILABLE",
      "DEMO_OFFER_READ_ONLY",
      "CARRIER_QUOTE_ALREADY_USED",
      "CARRIER_QUOTE_EXPIRED",
      "CARRIER_QUOTE_MISMATCH",
      "ORDER_NOT_CARRIER_DELIVERY",
      "ORDER_NOT_PAID",
      "ORDER_NOT_READY",
      "SHIPMENT_CREATE_CONFLICT",
    ].includes(code)
  ) {
    return res.status(409).json({ error: code });
  }
  if (
    [
      "INVALID_ORDER_QUANTITY",
      "MINIMUM_ORDER_NOT_MET",
      "MAXIMUM_ORDER_EXCEEDED",
      "INVALID_QUANTITY_STEP",
      "INSUFFICIENT_STOCK",
      "CARRIER_ADDRESS_REQUIRED",
      "CARRIER_POSTAL_CODE_REQUIRED",
      "CARRIER_CITY_REQUIRED",
      "INVALID_CARRIER_COUNTRY",
      "INVALID_CARRIER_PHONE",
      "CARRIER_WEIGHT_REQUIRED",
      "SELLER_CARRIER_ADDRESS_REQUIRED",
      "SENDCLOUD_INTERNATIONAL_NOT_READY",
      "INVALID_SENDCLOUD_PAYLOAD",
    ].includes(code)
  ) {
    return res.status(400).json({ error: code });
  }
  if (code === "SENDCLOUD_NOT_CONFIGURED" || code === "SHIPPING_REQUIRES_POSTGRES") {
    return res.status(503).json({ error: code });
  }
  if (
    [
      "SENDCLOUD_AUTH_FAILED",
      "SENDCLOUD_REQUEST_REJECTED",
      "SENDCLOUD_REQUEST_FAILED",
      "SENDCLOUD_TIMEOUT",
      "SENDCLOUD_NO_SHIPPING_OPTIONS",
    ].includes(code)
  ) {
    return res.status(502).json({ error: code });
  }
  console.error("ALLWAIN_SHIPPING_ERROR", error);
  return res.status(500).json({ error: "SHIPPING_ERROR" });
}

router.get("/config", (_req, res) => res.json(getAllwainShippingConfig()));

router.post("/quotes", authRequired, async (req, res) => {
  try {
    const currentUserId = userId(req);
    if (!currentUserId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await createAllwainCarrierQuotes(currentUserId, {
      offerId: req.body?.offerId,
      quantity: Number(req.body?.quantity),
      addressLine1: req.body?.addressLine1,
      postalCode: req.body?.postalCode,
      city: req.body?.city,
      countryCode: req.body?.countryCode,
      phone: req.body?.phone,
    });
    res.json(result);
  } catch (error) {
    shippingError(error, res);
  }
});

router.get("/orders/:id", authRequired, async (req, res) => {
  try {
    const currentUserId = userId(req);
    if (!currentUserId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json({ shipment: await getAllwainCarrierShipment(currentUserId, req.params.id) });
  } catch (error) {
    shippingError(error, res);
  }
});

router.post("/orders/:id/shipments", authRequired, async (req, res) => {
  try {
    const currentUserId = userId(req);
    if (!currentUserId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.status(201).json({
      shipment: await createAllwainCarrierShipment(currentUserId, req.params.id),
    });
  } catch (error) {
    shippingError(error, res);
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) return void res.status(400).json({ error: "RAW_BODY_REQUIRED" });
    const result = await processAllwainSendcloudWebhook(
      rawBody,
      req.headers["sendcloud-signature"],
    );
    res.json({ received: true, ...result });
  } catch (error) {
    shippingError(error, res);
  }
});

export default router;
