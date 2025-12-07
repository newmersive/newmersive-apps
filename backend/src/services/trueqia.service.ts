import {
  addOffer,
  addTrade,
  getTradeById,
  getUserById,
  getOffersByOwner,
  updateTrade,
  upsertUser,
} from "./data.store";
import { Offer, Trade } from "../shared/types";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function listTrueqiaOffers(options?: {
  excludeUserId?: string;
}): Offer[] {
  const offers = getOffersByOwner("trueqia");
  if (!options?.excludeUserId) return offers;
  return offers.filter((offer) => offer.ownerUserId !== options.excludeUserId);
}

export function createTrueqiaOffer(
  input: Omit<Offer, "id" | "owner">
): Offer {
  const offer: Offer = {
    ...input,
    id: generateId("offer-trueqia"),
    owner: "trueqia",
  };

  return addOffer(offer);
}

export function createTrade(params: {
  offerId: string;
  fromUserId: string;
  toUserId: string;
  tokens: number;
}): Trade {
  if (params.tokens <= 0) throw new Error("INVALID_TOKENS");

  const trade: Trade = {
    id: generateId("trade"),
    offerId: params.offerId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    tokens: params.tokens,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  return addTrade(trade);
}

export function acceptTrade(tradeId: string, actingUserId: string): Trade {
  const trade = getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");
  if (trade.status !== "pending") throw new Error("TRADE_NOT_PENDING");
  if (![trade.fromUserId, trade.toUserId].includes(actingUserId)) {
    throw new Error("NOT_PARTICIPANT");
  }

  const fromUser = getUserById(trade.fromUserId);
  const toUser = getUserById(trade.toUserId);
  if (!fromUser || !toUser) throw new Error("USER_NOT_FOUND");

  const availableTokens = fromUser.tokens ?? 0;
  if (availableTokens < trade.tokens) throw new Error("INSUFFICIENT_TOKENS");

  fromUser.tokens = availableTokens - trade.tokens;
  toUser.tokens = (toUser.tokens ?? 0) + trade.tokens;

  upsertUser(fromUser);
  upsertUser(toUser);

  trade.status = "accepted";
  trade.resolvedAt = new Date().toISOString();

  return updateTrade(trade);
}

export function rejectTrade(tradeId: string, actingUserId: string): Trade {
  const trade = getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");
  if (trade.status !== "pending") throw new Error("TRADE_NOT_PENDING");
  if (![trade.fromUserId, trade.toUserId].includes(actingUserId)) {
    throw new Error("NOT_PARTICIPANT");
  }

  trade.status = "rejected";
  trade.resolvedAt = new Date().toISOString();

  return updateTrade(trade);
}
