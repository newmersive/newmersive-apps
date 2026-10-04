import { getPrisma } from "../db/prisma";
import { getAllwainContractPagePg, mapContractPg } from "./data.store.pg";
import { allwainOrderDtos, allwainPreparationWhere, getAllwainOrderForUser, listAllwainOrderPageForUser } from "./allwain-payments.service";
import { type AllwainDiscoveryInput } from "./allwain-discovery";
import { allwainOfferCardImageMeta } from "./allwain-card-images.service";
import type { Offer } from "../shared/types";
import { ENV } from "../config/env";

function requireActivityStorage() {
  if(ENV.STORAGE_DRIVER !== "postgres") throw new Error("PAYMENTS_REQUIRE_POSTGRES");
}

type ActivityInput = AllwainDiscoveryInput & {
  limit: number; cursor?: string | null; scope: "buyer" | "seller";
  view?: "all" | "preparation"; paymentStatuses?: string[] | null; fulfillmentStatuses?: string[] | null;
};

// The entity visible in the panel owns pagination. Its counterpart is fetched
// by exact IDs, so an unrelated second page can never hide a preparation job.
export async function listAllwainActivityForUser(userId: string, input: ActivityInput) {
  requireActivityStorage();
  const prisma = getPrisma();
  if (input.view === "preparation") {
    if (input.scope !== "seller") throw new Error("SELLER_ROLE_REQUIRED");
    const page = await listAllwainOrderPageForUser(userId, { ...input,
      dateFrom: null, dateTo: null, contractDateFrom: input.dateFrom, contractDateTo: input.dateTo,
    });
    const rows = page.items.length ? await prisma.contract.findMany({ where: {
      id: { in: page.items.map(order => order.contractId) }, app: "allwain", operationalArchivedAt: null,
      providerUserId: userId,
    } }) : [];
    if (rows.length !== page.items.length || page.items.some(order => !rows.some(contract => contract.id === order.contractId && contract.requesterUserId === order.buyerUserId))) {
      throw new Error("ACTIVITY_INCOMPLETE");
    }
    const byId = new Map(rows.map(row => [row.id, row]));
    return { contracts: page.items.map(order => ({ ...mapContractPg(byId.get(order.contractId)), imageMeta: order.imageMeta })),
      orders: page.items, pageInfo: page.pageInfo,
      preparationCount: await prisma.allwainOrder.count({ where: { sellerUserId: userId, operationalArchivedAt: null, AND: [allwainPreparationWhere()] } }),
    };
  }
  const page = await getAllwainContractPagePg(userId, input);
  const rows = page.items.length ? await prisma.allwainOrder.findMany({ where: {
    contractId: { in: page.items.map(contract => contract.id) }, operationalArchivedAt: null,
    ...(input.scope === "seller" ? { sellerUserId: userId } : { buyerUserId: userId }),
  } }) : [];
  const matched = rows.filter(order => page.items.some(contract => contract.id === order.contractId && contract.requesterUserId === order.buyerUserId && contract.providerUserId === order.sellerUserId));
  const orders = await allwainOrderDtos(matched);
  const offers = page.items.length ? await prisma.offer.findMany({where:{owner:"allwain",id:{in:page.items.map(contract=>contract.offerId).filter((id):id is string=>Boolean(id))}}}) : [];
  const images = new Map(offers.map(offer=>[offer.id,allwainOfferCardImageMeta(offer as unknown as Offer)]));
  return { contracts: page.items.map(contract => ({ ...contract, imageMeta: orders.find(order => order.contractId === contract.id)?.imageMeta || images.get(contract.offerId || "") || null })), orders, pageInfo: page.pageInfo };
}

export async function getAllwainContractOrderForUser(userId: string, contractId: string) {
  requireActivityStorage();
  const prisma = getPrisma();
  const contract = await prisma.contract.findFirst({ where: { id: contractId, app: "allwain",
    OR: [{ requesterUserId: userId }, { providerUserId: userId }],
  } });
  if (!contract) throw new Error("CONTRACT_NOT_FOUND");
  const order = await prisma.allwainOrder.findUnique({ where: { contractId } });
  if (!order || order.buyerUserId !== contract.requesterUserId || order.sellerUserId !== contract.providerUserId) throw new Error("ORDER_NOT_FOUND");
  return getAllwainOrderForUser(userId, order.id);
}
