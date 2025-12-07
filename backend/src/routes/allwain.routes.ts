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
} from "../services/allwain.service";
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
  co

