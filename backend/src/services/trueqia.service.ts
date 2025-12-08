import { TrueqiaContract, TrueqiaOffer, TrueqiaTrade } from "../types/trueqia";
import { getTrueqiaState, getUserById, saveTrueqiaState } from "./data.store";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function normalizeTokens(value?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function listOffers(_userId: string): Promise<TrueqiaOffer[]> {
  const state = getTrueqiaState();
  return state.offers;
}

export async function createOffer(
  userId: string,
  payload: Pick<TrueqiaOffer, "title" | "description" | "tokens">
): Promise<TrueqiaOffer> {
  const user = getUserById(userId);
  const owner = user
    ? { id: user.id, name: user.name, avatar: user.avatarUrl }
    : { id: userId };

  const offer: TrueqiaOffer = {
    id: generateId("offer"),
    title: payload.title,
    description: payload.description,
    tokens: normalizeTokens(payload.tokens),
    owner,
  };

  const state = getTrueqiaState();
  state.offers.push(offer);
  saveTrueqiaState(state);

  return offer;
}

export async function listTrades(userId: string): Promise<TrueqiaTrade[]> {
  const state = getTrueqiaState();
  return state.trades.filter((trade) => {
    if (!userId) return true;
    const isParticipant = trade.participants?.includes(userId);
    return isParticipant || trade.ownerId === userId;
  });
}

export async function createTrade(
  userId: string,
  payload: Pick<TrueqiaTrade, "title" | "tokens" | "offerId">
): Promise<TrueqiaTrade> {
  const trade: TrueqiaTrade = {
    id: generateId("trade"),
    title: payload.title,
    status: "pending",
    participants: [userId],
    tokens: normalizeTokens(payload.tokens),
    offerId: payload.offerId,
    ownerId: userId,
  };

  const state = getTrueqiaState();
  state.trades.push(trade);
  saveTrueqiaState(state);

  return trade;
}

export async function createContractDemo(tradeId: string): Promise<TrueqiaContract> {
  const state = getTrueqiaState();
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade) {
    throw new Error("TRADE_NOT_FOUND");
  }

  const contract: TrueqiaContract = {
    id: generateId("contract"),
    tradeId: trade.id,
    summary: `Contrato demo para "${trade.title}"`,
    createdAt: new Date().toISOString(),
  };

  state.contracts.push(contract);
  saveTrueqiaState(state);

  return contract;
}
