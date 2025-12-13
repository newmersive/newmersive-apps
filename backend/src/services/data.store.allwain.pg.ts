import { randomUUID } from "crypto";
import { getPrisma } from "../db/prisma";
import {
  Offer,
  Product,
  OrderGroup,
  AllwainSavingTransaction,
  ReferralStat,
} from "../shared/types";

/* =========================
   PRODUCTS
========================= */

export async function getRandomProductPg(): Promise<Product | null> {
  const prisma = getPrisma();
  const products = await prisma.product.findMany();
  if (!products.length) return null;
  return products[Math.floor(Math.random() * products.length)];
}

export async function getProductByEANPg(ean: string): Promise<Product | null> {
  const prisma = getPrisma();
  return prisma.product.findUnique({ where: { ean } });
}

/* =========================
   OFFERS
========================= */

export async function getAllwainOffersPg() {
  const prisma = getPrisma();
  return prisma.offer.findMany({ where: { owner: "allwain" } });
}

export async function addAllwainOfferPg(offer: Offer) {
  const prisma = getPrisma();
  return prisma.offer.create({ data: offer });
}

/* =========================
   ORDER GROUPS
========================= */

export async function getOrderGroupsPg() {
  const prisma = getPrisma();
  return prisma.orderGroup.findMany();
}

export async function createOrderGroupPg(group: OrderGroup) {
  const prisma = getPrisma();
  return prisma.orderGroup.create({ data: group });
}

export async function updateOrderGroupPg(group: OrderGroup) {
  const prisma = getPrisma();
  return prisma.orderGroup.update({
    where: { id: group.id },
    data: group,
  });
}

/* =========================
   SAVINGS
========================= */

export async function addSavingPg(tx: AllwainSavingTransaction) {
  const prisma = getPrisma();
  return prisma.allwainSavingTransaction.create({ data: tx });
}

export async function addReferralStatPg(stat: ReferralStat) {
  const prisma = getPrisma();
  return prisma.referralStat.create({ data: stat });
}

export async function getReferralStatsByUserPg(userId: string) {
  const prisma = getPrisma();
  return prisma.referralStat.findMany({ where: { userId } });
}
