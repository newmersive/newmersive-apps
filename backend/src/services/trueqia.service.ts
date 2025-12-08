import { randomUUID } from "crypto";
import {
  Offer,
  Trade,
  Contract,
  DemoContractInput,
} from "../shared/types";
import {
  getOffersByOwner,
  addOffer,
  getTradeById,
  addTrade,
  updateTradeStatus,
  getUserById,
  upsertUser,
  createContract,
} from "./data.store";

/* =========================
   OFFERS (TRUEQIA)
========================= */

export function listTrueqiaOffers(excludeUserId?: string) {
  const offers = getOffersByOwner("trueqia");
  if (!excludeUserId) return offers;
  return offers.filter(o => o.ownerUserId !== excludeUserId);
}

export function createTrueqiaOffer(
  userId: string,
  title: string,
  description: string,
  tokens: number,
  meta?: Record<string, unknown>
): Offer {
  const offer: Offer = {
    id: randomUUID(),
    title,
    description,
    owner: "trueqia",
    ownerUserId: userId,
    tokens,
    meta,
  };

  return addOffer(offer);
}

/* =========================
   TRADES (TRUEQIA)
========================= */

export function createTrade(
  fromUserId: string,
  toUserId: string,
  offerId: string,
  tokens: number
): Trade {
  if (tokens <= 0) throw new Error("INVALID_TOKEN_AMOUNT");

  const trade: Trade = {
    id: randomUUID(),
    offerId,
    fromUserId,
    toUserId,
    tokens,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  return addTrade(trade);
}

export function acceptTrade(tradeId: string) {
  const trade = getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");

  const fromUser = getUserById(trade.fromUserId);
  const toUser = getUserById(trade.toUserId);

  if (!fromUser || !toUser) throw new Error("USER_NOT_FOUND");

  if ((fromUser.tokens || 0) < trade.tokens)
    throw new Error("INSUFFICIENT_TOKENS");

  fromUser.tokens = (fromUser.tokens || 0) - trade.tokens;
  toUser.tokens = (toUser.tokens || 0) + trade.tokens;

  upsertUser(fromUser);
  upsertUser(toUser);

  return updateTradeStatus(tradeId, "accepted");
}

export function rejectTrade(tradeId: string) {
  const trade = getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");

  return updateTradeStatus(tradeId, "rejected");
}

/* =========================
   CONTRACTS (TRUEQIA)
========================= */

export function generateContractPreview(
  input: DemoContractInput
): Contract {
  const text = `
  CONTRATO DE TRUEQUE DEMO

  OFERTA: ${input.offerTitle}
  SOLICITANTE: ${input.requesterName}
  PROVEEDOR: ${input.providerName}

  TOKENS ACORDADOS: ${input.tokens}

  Este contrato es solo una simulación sin validez legal.
  `;

  const contract: Contract = {
    id: randomUUID(),
    app: "trueqia",
    type: "trade",
    status: "draft",
    generatedText: text.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return createContract(contract);
}
