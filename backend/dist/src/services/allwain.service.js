"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanDemoProduct = scanDemoProduct;
exports.listAllwainOffers = listAllwainOffers;
exports.createAllwainOffer = createAllwainOffer;
exports.listOrderGroups = listOrderGroups;
exports.createOrderGroup = createOrderGroup;
exports.joinOrderGroup = joinOrderGroup;
exports.registerSaving = registerSaving;
exports.getSponsorSummary = getSponsorSummary;
const crypto_1 = require("crypto");
const data_store_pg_1 = require("./data.store.pg");
const data_store_allwain_pg_1 = require("./data.store.allwain.pg");
const ALLOWED_ROLES = ["user", "buyer", "company", "admin"];
const normalizeRole = (role) => ALLOWED_ROLES.includes(role) ? role : "user";
/* =========================
   SCAN DEMO (POSTGRES)
========================= */
async function scanDemoProduct(ean) {
    const product = ean ? await (0, data_store_allwain_pg_1.getProductByEANPg)(ean) : await (0, data_store_allwain_pg_1.getRandomProductPg)();
    if (!product) {
        return { product: null, offers: [] };
    }
    const offers = (await (0, data_store_allwain_pg_1.getAllwainOffersPg)()).filter((o) => o.productId === product.id);
    return { product, offers };
}
/* =========================
   OFFERS
========================= */
async function listAllwainOffers() {
    return (0, data_store_allwain_pg_1.getAllwainOffersPg)();
}
async function createAllwainOffer(userId, title, description, price, productId, meta) {
    const offer = {
        id: (0, crypto_1.randomUUID)(),
        title,
        description,
        owner: "allwain",
        ownerUserId: userId,
        price,
        productId,
        meta,
    };
    return (0, data_store_allwain_pg_1.addAllwainOfferPg)(offer);
}
/* =========================
   ORDER GROUPS
========================= */
async function listOrderGroups() {
    return (0, data_store_allwain_pg_1.getOrderGroupsPg)();
}
async function createOrderGroup(productId, minUnitsPerClient) {
    const group = {
        id: (0, crypto_1.randomUUID)(),
        productId,
        totalUnits: 0,
        minUnitsPerClient,
        status: "open",
        participants: [],
    };
    return (0, data_store_allwain_pg_1.createOrderGroupPg)(group);
}
async function joinOrderGroup(groupId, userId, units) {
    const groups = await (0, data_store_allwain_pg_1.getOrderGroupsPg)();
    const group = groups.find((g) => g.id === groupId);
    if (!group)
        throw new Error("GROUP_NOT_FOUND");
    const participants = group.participants;
    const participant = participants.find((p) => p.userId === userId);
    if (participant)
        participant.units += units;
    else
        participants.push({ userId, units });
    group.totalUnits += units;
    group.participants = participants;
    return (0, data_store_allwain_pg_1.updateOrderGroupPg)(group);
}
/* =========================
   SAVINGS + REFERRALS
========================= */
async function registerSaving(userId, amount) {
    const user = await (0, data_store_pg_1.getUserByIdPg)(userId);
    if (!user)
        throw new Error("USER_NOT_FOUND");
    const saving = {
        id: (0, crypto_1.randomUUID)(),
        userId,
        amount,
        createdAt: new Date().toISOString(),
    };
    await (0, data_store_allwain_pg_1.addSavingPg)(saving);
    user.allwainBalance = (user.allwainBalance || 0) + amount;
    user.role = normalizeRole(user.role);
    await (0, data_store_pg_1.upsertUserPg)(user);
    let referral;
    if (user.referredByCode) {
        const stats = await (0, data_store_allwain_pg_1.getReferralStatsByUserPg)(user.referredByCode);
        const sponsorId = stats?.[0]?.userId;
        if (sponsorId) {
            const sponsor = await (0, data_store_pg_1.getUserByIdPg)(sponsorId);
            if (sponsor) {
                const commission = amount * 0.1;
                sponsor.allwainBalance = (sponsor.allwainBalance || 0) + commission;
                sponsor.role = normalizeRole(sponsor.role);
                await (0, data_store_pg_1.upsertUserPg)(sponsor);
                referral = {
                    id: (0, crypto_1.randomUUID)(),
                    userId: sponsor.id,
                    invitedUserId: user.id,
                    totalSavedByInvited: amount,
                    commissionEarned: commission,
                    monthlyHistory: [],
                };
                await (0, data_store_allwain_pg_1.addReferralStatPg)(referral);
            }
        }
    }
    return { saving, referral };
}
async function getSponsorSummary(userId) {
    const stats = await (0, data_store_allwain_pg_1.getReferralStatsByUserPg)(userId);
    const totalInvited = stats.length;
    const totalSaved = stats.reduce((s, r) => s + (r.totalSavedByInvited || 0), 0);
    const totalCommission = stats.reduce((s, r) => s + (r.commissionEarned || 0), 0);
    return {
        totalInvited,
        totalSaved,
        totalCommission,
        referrals: stats,
    };
}
