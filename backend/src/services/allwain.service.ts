import {
  addAllwainSavingTransaction,
  findUserBySponsorCode,
  getReferralStat,
  getReferralStats,
  getReferralStatsBySponsor,
  getUserById,
  upsertReferralStat,
  upsertUser,
} from "./data.store";
import {
  AllwainSavingTransaction,
  ReferralMonthlyHistory,
  ReferralStat,
} from "../shared/types";

const ALLWAIN_FEE_PERCENTAGE = 0.1;
const SPONSOR_SHARE_OF_FEE = 0.5;

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function registerAllwainSaving(
  userId: string,
  amount: number
): {
  transaction: AllwainSavingTransaction;
  sponsorCommission?: number;
  sponsorId?: string;
  referralStat?: ReferralStat;
} {
  if (amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const now = new Date();
  const transaction: AllwainSavingTransaction = {
    id: generateId("saving"),
    userId,
    amount,
    createdAt: now.toISOString(),
  };

  addAllwainSavingTransaction(transaction);

  const user = getUserById(userId);
  if (!user || !user.referredByCode) {
    return { transaction };
  }

  const sponsor = findUserBySponsorCode(user.referredByCode);
  if (!sponsor) {
    return { transaction };
  }

  const allwainFee = amount * ALLWAIN_FEE_PERCENTAGE;
  const sponsorCommission = allwainFee * SPONSOR_SHARE_OF_FEE;

  const stat = updateReferralStat({
    sponsorId: sponsor.id,
    invitedUserId: user.id,
    saved: amount,
    commission: sponsorCommission,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  sponsor.allwainBalance = (sponsor.allwainBalance ?? 0) + sponsorCommission;
  upsertUser(sponsor);

  return {
    transaction,
    sponsorCommission,
    sponsorId: sponsor.id,
    referralStat: stat,
  };
}

export function getSponsorSummary(userId: string) {
  const stats = getReferralStatsBySponsor(userId);
  const invitedCount = stats.length;
  const totalSaved = stats.reduce((acc, stat) => acc + stat.totalSavedByInvited, 0);
  const totalCommission = stats.reduce(
    (acc, stat) => acc + stat.commissionEarned,
    0
  );

  const monthlyHistoryMap = new Map<string, ReferralMonthlyHistory>();
  stats.forEach((stat) => {
    stat.monthlyHistory.forEach((item) => {
      const key = `${item.year}-${item.month}`;
      const existing = monthlyHistoryMap.get(key);
      if (!existing) {
        monthlyHistoryMap.set(key, { ...item });
      } else {
        existing.saved += item.saved;
        existing.commission += item.commission;
      }
    });
  });

  const user = getUserById(userId);

  return {
    invitedCount,
    totalSaved,
    totalCommission,
    balance: user?.allwainBalance ?? 0,
    monthlyHistory: Array.from(monthlyHistoryMap.values()).sort((a, b) => {
      if (a.year === b.year) return a.month - b.month;
      return a.year - b.year;
    }),
    referrals: stats,
  };
}

export function listAllSponsorStats() {
  return getReferralStats().map((stat) => {
    const sponsor = getUserById(stat.userId);
    const invited = getUserById(stat.invitedUserId);
    return {
      ...stat,
      sponsorName: sponsor?.name,
      invitedName: invited?.name,
    };
  });
}

function updateReferralStat(params: {
  sponsorId: string;
  invitedUserId: string;
  saved: number;
  commission: number;
  month: number;
  year: number;
}): ReferralStat {
  const existing =
    getReferralStat(params.sponsorId, params.invitedUserId) ||
    createEmptyReferralStat(params.sponsorId, params.invitedUserId);

  existing.totalSavedByInvited += params.saved;
  existing.commissionEarned += params.commission;

  const monthlyEntry = existing.monthlyHistory.find(
    (m) => m.month === params.month && m.year === params.year
  );

  if (monthlyEntry) {
    monthlyEntry.saved += params.saved;
    monthlyEntry.commission += params.commission;
  } else {
    existing.monthlyHistory.push({
      month: params.month,
      year: params.year,
      saved: params.saved,
      commission: params.commission,
    });
  }

  return upsertReferralStat(existing);
}

function createEmptyReferralStat(
  sponsorId: string,
  invitedUserId: string
): ReferralStat {
  return {
    id: generateId("referral"),
    userId: sponsorId,
    invitedUserId,
    totalSavedByInvited: 0,
    commissionEarned: 0,
    monthlyHistory: [],
  };
}
