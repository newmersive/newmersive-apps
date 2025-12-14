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
  return products[Math.floor(Math.random() * products.length)] as any;
}

export async function getProductByEANPg(ean: string): Promise<Product | null> {
  const prisma = getPrisma();
  return (await prisma.product.findUnique({ where: { ean } })) as any;
}

/* =========================
   OFFERS
========================= */

export async function getAllwainOffersPg(): Promise<Offer[]> {
  const prisma = getPrisma();
  return (await prisma.offer.findMany({ where: { owner: "allwain" } })) as any;
}

export async function addAllwainOfferPg(offer: Offer): Promise<Offer> {
  const prisma = getPrisma();
  return (await prisma.offer.create({ data: offer as any })) as any;
}

/* =========================
   ORDER GROUPS
========================= */

export async function getOrderGroupsPg(): Promise<OrderGroup[]> {
  const prisma = getPrisma();
  return (await prisma.orderGroup.findMany()) as any;
}

export async function createOrderGroupPg(group: OrderGroup): Promise<OrderGroup> {
  const prisma = getPrisma();
  return (await prisma.orderGroup.create({ data: group as any })) as any;
}

export async function updateOrderGroupPg(group: OrderGroup): Promise<OrderGroup> {
  const prisma = getPrisma();
  return (await prisma.orderGroup.update({
    where: { id: group.id },
    data: group as any,
  })) as any;
}

/* =========================
   SAVINGS
========================= */

export async function addSavingPg(tx: AllwainSavingTransaction) {
  const prisma = getPrisma();
  return prisma.allwainSavingTransaction.create({ data: tx as any });
}

export async function addReferralStatPg(stat: ReferralStat) {
  const prisma = getPrisma();
  return prisma.referralStat.create({ data: stat as any });
}

export async function getReferralStatsByUserPg(userId: string) {
  const prisma = getPrisma();
  return prisma.referralStat.findMany({ where: { userId } });
}

