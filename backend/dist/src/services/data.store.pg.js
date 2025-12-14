"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsersPg = getUsersPg;
exports.getUserByIdPg = getUserByIdPg;
exports.getUserByEmailPg = getUserByEmailPg;
exports.getUserBySponsorCodePg = getUserBySponsorCodePg;
exports.upsertUserPg = upsertUserPg;
exports.getOffersByOwnerPg = getOffersByOwnerPg;
exports.getOfferByIdPg = getOfferByIdPg;
exports.addOfferPg = addOfferPg;
exports.getTradesPg = getTradesPg;
exports.getTradeByIdPg = getTradeByIdPg;
exports.getTradesByOfferIdPg = getTradesByOfferIdPg;
exports.addTradePg = addTradePg;
exports.updateTradeStatusPg = updateTradeStatusPg;
exports.rejectOtherPendingTradesForOfferPg = rejectOtherPendingTradesForOfferPg;
exports.getProductsPg = getProductsPg;
exports.getProductByIdPg = getProductByIdPg;
exports.getProductByEANPg = getProductByEANPg;
exports.getOrderGroupsPg = getOrderGroupsPg;
exports.addOrderGroupPg = addOrderGroupPg;
exports.updateOrderGroupPg = updateOrderGroupPg;
exports.addSavingPg = addSavingPg;
exports.addReferralStatPg = addReferralStatPg;
exports.getReferralStatsByUserPg = getReferralStatsByUserPg;
exports.addLeadPg = addLeadPg;
exports.addLeadGlobalPg = addLeadGlobalPg;
exports.getLeadsGlobalPg = getLeadsGlobalPg;
exports.createContractPg = createContractPg;
exports.savePasswordResetTokenPg = savePasswordResetTokenPg;
exports.getPasswordResetTokenPg = getPasswordResetTokenPg;
exports.deletePasswordResetTokenPg = deletePasswordResetTokenPg;
const prisma_1 = require("../db/prisma");
/* =========================
   USERS
========================= */
async function getUsersPg() {
    return (0, prisma_1.getPrisma)().user.findMany();
}
async function getUserByIdPg(id) {
    return (0, prisma_1.getPrisma)().user.findUnique({ where: { id } });
}
async function getUserByEmailPg(email) {
    return (0, prisma_1.getPrisma)().user.findUnique({ where: { email } });
}
async function getUserBySponsorCodePg(code) {
    return (0, prisma_1.getPrisma)().user.findUnique({ where: { sponsorCode: code } });
}
async function upsertUserPg(user) {
    return (0, prisma_1.getPrisma)().user.upsert({
        where: { id: user.id },
        create: user,
        update: user,
    });
}
/* =========================
   OFFERS
========================= */
async function getOffersByOwnerPg(owner) {
    return (0, prisma_1.getPrisma)().offer.findMany({ where: { owner } });
}
async function getOfferByIdPg(id) {
    return (0, prisma_1.getPrisma)().offer.findUnique({ where: { id } });
}
async function addOfferPg(offer) {
    return (0, prisma_1.getPrisma)().offer.create({ data: offer });
}
/* =========================
   TRADES
========================= */
async function getTradesPg() {
    return (0, prisma_1.getPrisma)().trade.findMany({ orderBy: { createdAt: "desc" } });
}
async function getTradeByIdPg(id) {
    return (0, prisma_1.getPrisma)().trade.findUnique({ where: { id } });
}
async function getTradesByOfferIdPg(offerId) {
    return (0, prisma_1.getPrisma)().trade.findMany({ where: { offerId }, orderBy: { createdAt: "desc" } });
}
async function addTradePg(trade) {
    return (0, prisma_1.getPrisma)().trade.create({ data: trade });
}
async function updateTradeStatusPg(tradeId, status) {
    return (0, prisma_1.getPrisma)().trade.update({
        where: { id: tradeId },
        data: {
            status,
            resolvedAt: status === "pending" ? null : new Date(),
        },
    });
}
async function rejectOtherPendingTradesForOfferPg(offerId, exceptTradeId) {
    return (0, prisma_1.getPrisma)().trade.updateMany({
        where: {
            offerId,
            id: { not: exceptTradeId },
            status: "pending",
        },
        data: {
            status: "rejected",
            resolvedAt: new Date(),
        },
    });
}
/* =========================
   PRODUCTS
========================= */
async function getProductsPg() {
    return (0, prisma_1.getPrisma)().product.findMany();
}
async function getProductByIdPg(id) {
    return (0, prisma_1.getPrisma)().product.findUnique({ where: { id } });
}
async function getProductByEANPg(ean) {
    return (0, prisma_1.getPrisma)().product.findUnique({ where: { ean } });
}
/* =========================
   ORDER GROUPS
========================= */
async function getOrderGroupsPg() {
    return (0, prisma_1.getPrisma)().orderGroup.findMany();
}
async function addOrderGroupPg(group) {
    return (0, prisma_1.getPrisma)().orderGroup.create({ data: group });
}
async function updateOrderGroupPg(group) {
    return (0, prisma_1.getPrisma)().orderGroup.update({
        where: { id: group.id },
        data: group,
    });
}
/* =========================
   SAVINGS + REFERRALS
========================= */
async function addSavingPg(tx) {
    return (0, prisma_1.getPrisma)().allwainSavingTransaction.create({ data: tx });
}
async function addReferralStatPg(stat) {
    return (0, prisma_1.getPrisma)().referralStat.create({ data: stat });
}
async function getReferralStatsByUserPg(userId) {
    return (0, prisma_1.getPrisma)().referralStat.findMany({ where: { userId } });
}
/* =========================
   LEADS
========================= */
async function addLeadPg(lead) {
    return (0, prisma_1.getPrisma)().lead.create({ data: lead });
}
async function addLeadGlobalPg(lead) {
    const created = await (0, prisma_1.getPrisma)().leadGlobal.create({ data: lead });
    return created;
}
async function getLeadsGlobalPg() {
    const items = await (0, prisma_1.getPrisma)().leadGlobal.findMany({ orderBy: { createdAt: "desc" } });
    return items;
}
/* =========================
   CONTRACTS
========================= */
async function createContractPg(contract) {
    return (0, prisma_1.getPrisma)().contract.create({ data: contract });
}
/* =========================
   PASSWORD RESET TOKENS
========================= */
async function savePasswordResetTokenPg(token, userId, expiresAt) {
    return (0, prisma_1.getPrisma)().passwordResetToken.upsert({
        where: { token },
        create: { token, userId, expiresAt: BigInt(expiresAt) },
        update: { userId, expiresAt: BigInt(expiresAt) },
    });
}
async function getPasswordResetTokenPg(token) {
    const rec = await (0, prisma_1.getPrisma)().passwordResetToken.findUnique({ where: { token } });
    if (!rec)
        return null;
    return {
        token: rec.token,
        userId: rec.userId,
        expiresAt: Number(rec.expiresAt),
    };
}
async function deletePasswordResetTokenPg(token) {
    try {
        return await (0, prisma_1.getPrisma)().passwordResetToken.delete({ where: { token } });
    }
    catch {
        return null;
    }
}
