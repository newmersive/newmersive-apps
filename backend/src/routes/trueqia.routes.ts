import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { generateDemoContract } from "../ia/contracts.service";
import {
  acceptTrade,
  createTrade,
  createTrueqiaOffer,
  listTrueqiaOffers,
  rejectTrade,
} from "../services/trueqia.service";

const router = Router();

router.get("/offers", authRequired, (req: AuthRequest, res) => {
  const excludeMine = req.query.excludeMine === "true";
  const items = listTrueqiaOffers({
    excludeUserId: excludeMine ? req.user?.id : undefined,
  });
  res.json({ items, user: req.user });
});

router.post("/offers", authRequired, (req: AuthRequest, res) => {
  const { title, description, tokens, meta } = req.body as any;

  if (!title || !description || typeof tokens !== "number") {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  const offer = createTrueqiaOffer({
    title,
    description,
    tokens,
    meta,
    ownerUserId: req.user!.id,
  });

  res.status(201).json({ offer });
});

router.post("/trades", authRequired, (req: AuthRequest, res) => {
  const { offerId, toUserId, tokens } = req.body as any;
  const fromUserId = req.user!.id;

  if (!offerId || !toUserId || typeof tokens !== "number") {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const trade = createTrade({ offerId, fromUserId, toUserId, tokens });
    res.status(201).json({ trade });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVALID_TOKENS") {
      return res.status(400).json({ error: "INVALID_TOKENS" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/accept", authRequired, (req: AuthRequest, res) => {
  try {
    const trade = acceptTrade(req.params.id, req.user!.id);
    res.json({ trade });
  } catch (err: unknown) {
    return handleTradeError(err, res);
  }
});

router.post("/trades/:id/reject", authRequired, (req: AuthRequest, res) => {
  try {
    const trade = rejectTrade(req.params.id, req.user!.id);
    res.json({ trade });
  } catch (err: unknown) {
    return handleTradeError(err, res);
  }
});

router.post("/contracts/preview", authRequired, (req: AuthRequest, res) => {
  const text = generateDemoContract(req.body);
  res.json({ contractText: text });
});

function handleTradeError(err: unknown, res: any) {
  if (!(err instanceof Error)) return res.status(500).json({ error: "INTERNAL_ERROR" });

  if (err.message === "TRADE_NOT_FOUND") {
    return res.status(404).json({ error: "TRADE_NOT_FOUND" });
  }

  if (err.message === "TRADE_NOT_PENDING") {
    return res.status(400).json({ error: "TRADE_NOT_PENDING" });
  }

  if (err.message === "NOT_PARTICIPANT") {
    return res.status(403).json({ error: "NOT_PARTICIPANT" });
  }

  if (err.message === "INSUFFICIENT_TOKENS") {
    return res.status(400).json({ error: "INSUFFICIENT_TOKENS" });
  }

  return res.status(500).json({ error: "INTERNAL_ERROR" });
}

export default router;
