import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { getContracts } from "./data.store";
import { hasConfirmedAllwainPurchaseDetails, savedAllwainPurchaseDetails } from "./allwain-purchase-details";

export async function getAllwainPurchaseDetails(userId: string) {
  // Select the newest confirmation before checking its opt-in. An opt-out must
  // never revive an earlier saved destination. Account identity comes from auth.
  const latest = ENV.STORAGE_DRIVER === "postgres"
    ? await (getPrisma() as any).contract.findFirst({
        where: {
          app: "allwain",
          requesterUserId: userId,
          deliveryAddress: { path: ["recipientDetailsVersion"], equals: 1 },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { deliveryAddress: true },
      })
    : getContracts()
        .filter((item) => item.app === "allwain" && item.requesterUserId === userId && hasConfirmedAllwainPurchaseDetails(item.deliveryAddress))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id))[0];
  return { details: savedAllwainPurchaseDetails(latest?.deliveryAddress) };
}
