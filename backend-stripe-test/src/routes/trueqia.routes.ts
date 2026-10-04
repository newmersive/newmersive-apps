import { Router, Request, Response } from "express";
import {
  createTrade,
  acceptTrade,
  completeTrade,
  rejectTrade,
  generateContractPreview,
  listTradesForUser,
  listTrueqiaChatMessages,
  createTrueqiaChatMessage,
  listTrueqiaTradeChatMessages,
  createTrueqiaTradeChatMessage,
  listTrueqiaContractsForUser,
  listTrueqiaContractTemplates,
  getTrueqiaContract,
  getTrueqiaContractVersions,
  acceptTrueqiaContract,
  exportTrueqiaContractPdf,
} from "../services/trueqia.service";
import { authRequired } from "../middleware/auth.middleware";
import { trueqiaAiRateLimit } from "../middleware/operation-rate-limit.middleware";

import { findTrueqiaOffers, findTrueqiaLocalMatches, getTrueqiaOffer, saveTrueqiaOffer, getTrueqiaProfile, saveTrueqiaProfile, trueqiaMovements, proposeTrueqiaNegotiation, acceptTrueqiaNegotiation, trueqiaIssueAction, trueqiaCancellation, discoverTrueqiaOffers, discoverTrueqiaOffer, discoverTrueqiaProfile } from "../services/trueqia.workspace.service";

import { listTrueqiaNeeds, saveTrueqiaNeed, getTrueqiaNeed, respondTrueqiaNeed } from "../services/trueqia.needs.service";
const router = Router();
const endpoint = (operation: (req: Request) => Promise<unknown>, created = false) => async (req: Request, res: Response) => {
  try { res.status(created ? 201 : 200).json(await operation(req)); }
  catch (error: any) {
    const code = error?.message || "INTERNAL_ERROR";
    const invalid = ["INVALID_FIELDS", "INVALID_TOKEN_AMOUNT", "INVALID_HTTPS_URL"];
    const missing = ["OFFER_NOT_FOUND", "PROFILE_NOT_FOUND", "TRADE_NOT_FOUND", "ISSUE_NOT_FOUND", "CANCELLATION_NOT_FOUND", "NEED_NOT_FOUND", "CONTRACT_NOT_FOUND"];
    const conflicts = ["OFFER_UNIQUENESS_LOCKED", "AGREEMENT_LOCKED", "NEGOTIATION_VERSION_CONFLICT", "CANCELLATION_PENDING", "CANCELLATION_UNAVAILABLE", "INVALID_TRADE_STATUS", "ISSUE_RESOLVED", "RESOLUTION_REQUIRED", "TOO_MANY_OPEN_ISSUES", "ISSUE_MESSAGE_LIMIT", "RESOLUTION_VERSION_CONFLICT", "CANCELLATION_VERSION_CONFLICT", "NEED_CLOSED", "CANNOT_RESPOND_OWN_NEED"];
    const status = invalid.includes(code) ? 400 : missing.includes(code) ? 404 : conflicts.includes(code) ? 409 : 500;
    if (status === 500) console.error("Trueqia workspace error", error);
    res.status(status).json({ error: status === 500 ? "INTERNAL_ERROR" : code });
  }
};
const actor = (req: Request) => String((req as any).user.id);
router.get("/needs", authRequired, endpoint(req => listTrueqiaNeeds(actor(req), req.query)));
router.post("/needs", authRequired, endpoint(req => saveTrueqiaNeed(actor(req), req.body), true));
router.get("/needs/:id", authRequired, endpoint(req => getTrueqiaNeed(actor(req), req.params.id)));
router.patch("/needs/:id", authRequired, endpoint(req => saveTrueqiaNeed(actor(req), req.body, req.params.id)));
router.get("/needs/:id/responses", authRequired, endpoint(async req => ({ items: (await getTrueqiaNeed(actor(req), req.params.id)).responses })));
router.post("/needs/:id/responses", authRequired, endpoint(req => respondTrueqiaNeed(actor(req), req.params.id, req.body), true));
router.get("/discover", endpoint(req => discoverTrueqiaOffers(req.query)));
router.get("/discover/profiles/:userId", endpoint(req => discoverTrueqiaProfile(req.params.userId)));
router.get("/discover/:id", endpoint(req => discoverTrueqiaOffer(req.params.id)));
router.get("/profiles/me", authRequired, endpoint(req => getTrueqiaProfile(actor(req), actor(req))));
router.patch("/profiles/me", authRequired, endpoint(req => saveTrueqiaProfile(actor(req), req.body)));
router.get("/profiles/:userId", authRequired, endpoint(req => getTrueqiaProfile(actor(req), req.params.userId)));
router.get("/matches/local", authRequired, endpoint(req => findTrueqiaLocalMatches(actor(req), req.query)));
router.get("/tokens/movements", authRequired, endpoint(req => trueqiaMovements(actor(req), req.query)));
router.get("/offers/:id", authRequired, endpoint(req => getTrueqiaOffer(actor(req), req.params.id)));
router.patch("/offers/:id", authRequired, endpoint(req => saveTrueqiaOffer(actor(req), req.body, req.params.id)));
router.post("/trades/:id/negotiations", authRequired, endpoint(async req => ({ trade: await proposeTrueqiaNegotiation(actor(req), req.params.id, req.body) })));
router.post("/trades/:id/negotiations/accept", authRequired, endpoint(async req => ({ trade: await acceptTrueqiaNegotiation(actor(req), req.params.id, req.body) })));
router.post("/trades/:id/issues", authRequired, endpoint(async req => ({ trade: await trueqiaIssueAction(actor(req), req.params.id, undefined, "create", req.body) }), true));
router.post("/trades/:id/issues/:issueId/messages", authRequired, endpoint(async req => ({ trade: await trueqiaIssueAction(actor(req), req.params.id, req.params.issueId, "message", req.body) })));
router.post("/trades/:id/issues/:issueId/resolution", authRequired, endpoint(async req => ({ trade: await trueqiaIssueAction(actor(req), req.params.id, req.params.issueId, "resolution", req.body) })));
router.post("/trades/:id/issues/:issueId/resolution/accept", authRequired, endpoint(async req => ({ trade: await trueqiaIssueAction(actor(req), req.params.id, req.params.issueId, "accept", req.body) })));
router.post("/trades/:id/cancellation", authRequired, endpoint(async req => ({ trade: await trueqiaCancellation(actor(req), req.params.id, false, req.body) })));
router.post("/trades/:id/cancellation/decline", authRequired, endpoint(async req => ({ trade: await trueqiaCancellation(actor(req), req.params.id, "decline", req.body) })));
router.post("/trades/:id/cancellation/accept", authRequired, endpoint(async req => ({ trade: await trueqiaCancellation(actor(req), req.params.id, true, req.body) })));


router.get("/offers", authRequired, endpoint(req => findTrueqiaOffers(actor(req), req.query)));
router.post("/offers", authRequired, endpoint(req => saveTrueqiaOffer(actor(req), req.body), true));

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

router.get("/trades/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const trades = await listTradesForUser(userId);
    const trade = trades.find((item: any) => item.id === req.params.id);

    if (!trade) {
      res.status(404).json({ error: "TRADE_NOT_FOUND" });
      return;
    }

    res.json({ trade });
  } catch (err) {
    console.error("Error in GET /trueqia/trades/:id:", err);
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
      if (["NEGOTIATION_PENDING", "CANCELLATION_PENDING", "INVALID_TRADE_STATUS", "AGREEMENT_LOCKED", "NEGOTIATION_VERSION_CONFLICT"].includes(err.message)) return void res.status(409).json({ error: err.message });
      if (err.message === "INVALID_TOKEN_AMOUNT") return void res.status(400).json({ error: "INVALID_TOKEN_AMOUNT" });
      if (err.message === "OFFER_NOT_FOUND") return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
      if (err.message === "OFFER_ALREADY_CLAIMED") return void res.status(409).json({ error: "OFFER_ALREADY_CLAIMED" });
      if (err.message === "CANNOT_TRADE_OWN_OFFER") return void res.status(409).json({ error: "CANNOT_TRADE_OWN_OFFER" });
      if (err.message === "INVALID_OFFER_OWNER") return void res.status(409).json({ error: "INVALID_OFFER_OWNER" });
    }
    console.error("Error in POST /trueqia/trades:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/accept", authRequired, async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.id;
    const actorUserId = (req as any).user?.id as string | undefined;
    if (!actorUserId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const trade = await acceptTrade(tradeId, actorUserId);
    res.json(trade);
  } catch (err: any) {
    if (err instanceof Error) {
      if (["NEGOTIATION_PENDING", "CANCELLATION_PENDING", "INVALID_TRADE_STATUS", "AGREEMENT_LOCKED", "NEGOTIATION_VERSION_CONFLICT"].includes(err.message)) return void res.status(409).json({ error: err.message });
      if (err.message === "TRADE_NOT_FOUND") return void res.status(404).json({ error: "TRADE_NOT_FOUND" });
      if (err.message === "INSUFFICIENT_TOKENS") return void res.status(400).json({ error: "INSUFFICIENT_TOKENS" });
      if (err.message === "OFFER_ALREADY_CLAIMED") return void res.status(409).json({ error: "OFFER_ALREADY_CLAIMED" });
      if (err.message === "OFFER_NOT_FOUND") return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
      if (err.message === "TRADE_ACTION_FORBIDDEN") return void res.status(403).json({ error: "TRADE_ACTION_FORBIDDEN" });
      if (err.message === "INVALID_TRADE_STATUS") return void res.status(409).json({ error: "INVALID_TRADE_STATUS" });
    }
    console.error("Error in accept trade:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/reject", authRequired, async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.id;
    const actorUserId = (req as any).user?.id as string | undefined;
    if (!actorUserId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const trade = await rejectTrade(tradeId, actorUserId);
    res.json(trade);
  } catch (err: any) {
    if (err instanceof Error && err.message === "TRADE_NOT_FOUND") {
      res.status(404).json({ error: "TRADE_NOT_FOUND" });
      return;
    }
    if (err instanceof Error && err.message === "TRADE_ACTION_FORBIDDEN") {
      res.status(403).json({ error: "TRADE_ACTION_FORBIDDEN" });
      return;
    }
    if (err instanceof Error && err.message === "INVALID_TRADE_STATUS") {
      res.status(409).json({ error: "INVALID_TRADE_STATUS" });
      return;
    }
    if (err instanceof Error && err.message === "TRADE_ACTION_FORBIDDEN") {
      res.status(403).json({ error: "TRADE_ACTION_FORBIDDEN" });
      return;
    }
    console.error("Error in reject trade:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/complete", authRequired, async (req: Request, res: Response) => {
  try {
    const actorUserId = (req as any).user?.id as string | undefined;
    if (!actorUserId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const trade = await completeTrade(req.params.id, actorUserId);
    res.json(trade);
  } catch (err: any) {
    if (err instanceof Error) {
      if (["NEGOTIATION_PENDING", "CANCELLATION_PENDING", "INVALID_TRADE_STATUS", "AGREEMENT_LOCKED", "NEGOTIATION_VERSION_CONFLICT"].includes(err.message)) return void res.status(409).json({ error: err.message });
      if (err.message === "TRADE_NOT_FOUND") return void res.status(404).json({ error: "TRADE_NOT_FOUND" });
      if (err.message === "TRADE_ACTION_FORBIDDEN") return void res.status(403).json({ error: "TRADE_ACTION_FORBIDDEN" });
      if (err.message === "INVALID_TRADE_STATUS") return void res.status(409).json({ error: "INVALID_TRADE_STATUS" });
    }
    console.error("Error in complete trade:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/chat/messages", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const items = await listTrueqiaChatMessages(userId);
    res.json({ items });
  } catch (err: any) {
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    console.error("Error in GET /trueqia/chat/messages:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/chat/messages", authRequired, trueqiaAiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const item = await createTrueqiaChatMessage(userId, req.body?.text);
    res.status(201).json(item);
  } catch (err: any) {
    if (err instanceof Error && err.message === "INVALID_CHAT_MESSAGE") {
      res.status(400).json({ error: "INVALID_CHAT_MESSAGE" });
      return;
    }

    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    console.error("Error in POST /trueqia/chat/messages:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/trades/:id/chat/messages", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const items = await listTrueqiaTradeChatMessages(userId, req.params.id);
    res.json({ items });
  } catch (err: any) {
    if (err instanceof Error && err.message === "TRADE_NOT_FOUND") {
      res.status(404).json({ error: "TRADE_NOT_FOUND" });
      return;
    }
    console.error("Error in GET /trueqia/trades/:id/chat/messages:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/trades/:id/chat/messages", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const item = await createTrueqiaTradeChatMessage(userId, req.params.id, req.body?.text);
    res.status(201).json(item);
  } catch (err: any) {
    if (err instanceof Error && err.message === "INVALID_CHAT_MESSAGE") {
      res.status(400).json({ error: "INVALID_CHAT_MESSAGE" });
      return;
    }

    if (err instanceof Error && err.message === "TRADE_NOT_FOUND") {
      res.status(404).json({ error: "TRADE_NOT_FOUND" });
      return;
    }

    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    if (err instanceof Error && err.message === "CHAT_BLOCKED") {
      res.status(409).json({ error: "CHAT_BLOCKED" });
      return;
    }

    console.error("Error in POST /trueqia/trades/:id/chat/messages:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/contracts", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const items = await listTrueqiaContractsForUser(userId);
    res.json({ items });
  } catch (err) {
    console.error("Error in GET /trueqia/contracts:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/contracts/templates", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const items = await listTrueqiaContractTemplates();
    res.json({ items });
  } catch (err) {
    console.error("Error in GET /trueqia/contracts/templates:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/contracts/:id", authRequired, endpoint(req => getTrueqiaContract(actor(req), req.params.id)));
router.get("/contracts/:id/versions", authRequired, endpoint(req => getTrueqiaContractVersions(actor(req), req.params.id)));
router.get("/contracts/:id/pdf", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const pdf = await exportTrueqiaContractPdf(userId, req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
    res.send(pdf.buffer);
  } catch (err: any) {
    if (err instanceof Error && err.message === "CONTRACT_NOT_FOUND") {
      res.status(404).json({ error: "CONTRACT_NOT_FOUND" });
      return;
    }

    console.error("Error in GET /trueqia/contracts/:id/pdf:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/contracts/:id/accept", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const contract = await acceptTrueqiaContract(userId, req.params.id);
    res.json(contract);
  } catch (err: any) {
    if (err instanceof Error) {
      if (["NEGOTIATION_PENDING", "CANCELLATION_PENDING", "INVALID_TRADE_STATUS", "AGREEMENT_LOCKED", "NEGOTIATION_VERSION_CONFLICT"].includes(err.message)) return void res.status(409).json({ error: err.message });
      if (err.message === "CONTRACT_NOT_FOUND") return void res.status(404).json({ error: "CONTRACT_NOT_FOUND" });
      if (err.message === "INVALID_CONTRACT_STATUS") return void res.status(409).json({ error: "INVALID_CONTRACT_STATUS" });
      if (err.message === "INSUFFICIENT_TOKENS") return void res.status(409).json({ error: "INSUFFICIENT_TOKENS" });
      if (err.message === "TRADE_NOT_FOUND") return void res.status(404).json({ error: "TRADE_NOT_FOUND" });
    }

    console.error("Error in accept contract:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/contracts/preview", authRequired, trueqiaAiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const {
      offerTitle,
      requesterName,
      providerName,
      tokens,
      offerId,
      tradeId,
      toUserId,
      notes,
      description,
      templateId,
    } = req.body as {
      offerTitle?: string;
      requesterName?: string;
      providerName?: string;
      tokens?: number;
      offerId?: string;
      tradeId?: string;
      toUserId?: string;
      notes?: string;
      description?: string;
      templateId?: string;
    };

    if (!userId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    if (!offerTitle || !requesterName || !providerName || typeof tokens !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const contract = await generateContractPreview(userId, {
      offerTitle,
      requesterName,
      providerName,
      tokens,
      offerId,
      tradeId,
      requesterUserId: userId,
      providerUserId: toUserId,
      notes,
      description,
      templateId,
    });
    res.status(201).json(contract);
  } catch (err: any) {
    if (err instanceof Error) {
      if (["NEGOTIATION_PENDING", "CANCELLATION_PENDING", "INVALID_TRADE_STATUS", "AGREEMENT_LOCKED", "NEGOTIATION_VERSION_CONFLICT"].includes(err.message)) return void res.status(409).json({ error: err.message });
      if (err.message === "TRADE_NOT_FOUND") return void res.status(404).json({ error: "TRADE_NOT_FOUND" });
      if (err.message === "OFFER_NOT_FOUND") return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
      if (err.message === "TRADE_NOT_ACCEPTED") return void res.status(409).json({ error: "TRADE_NOT_ACCEPTED" });
      if (err.message === "CANNOT_CONTRACT_OWN_OFFER") return void res.status(409).json({ error: "CANNOT_CONTRACT_OWN_OFFER" });
    }
    console.error("Error in preview contract:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
