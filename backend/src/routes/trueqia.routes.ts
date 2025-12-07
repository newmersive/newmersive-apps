import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { generateTrueqiaContract } from "../ia/trueqia.contracts";
import { listOffers, listTrades } from "../services/market.service";
import {
  createContract,
  getOfferById,
  getUserById,
  updateContractStatus,
  updateTradeStatus,
} from "../services/data.store";
import { ContractStatus, TradeStatus } from "../shared/types";

const router = Router();

router.get("/offers", authRequired, (req: AuthRequest, res) => {
  res.json({ items: listOffers("trueqia"), user: req.user });
});

router.get("/trades", authRequired, (_req, res) => {
  res.json({ items: listTrades() });
});

router.post("/contracts/preview", authRequired, (req: AuthRequest, res) => {
  const { offerId, fromUserId, toUserId, tokens } = req.body as {
    offerId?: string;
    fromUserId?: string;
    toUserId?: string;
    tokens?: number;
  };

  const offer = offerId ? getOfferById(offerId) : undefined;
  const fromUser = fromUserId ? getUserById(fromUserId) : undefined;
  const toUser = toUserId ? getUserById(toUserId) : undefined;

  if (!offer || !fromUser || !toUser || typeof tokens !== "number") {
    return res
      .status(400)
      .json({
        message:
          "offerId, fromUserId, toUserId y tokens son obligatorios para generar el contrato.",
      });
  }

  const contractText = generateTrueqiaContract({ offer, fromUser, toUser, tokens });

  const contract = createContract({
    title: `Contrato trueque: ${offer.title}`,
    app: "trueqia",
    type: "trade",
    status: "draft",
    counterparties: [fromUser.id, toUser.id],
    valueTokens: tokens,
    generatedText: contractText,
  });

  res.json({ contractText, contractId: contract.id });
});

router.patch("/contracts/:id/status", authRequired, (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: ContractStatus };
  const allowed: ContractStatus[] = ["draft", "active", "closed", "conflict"];

  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ message: "Estado de contrato inválido" });
  }

  const contract = updateContractStatus(id, status);
  if (!contract) {
    return res.status(404).json({ message: "Contrato no encontrado" });
  }

  res.json(contract);
});

router.patch("/trades/:id/status", authRequired, (req, res) => {
  const { id } = req.params;
  const { status, contractId } = req.body as {
    status?: TradeStatus;
    contractId?: string;
  };

  const allowed: TradeStatus[] = ["pending", "accepted", "rejected", "cancelled"];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ message: "Estado de trade inválido" });
  }

  const trade = updateTradeStatus(id, status, contractId);
  if (!trade) {
    return res.status(404).json({ message: "Trade no encontrado" });
  }

  res.json(trade);
});

export default router;
