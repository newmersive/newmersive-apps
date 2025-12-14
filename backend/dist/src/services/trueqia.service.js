"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTrueqiaOffers = listTrueqiaOffers;
exports.createTrueqiaOffer = createTrueqiaOffer;
exports.createTrade = createTrade;
exports.acceptTrade = acceptTrade;
exports.rejectTrade = rejectTrade;
exports.listTradesForUser = listTradesForUser;
exports.generateContractPreview = generateContractPreview;
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
// JSON driver (sync)
const data_store_1 = require("./data.store");
// Postgres driver (async)
const data_store_pg_1 = require("./data.store.pg");
async function listTrueqiaOffers(excludeUserId) {
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        const offers = await (0, data_store_pg_1.getOffersByOwnerPg)("trueqia");
        const filtered = excludeUserId
            ? offers.filter((o) => o.ownerUserId !== excludeUserId)
            : offers;
        const out = [];
        for (const offer of filtered) {
            const owner = await (0, data_store_pg_1.getUserByIdPg)(offer.ownerUserId);
            out.push({
                ...offer,
                owner: {
                    id: owner?.id || offer.ownerUserId,
                    name: owner?.name,
                    avatarUrl: owner?.avatarUrl ?? undefined,
                    tokens: owner?.tokens ?? undefined,
                },
            });
        }
        return out;
    }
    const offers = (0, data_store_1.getOffersByOwner)("trueqia");
    const filteredOffers = excludeUserId
        ? offers.filter((o) => o.ownerUserId !== excludeUserId)
        : offers;
    return filteredOffers.map((offer) => {
        const owner = (0, data_store_1.getUserById)(offer.ownerUserId);
        return {
            ...offer,
            owner: {
                id: owner?.id || offer.ownerUserId,
                name: owner?.name,
                avatarUrl: owner?.avatarUrl ?? undefined,
                tokens: owner?.tokens ?? undefined,
            },
        };
    });
}
async function createTrueqiaOffer(userId, title, description, tokens, meta, isUnique = false) {
    const offer = {
        id: (0, crypto_1.randomUUID)(),
        title,
        description,
        owner: "trueqia",
        ownerUserId: userId,
        tokens: Math.floor(tokens),
        meta,
        isUnique,
    };
    return env_1.ENV.STORAGE_DRIVER === "postgres"
        ? (0, data_store_pg_1.addOfferPg)(offer)
        : (0, data_store_1.addOffer)(offer);
}
async function createTrade(fromUserId, toUserId, offerId, tokens) {
    const offer = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getOfferByIdPg)(offerId)
        : (0, data_store_1.getOfferById)(offerId);
    if (!offer)
        throw new Error("OFFER_NOT_FOUND");
    // Si es única: si ya hay un accepted, no se puede crear otro trade
    if (env_1.ENV.STORAGE_DRIVER === "postgres" && offer.isUnique) {
        const trades = await (0, data_store_pg_1.getTradesByOfferIdPg)(offerId);
        const alreadyAccepted = trades.find((t) => t.status === "accepted");
        if (alreadyAccepted)
            throw new Error("OFFER_ALREADY_CLAIMED");
    }
    const tokenAmount = typeof tokens === "number" ? tokens : offer.tokens ?? 0;
    const intTokens = Math.floor(Number(tokenAmount));
    if (!Number.isFinite(intTokens) || intTokens <= 0)
        throw new Error("INVALID_TOKEN_AMOUNT");
    const trade = {
        id: (0, crypto_1.randomUUID)(),
        offerId,
        fromUserId,
        toUserId,
        tokens: intTokens,
        status: "pending",
        createdAt: new Date().toISOString(),
    };
    return env_1.ENV.STORAGE_DRIVER === "postgres"
        ? (0, data_store_pg_1.addTradePg)(trade)
        : (0, data_store_1.addTrade)(trade);
}
async function acceptTrade(tradeId) {
    const trade = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getTradeByIdPg)(tradeId)
        : (0, data_store_1.getTradeById)(tradeId);
    if (!trade)
        throw new Error("TRADE_NOT_FOUND");
    const offer = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getOfferByIdPg)(trade.offerId)
        : (0, data_store_1.getOfferById)(trade.offerId);
    if (!offer)
        throw new Error("OFFER_NOT_FOUND");
    // Oferta única: si ya existe otro accepted para esa oferta, bloquear
    if (env_1.ENV.STORAGE_DRIVER === "postgres" && offer.isUnique) {
        const trades = await (0, data_store_pg_1.getTradesByOfferIdPg)(trade.offerId);
        const acceptedOther = trades.find((t) => t.status === "accepted" && t.id !== trade.id);
        if (acceptedOther)
            throw new Error("OFFER_ALREADY_CLAIMED");
    }
    const fromUser = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByIdPg)(trade.fromUserId)
        : (0, data_store_1.getUserById)(trade.fromUserId);
    const toUser = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getUserByIdPg)(trade.toUserId)
        : (0, data_store_1.getUserById)(trade.toUserId);
    if (!fromUser || !toUser)
        throw new Error("USER_NOT_FOUND");
    if ((fromUser.tokens || 0) < trade.tokens)
        throw new Error("INSUFFICIENT_TOKENS");
    fromUser.tokens = (fromUser.tokens || 0) - trade.tokens;
    toUser.tokens = (toUser.tokens || 0) + trade.tokens;
    if (env_1.ENV.STORAGE_DRIVER === "postgres") {
        await (0, data_store_pg_1.upsertUserPg)(fromUser);
        await (0, data_store_pg_1.upsertUserPg)(toUser);
        const updated = await (0, data_store_pg_1.updateTradeStatusPg)(trade.id, "accepted");
        // Oferta única => rechaza todos los demás pending de esa oferta automáticamente
        if (offer.isUnique) {
            await (0, data_store_pg_1.rejectOtherPendingTradesForOfferPg)(trade.offerId, trade.id);
        }
        return updated;
    }
    (0, data_store_1.upsertUser)(fromUser);
    (0, data_store_1.upsertUser)(toUser);
    return (0, data_store_1.updateTradeStatus)(tradeId, "accepted");
}
async function rejectTrade(tradeId) {
    const trade = env_1.ENV.STORAGE_DRIVER === "postgres"
        ? await (0, data_store_pg_1.getTradeByIdPg)(tradeId)
        : (0, data_store_1.getTradeById)(tradeId);
    if (!trade)
        throw new Error("TRADE_NOT_FOUND");
    return env_1.ENV.STORAGE_DRIVER === "postgres"
        ? (0, data_store_pg_1.updateTradeStatusPg)(trade.id, "rejected")
        : (0, data_store_1.updateTradeStatus)(tradeId, "rejected");
}
async function listTradesForUser(userId) {
    const trades = env_1.ENV.STORAGE_DRIVER === "postgres" ? await (0, data_store_pg_1.getTradesPg)() : (0, data_store_1.getTrades)();
    const filtered = trades.filter((trade) => userId ? trade.fromUserId === userId || trade.toUserId === userId : true);
    const out = [];
    for (const trade of filtered) {
        const offer = env_1.ENV.STORAGE_DRIVER === "postgres"
            ? await (0, data_store_pg_1.getOfferByIdPg)(trade.offerId)
            : (0, data_store_1.getOfferById)(trade.offerId);
        const fromUser = env_1.ENV.STORAGE_DRIVER === "postgres"
            ? await (0, data_store_pg_1.getUserByIdPg)(trade.fromUserId)
            : (0, data_store_1.getUserById)(trade.fromUserId);
        const toUser = env_1.ENV.STORAGE_DRIVER === "postgres"
            ? await (0, data_store_pg_1.getUserByIdPg)(trade.toUserId)
            : (0, data_store_1.getUserById)(trade.toUserId);
        out.push({
            ...trade,
            title: offer?.title || "Trueque",
            participants: [fromUser?.name || trade.fromUserId, toUser?.name || trade.toUserId].filter(Boolean),
            offerOwnerId: offer?.ownerUserId,
        });
    }
    return out;
}
function fallbackContractText(input) {
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
async function generateContractPreview(input) {
    let generatedText;
    try {
        const { generateContractText } = await Promise.resolve().then(() => __importStar(require("./ai/contracts.ai.service")));
        generatedText = await generateContractText({
            title: input.offerTitle,
            requesterName: input.requesterName,
            providerName: input.providerName,
            tokens: input.tokens,
        });
    }
    catch (err) {
        console.error("CONTRACT_AI_ERROR:", err);
        generatedText = fallbackContractText(input);
    }
    const contract = {
        id: (0, crypto_1.randomUUID)(),
        app: "trueqia",
        type: "trade",
        status: "draft",
        generatedText,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    return env_1.ENV.STORAGE_DRIVER === "postgres"
        ? (0, data_store_pg_1.createContractPg)(contract)
        : (0, data_store_1.createContract)(contract);
}
