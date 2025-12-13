import { randomUUID } from "crypto";
import { Offer, Trade, Contract, DemoContractInput } from "../shared/types";
import { ENV } from "../config/env";

// JSON driver (sync)
import {
  getOffersByOwner,
  getOfferById,
  addOffer,
  getTrades,
  getTradeById,
  addTrade,
  updateTradeStatus,
  getUserById,
  upsertUser,
  createContract,
} from "./data.store";

// Postgres driver (async)
import {
  getOffersByOwnerPg,
  getOfferByIdPg,
  addOfferPg,
  getTradesPg,
  getTradeByIdPg,
  getTradesByOfferIdPg,
  addTradePg,
  updateTradeStatusPg,
  rejectOtherPendingTradesForOfferPg,
  getUserByIdPg,
  upsertUserPg,
  createContractPg,
} from "./data.store.pg";

type TrueqiaOfferResponse = Omit<Offer, "owner"> & {
  owner: { id: string; name?: string; avatarUrl?: string; tokens?: number };
};

export async function listTrueqiaOffers(excludeUserId?: string): Promise<TrueqiaOfferResponse[]> {
  if (ENV.STORAGE_DRIVER === "postgres") {
    const offers = await getOffersByOwnerPg("trueqia");
    const filtered = excludeUserId ? offers.filter((o: any) => o.ownerUserId !== excludeUserId) : offers;

    const out: TrueqiaOfferResponse[] = [];
    for (const offer of filtered as any[]) {
      const owner = await getUserByIdPg(offer.ownerUserId);
      out.push({
        ...(offer as any),
        owner: {
          id: owner?.id || offer.ownerUserId,
          name: owner?.name,
          avatarUrl: (owner as any)?.avatarUrl || undefined,
          tokens: (owner as any)?.tokens || undefined,
        },
      });
    }
    return out;
  }

  const offers = getOffersByOwner("trueqia");
  const filteredOffers = excludeUserId ? offers.filter((o) => o.ownerUserId !== excludeUserId) : offers;

  return filteredOffers.map((offer): TrueqiaOfferResponse => {
    const owner = getUserById(offer.ownerUserId);
    return {
      ...offer,
      owner: {
        id: owner?.id || offer.ownerUserId,
        name: owner?.name,
        avatarUrl: owner?.avatarUrl,
        tokens: owner?.tokens,
      },
    };
  });
}

export async function createTrueqiaOffer(
  userId: string,
  title: string,
  description: string,
  tokens: number,
  meta?: Record<string, unknown>,
  isUnique: boolean = false
): Promise<Offer> {
  const offer: Offer = {
    id: randomUUID(),
    title,
    description,
    owner: "trueqia",
    ownerUserId: userId,
    tokens: Math.floor(tokens),
    meta,
    isUnique,
  };

  return ENV.STORAGE_DRIVER === "postgres" ? (addOfferPg(offer) as any) : addOffer(offer);
}

export async function createTrade(
  fromUserId: string,
  toUserId: string,
  offerId: string,
  tokens?: number
): Promise<Trade> {
  const offer = ENV.STORAGE_DRIVER === "postgres" ? await getOfferByIdPg(offerId) : getOfferById(offerId);
  if (!offer) throw new Error("OFFER_NOT_FOUND");

  // Si es única: si ya hay un accepted, no se puede crear otro trade
  if (ENV.STORAGE_DRIVER === "postgres" && (offer as any).isUnique) {
    const trades = await getTradesByOfferIdPg(offerId);
    const alreadyAccepted = trades.find((t: any) => t.status === "accepted");
    if (alreadyAccepted) throw new Error("OFFER_ALREADY_CLAIMED");
  }

  const tokenAmount = typeof tokens === "number" ? tokens : (offer as any).tokens ?? 0;
  const intTokens = Math.floor(Number(tokenAmount));
  if (!Number.isFinite(intTokens) || intTokens <= 0) throw new Error("INVALID_TOKEN_AMOUNT");

  const trade: Trade = {
    id: randomUUID(),
    offerId,
    fromUserId,
    toUserId,
    tokens: intTokens,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  return ENV.STORAGE_DRIVER === "postgres" ? (addTradePg(trade) as any) : addTrade(trade);
}

export async function acceptTrade(tradeId: string) {
  const trade = ENV.STORAGE_DRIVER === "postgres" ? await getTradeByIdPg(tradeId) : getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");

  const offer = ENV.STORAGE_DRIVER === "postgres" ? await getOfferByIdPg((trade as any).offerId) : getOfferById(trade.offerId);
  if (!offer) throw new Error("OFFER_NOT_FOUND");

  // Oferta única: si ya existe otro accepted para esa oferta, bloquear
  if (ENV.STORAGE_DRIVER === "postgres" && (offer as any).isUnique) {
    const trades = await getTradesByOfferIdPg((trade as any).offerId);
    const acceptedOther = trades.find((t: any) => t.status === "accepted" && t.id !== (trade as any).id);
    if (acceptedOther) throw new Error("OFFER_ALREADY_CLAIMED");
  }

  const fromUser = ENV.STORAGE_DRIVER === "postgres" ? await getUserByIdPg((trade as any).fromUserId) : getUserById(trade.fromUserId);
  const toUser = ENV.STORAGE_DRIVER === "postgres" ? await getUserByIdPg((trade as any).toUserId) : getUserById(trade.toUserId);
  if (!fromUser || !toUser) throw new Error("USER_NOT_FOUND");

  if (((fromUser as any).tokens || 0) < (trade as any).tokens) throw new Error("INSUFFICIENT_TOKENS");

  (fromUser as any).tokens = ((fromUser as any).tokens || 0) - (trade as any).tokens;
  (toUser as any).tokens = ((toUser as any).tokens || 0) + (trade as any).tokens;

  if (ENV.STORAGE_DRIVER === "postgres") {
    await upsertUserPg(fromUser as any);
    await upsertUserPg(toUser as any);

    const updated = await updateTradeStatusPg((trade as any).id, "accepted");

    // Oferta única => rechaza todos los demás pending de esa oferta automáticamente
    if ((offer as any).isUnique) {
      await rejectOtherPendingTradesForOfferPg((trade as any).offerId, (trade as any).id);
    }

    return updated;
  }

  upsertUser(fromUser as any);
  upsertUser(toUser as any);
  return updateTradeStatus(tradeId, "accepted");
}

export async function rejectTrade(tradeId: string) {
  const trade = ENV.STORAGE_DRIVER === "postgres" ? await getTradeByIdPg(tradeId) : getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");

  return ENV.STORAGE_DRIVER === "postgres"
    ? updateTradeStatusPg((trade as any).id, "rejected")
    : updateTradeStatus(tradeId, "rejected");
}

export async function listTradesForUser(userId?: string) {
  const trades = ENV.STORAGE_DRIVER === "postgres" ? await getTradesPg() : getTrades();

  const filtered = (trades as any[]).filter((trade: any) =>
    userId ? trade.fromUserId === userId || trade.toUserId === userId : true
  );

  const out: any[] = [];
  for (const trade of filtered) {
    const offer = ENV.STORAGE_DRIVER === "postgres" ? await getOfferByIdPg(trade.offerId) : getOfferById(trade.offerId);
    const fromUser = ENV.STORAGE_DRIVER === "postgres" ? await getUserByIdPg(trade.fromUserId) : getUserById(trade.fromUserId);
    const toUser = ENV.STORAGE_DRIVER === "postgres" ? await getUserByIdPg(trade.toUserId) : getUserById(trade.toUserId);

    out.push({
      ...trade,
      title: offer?.title || "Trueque",
      participants: [fromUser?.name || trade.fromUserId, toUser?.name || trade.toUserId].filter(Boolean),
      offerOwnerId: (offer as any)?.ownerUserId,
    });
  }
  return out;
}

function fallbackContractText(input: DemoContractInput) {
  return [
    `CONTRATO (DEMO) TRUEQIA`,
    ``,
    `Oferta: ${input.offerTitle}`,
    `Solicitante: ${input.requesterName}`,
    `Proveedor: ${input.providerName}`,
    `Tokens: ${input.tokens}`,
    ``,
    `Este texto es un fallback porque la IA no está configurada o falló.`,
  ].join("\n");
}

export async function generateContractPreview(input: DemoContractInput): Promise<Contract> {
  let generatedText: string;

  try {
    const { generateContractText } = await import("./ai/contracts.ai.service");
    generatedText = await generateContractText({
      title: input.offerTitle,
      requesterName: input.requesterName,
      providerName: input.providerName,
      tokens: input.tokens,
    });
  } catch (err) {
    console.error("CONTRACT_AI_ERROR:", err);
    generatedText = fallbackContractText(input);
  }

  const contract: Contract = {
    id: randomUUID(),
    app: "trueqia",
    type: "trade",
    status: "draft",
    generatedText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return ENV.STORAGE_DRIVER === "postgres" ? (createContractPg(contract) as any) : createContract(contract);
}

