import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { getDatabase } from "./data.store";

export interface AdminDashboardTotals {
  users: number;
  offers: number;
  trades: number;
  products: number;
  leadsLocal: number;
  leadsGlobal: number;
  contracts: number;
  orderGroups: number;
  referralStats: number;
  allwainSavings: number;
  allwainScanRequests: number;
}

export async function getAdminDashboardTotals(): Promise<AdminDashboardTotals> {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    const db = getDatabase();
    return {
      users: db.users.length,
      offers: db.offers.length,
      trades: db.trades.length,
      products: db.products.length,
      leadsLocal: db.leads.length,
      leadsGlobal: db.leadsGlobal.length,
      contracts: db.contracts.length,
      orderGroups: db.orderGroups.length,
      referralStats: db.referralStats.length,
      allwainSavings: db.allwainSavings.length,
      allwainScanRequests: db.allwainScanRequests.length,
    };
  }

  const prisma = getPrisma();
  const [
    users,
    offers,
    trades,
    products,
    leadsLocal,
    leadsGlobal,
    contracts,
    orderGroups,
    referralStats,
    allwainSavings,
    allwainScanRequests,
  ] = await prisma.$transaction([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.offer.count(),
    prisma.trade.count(),
    prisma.product.count(),
    prisma.lead.count(),
    prisma.leadGlobal.count(),
    prisma.contract.count(),
    prisma.orderGroup.count(),
    prisma.referralStat.count(),
    prisma.allwainSavingTransaction.count(),
    prisma.allwainScanRequest.count(),
  ]);

  return {
    users,
    offers,
    trades,
    products,
    leadsLocal,
    leadsGlobal,
    contracts,
    orderGroups,
    referralStats,
    allwainSavings,
    allwainScanRequests,
  };
}
