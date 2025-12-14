"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomProductPg = getRandomProductPg;
exports.getProductByEANPg = getProductByEANPg;
exports.getAllwainOffersPg = getAllwainOffersPg;
exports.addAllwainOfferPg = addAllwainOfferPg;
exports.getOrderGroupsPg = getOrderGroupsPg;
exports.createOrderGroupPg = createOrderGroupPg;
exports.updateOrderGroupPg = updateOrderGroupPg;
exports.addSavingPg = addSavingPg;
exports.addReferralStatPg = addReferralStatPg;
exports.getReferralStatsByUserPg = getReferralStatsByUserPg;
const prisma_1 = require("../db/prisma");
/* =========================
   PRODUCTS
========================= */
async function getRandomProductPg() {
    const prisma = (0, prisma_1.getPrisma)();
    const products = await prisma.product.findMany();
    if (!products.length)
        return null;
    return products[Math.floor(Math.random() * products.length)];
}
async function getProductByEANPg(ean) {
    const prisma = (0, prisma_1.getPrisma)();
    return (await prisma.product.findUnique({ where: { ean } }));
}
/* =========================
   OFFERS
========================= */
async function getAllwainOffersPg() {
    const prisma = (0, prisma_1.getPrisma)();
    return (await prisma.offer.findMany({ where: { owner: "allwain" } }));
}
async function addAllwainOfferPg(offer) {
    const prisma = (0, prisma_1.getPrisma)();
    return (await prisma.offer.create({ data: offer }));
}
/* =========================
   ORDER GROUPS
========================= */
async function getOrderGroupsPg() {
    const prisma = (0, prisma_1.getPrisma)();
    return (await prisma.orderGroup.findMany());
}
async function createOrderGroupPg(group) {
    const prisma = (0, prisma_1.getPrisma)();
    return (await prisma.orderGroup.create({ data: group }));
}
async function updateOrderGroupPg(group) {
    const prisma = (0, prisma_1.getPrisma)();
    return (await prisma.orderGroup.update({
        where: { id: group.id },
        data: group,
    }));
}
/* =========================
   SAVINGS
========================= */
async function addSavingPg(tx) {
    const prisma = (0, prisma_1.getPrisma)();
    return prisma.allwainSavingTransaction.create({ data: tx });
}
async function addReferralStatPg(stat) {
    const prisma = (0, prisma_1.getPrisma)();
    return prisma.referralStat.create({ data: stat });
}
async function getReferralStatsByUserPg(userId) {
    const prisma = (0, prisma_1.getPrisma)();
    return prisma.referralStat.findMany({ where: { userId } });
}
