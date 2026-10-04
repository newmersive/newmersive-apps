import { Prisma } from "@prisma/client";
import { discoveryCursor } from "./allwain-discovery";

export type ConnectorLogisticsPageInput = { limit?: number; cursor?: string | null; scope?: "all" | "mine" | "available" };
type Connector = { userId?: string; available?: boolean; radiusKm?: number; locationLabel?: string | null; locationLatApprox?: number | null; locationLngApprox?: number | null };
const validPoint = (lat: unknown, lng: unknown) => typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
const zoneTokens = (label: unknown) => String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3 && !["zona", "actual", "entrega", "recogida"].includes(token));

export function connectorLogisticsQuery(userId: string, connector: Connector, input: ConnectorLogisticsPageInput = {}) {
  const limit = Math.min(100, Math.max(1, Number.isFinite(input.limit) ? Math.trunc(input.limit!) : 30));
  const scope = input.scope || "all";
  if (!["all", "mine", "available"].includes(scope)) throw new Error("INVALID_LOGISTICS_SCOPE");
  const binding = { scope, available: Boolean(connector.available), radiusKm: connector.radiusKm || 5, locationLabel: connector.locationLabel || "", latitude: connector.locationLatApprox ?? null, longitude: connector.locationLngApprox ?? null, cursor: input.cursor };
  const cursor = discoveryCursor(binding, "connector-logistics", userId);
  const has = (prefix: "pickup" | "delivery") => Prisma.sql`${Prisma.raw(`a."${prefix}LatApprox"`)} BETWEEN -90 AND 90 AND ${Prisma.raw(`a."${prefix}LngApprox"`)} BETWEEN -180 AND 180`;
  const distance = (prefix: "pickup" | "delivery") => Prisma.sql`ROUND((6371 * 2 * ASIN(SQRT(LEAST(1.0, POWER(SIN(RADIANS(${Prisma.raw(`a."${prefix}LatApprox"`)} - ${connector.locationLatApprox}) / 2), 2) + COS(RADIANS(${connector.locationLatApprox})) * COS(RADIANS(${Prisma.raw(`a."${prefix}LatApprox"`)})) * POWER(SIN(RADIANS(${Prisma.raw(`a."${prefix}LngApprox"`)} - ${connector.locationLngApprox}) / 2), 2)))))::numeric,1) <= ${connector.radiusKm || 5}`;
  const tokens = zoneTokens(connector.locationLabel);
  const zoneMatch = tokens.length ? Prisma.sql`EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(translate(lower(COALESCE(a."pickupZone",'') || ' ' || COALESCE(a."deliveryZone",'')), 'áàäâãåéèëêíìïîóòöôõúùüûçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+')) token WHERE token = ANY(${tokens}::text[]))` : Prisma.sql`FALSE`;
  const nearby = validPoint(connector.locationLatApprox, connector.locationLngApprox)
    ? Prisma.sql`CASE WHEN (${has("pickup")}) OR (${has("delivery")}) THEN (NOT COALESCE((${has("pickup")}),FALSE) OR (${distance("pickup")})) AND (NOT COALESCE((${has("delivery")}),FALSE) OR (${distance("delivery")})) ELSE (${zoneMatch}) END`
    : zoneMatch;
  const mine = Prisma.sql`a."connectorUserId" = ${userId}`;
  const eligible = connector.available ? Prisma.sql`a."connectorUserId" IS NULL AND a.status = 'open' AND o."connectorUserId" IS NULL AND o."paymentStatus" IN ('paid','partially_refunded','refund_pending') AND o."fulfillmentStatus" IN ('pending','preparing','ready') AND (${nearby})` : Prisma.sql`FALSE`;
  const access = scope === "mine" ? mine : scope === "available" ? eligible : Prisma.sql`(${mine}) OR (${eligible})`;
  const before = cursor.row ? Prisma.sql`AND (a."createdAt" < ${new Date(cursor.row.value)} OR (a."createdAt" = ${new Date(cursor.row.value)} AND a.id < ${cursor.row.id}))` : Prisma.sql``;
  return { limit, cursor, where: Prisma.sql`o."operationalArchivedAt" IS NULL AND o."deliveryChannel" = 'local_connector' AND (${access})`, before };
}

/** SQL access and radius predicates run before the LIMIT; no first-250 blind spot. */
export async function connectorLogisticsRows(prisma: any, userId: string, connector: Connector, input: ConnectorLogisticsPageInput = {}, exactId?: string) {
  const query = connectorLogisticsQuery(userId, connector, input);
  const rows: any[] = await prisma.$queryRaw(Prisma.sql`SELECT a.*, o."buyerUserId", o."sellerUserId" FROM "AllwainDeliveryAssignment" a JOIN "AllwainOrder" o ON o.id = a."orderId" WHERE ${query.where} ${exactId ? Prisma.sql`AND a.id = ${exactId}` : query.before} ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${exactId ? 1 : query.limit + 1}`);
  const hasNextPage = !exactId && rows.length > query.limit;
  const items = rows.slice(0, exactId ? 1 : query.limit);
  return { items, pageInfo: { hasNextPage, nextCursor: hasNextPage && items.length ? query.cursor.encode(items.at(-1)) : null } };
}
