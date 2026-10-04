import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../config/env";

export interface AllwainDiscoveryInput {
  query?: string | null; category?: string | null; subcategory?: string | null;
  productKind?: string | null; unit?: string | null; currency?: string | null;
  minPrice?: number | null; maxPrice?: number | null; locationLabel?: string | null;
  dateFrom?: string | null; dateTo?: string | null;
  latitude?: number | null; longitude?: number | null; radiusKm?: number | null;
  responseStatus?: string | null; deliveryChannel?: string | null;
  proposalDeadlineBefore?: string | null; proposalDeadlineAfter?: string | null;
  contractStatuses?: string[] | null;
  contractDateFrom?: string | null; contractDateTo?: string | null;
}

const categories: Record<string, { aliases: string[]; kinds: string[]; words: string[]; subcategories: string[] }> = {
  alimentacion: { aliases: ["alimentacion", "alimentación", "alimentos", "comida", "fruta", "frutas", "verduras", "food"], kinds: ["produce_weight", "liquid_bulk", "food"], words: ["naranja", "mandarina", "verdura", "aceite", "leche"], subcategories: ["frutas", "verduras", "bebidas", "otros"] },
  electrodomesticos: { aliases: ["electrodomesticos", "electrodomésticos", "electrodomestico", "appliances"], kinds: ["appliance"], words: ["lavadora", "secadora", "frigorífico", "frigorifico", "lavavajillas", "microondas", "nevera"], subcategories: ["lavadoras", "frigorificos", "lavavajillas", "otros"] },
  electronica: { aliases: ["electronica", "electrónica", "tecnologia", "tecnología", "electronics"], kinds: ["electronics"], words: ["televisor", "televisión", "ordenador", "portátil", "smartphone", "consola"], subcategories: ["telefonia", "informatica", "television", "otros"] },
  vehiculos: { aliases: ["vehiculos", "vehículos", "coches", "motor", "vehicles"], kinds: ["vehicle"], words: ["coche", "automóvil", "furgoneta", "motocicleta"], subcategories: ["coches", "motos", "otros"] },
  movilidad: { aliases: ["movilidad", "bicicletas", "mobility"], kinds: [], words: ["bicicleta", "patinete"], subcategories: ["bicicletas", "patinetes", "otros"] },
  hogar: { aliases: ["hogar", "casa", "muebles", "home"], kinds: ["appliance"], words: ["sofá", "sofa", "mesa", "silla", "lavadora", "frigorífico", "nevera"], subcategories: ["muebles", "decoracion", "otros"] },
  servicios: { aliases: ["servicios", "servicio", "services"], kinds: ["service"], words: ["reparación", "reparacion", "instalación", "asesoría"], subcategories: ["reparaciones", "instalaciones", "otros"] },
  otros: { aliases: ["otros", "general", "other"], kinds: [], words: [], subcategories: [] },
};
const subcategoryAliases: Record<string, string[]> = { lavadoras: ["lavadoras", "lavadora", "washing machine"], frigorificos: ["frigorificos", "frigoríficos", "frigorifico", "frigorífico", "nevera", "neveras"], lavavajillas: ["lavavajillas"], frutas: ["fruta", "frutas", "citricos", "cítricos"], verduras: ["verdura", "verduras", "hortalizas"], telefonia: ["telefonia", "telefonía", "moviles", "móviles"], informatica: ["informatica", "informática", "ordenadores"], television: ["television", "televisión", "televisores"], decoracion: ["decoracion", "decoración"], reparaciones: ["reparaciones", "reparacion", "reparación"], instalaciones: ["instalaciones", "instalacion", "instalación"] };
const unitAliases: Record<string, string[]> = { kg: ["kg", "kilo", "kilos", "kilogramo", "kilogramos"], g: ["g", "gr", "gramos"], l: ["l", "litro", "litros"], ml: ["ml", "mililitros"], ud: ["ud", "uds", "u", "unidad", "unidades", "pieza", "piezas"], caja: ["caja", "cajas"], pack: ["pack", "paquete", "paquetes"], hora: ["hora", "horas"], servicio: ["servicio", "servicios"], saco: ["saco", "sacos"], rollo: ["rollo", "rollos"], par: ["par", "pares"] };
function aliasesFor(field: string, value: string) { const source = field === "unit" ? unitAliases : field === "subcategory" ? subcategoryAliases : {}; return Object.values(source).find((values) => values.some((alias) => discoveryText(alias) === discoveryText(value))) || [value]; }
export const allwainDiscoveryOptions = {
  categories: Object.entries(categories).map(([value, item]) => ({ value, subcategories: item.subcategories.map((value) => ({ value })) })),
  productKinds: ["produce_weight", "liquid_bulk", "appliance", "electronics", "vehicle", "service", "general", "food", "goods", "other"],
  units: ["kg", "g", "l", "ml", "ud", "caja", "pack", "saco", "rollo", "par", "servicio", "hora"],
  currencies: ["EUR"], sorts: ["newest", "price_asc", "price_desc"],
  capabilities: { offers: { prices: true, locationLabel: true, proximity: false, priceSort: true }, requests: { prices: true, locationLabel: true, proximity: true, priceSort: false }, lists: { prices: true, locationLabel: true, proximity: true, priceSort: false, deliveryChannel: true, proposalDeadline: true }, contracts: { paymentStatus: true, fulfillmentStatus: true }, orders: { paymentStatus: true, fulfillmentStatus: true } },
};
export function isDiscoveryError(error: unknown) { return error instanceof Error && /^(INVALID_DISCOVERY_|INVALID_RESPONSE_STATUS$|INVALID_DELIVERY_CHANNEL$|PRICE_FILTER_REQUIRES_UNIT_CURRENCY$)/.test(error.message); }
export function allwainAgreementStatusFilters(values?: string[] | null) { return values?.length ? [...new Set(values.flatMap((value) => value === "new" ? ["new", "draft", "partially_accepted"] : [value]))] : values; }
export function discoveryText(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
export function discoveryDate(value: string | null | undefined, end = false): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(text)) throw new Error("INVALID_DISCOVERY_DATE");
  const date = new Date(text.length === 10 ? `${text}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : text);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text.slice(0, 10)) throw new Error("INVALID_DISCOVERY_DATE");
  return date;
}
export function validateDiscovery(input: AllwainDiscoveryInput, sort?: string | null) {
  for (const name of ["minPrice", "maxPrice"] as const) if (input[name] != null && (!Number.isFinite(input[name]) || input[name]! < 0)) throw new Error("INVALID_DISCOVERY_PRICE");
  if (input.minPrice != null && input.maxPrice != null && input.minPrice > input.maxPrice) throw new Error("INVALID_DISCOVERY_PRICE");
  if ((input.minPrice != null || input.maxPrice != null || sort === "price_asc" || sort === "price_desc") && (!input.unit || !input.currency)) throw new Error("PRICE_FILTER_REQUIRES_UNIT_CURRENCY");
  if (input.responseStatus && !["any", "none", "active", "selected", "withdrawn", "expired"].includes(input.responseStatus)) throw new Error("INVALID_RESPONSE_STATUS");
  if (input.deliveryChannel && !["pickup", "seller", "carrier", "local_connector"].includes(input.deliveryChannel)) throw new Error("INVALID_DELIVERY_CHANNEL");
  const from = discoveryDate(input.dateFrom), to = discoveryDate(input.dateTo, true);
  if (from && to && from > to) throw new Error("INVALID_DISCOVERY_DATE");
  const contractFrom = discoveryDate(input.contractDateFrom), contractTo = discoveryDate(input.contractDateTo, true);
  if (contractFrom && contractTo && contractFrom > contractTo) throw new Error("INVALID_DISCOVERY_DATE");
  const after = discoveryDate(input.proposalDeadlineAfter), before = discoveryDate(input.proposalDeadlineBefore, true);
  if (after && before && after > before) throw new Error("INVALID_DISCOVERY_DATE");
  const geo = [input.latitude, input.longitude, input.radiusKm];
  if (geo.some((value) => value != null) && (!geo.every((value) => typeof value === "number" && Number.isFinite(value)) || Math.abs(input.latitude!) > 90 || Math.abs(input.longitude!) > 180 || input.radiusKm! <= 0 || input.radiusKm! > 500)) throw new Error("INVALID_DISCOVERY_LOCATION");
}
export function readDiscoveryQuery(query: Record<string, any>): AllwainDiscoveryInput {
  const text = (key: string) => typeof query[key] === "string" ? query[key].trim().slice(0, 160) || null : null;
  const number = (key: string) => { const value = text(key); return value == null ? null : Number(value); };
  return { category: text("category"), subcategory: text("subcategory"), productKind: text("productKind"), unit: text("unit"), currency: text("currency"), minPrice: number("minPrice"), maxPrice: number("maxPrice"), locationLabel: text("locationLabel"), dateFrom: text("dateFrom"), dateTo: text("dateTo"), latitude: number("latitude"), longitude: number("longitude"), radiusKm: number("radiusKm"), responseStatus: text("responseStatus"), deliveryChannel: text("deliveryChannel"), proposalDeadlineBefore: text("proposalDeadlineBefore"), proposalDeadlineAfter: text("proposalDeadlineAfter") };
}
export function categoryWhere(value: string | null | undefined, titleField = "title", jsonField?: string): any {
  if (!value) return {};
  const definition = Object.values(categories).find((item) => item.aliases.some((alias) => discoveryText(alias) === discoveryText(value)));
  const aliases = definition?.aliases || [value];
  return { OR: [...aliases.map((alias) => ({ category: { equals: alias, mode: "insensitive" } })), ...(jsonField ? aliases.map((alias) => ({ [jsonField]: { path: ["category"], equals: alias } })) : []), ...(definition?.kinds || []).map((kind) => ({ productKind: kind })), ...(definition?.words || []).map((word) => ({ [titleField]: { contains: word, mode: "insensitive" } }))] };
}
export function discoveryWhere(input: AllwainDiscoveryInput, options: { titleField?: string; jsonField?: string; priceField?: string; locationField?: string } = {}): any[] {
  const filters: any[] = [categoryWhere(input.category, options.titleField, options.jsonField)];
  for (const name of ["subcategory", "unit"] as const) if (input[name]) filters.push({ OR: aliasesFor(name, input[name]!).flatMap((alias) => [{ [name]: { equals: alias, mode: "insensitive" } }, ...(options.jsonField ? [{ [options.jsonField]: { path: [name], equals: alias } }] : [])]) });
  if (input.productKind) filters.push({ OR: [{ productKind: input.productKind }, ...(options.jsonField ? [{ [options.jsonField]: { path: ["productKind"], equals: input.productKind } }] : [])] });
  if (input.currency) filters.push({ OR: [{ currency: { equals: input.currency, mode: "insensitive" } }, ...(options.jsonField ? [{ [options.jsonField]: { path: ["currency"], equals: input.currency.toUpperCase() } }] : [])] });
  if (input.locationLabel) filters.push({ [options.locationField || "locationLabel"]: { contains: input.locationLabel, mode: "insensitive" } });
  const from = discoveryDate(input.dateFrom), to = discoveryDate(input.dateTo, true);
  if (from || to) filters.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (options.priceField && (input.minPrice != null || input.maxPrice != null)) filters.push({ [options.priceField]: { ...(input.minPrice != null ? { gte: input.minPrice } : {}), ...(input.maxPrice != null ? { lte: input.maxPrice } : {}) } });
  return filters;
}
export function matchesDiscovery(row: any, input: AllwainDiscoveryInput, price?: number | null) {
  const fields = { ...(row.meta || {}), ...(row.extracted || {}), ...row };
  for (const field of ["category", "subcategory", "unit", "currency", "productKind", "locationLabel", "locationLatApprox", "locationLngApprox"]) fields[field] = row[field] ?? row.extracted?.[field] ?? row.meta?.[field];
  const text = `${row.title || row.productName || ""} ${row.description || ""} ${fields.category || ""} ${fields.subcategory || ""} ${fields.locationLabel || ""} ${row.provider?.name || ""} ${row.requester?.name || ""}`;
  if (input.query && !discoveryText(text).includes(discoveryText(input.query))) return false;
  if (input.category) {
    const definition = Object.values(categories).find((item) => item.aliases.some((alias) => discoveryText(alias) === discoveryText(input.category)));
    if (!(definition ? definition.aliases.some((alias) => discoveryText(alias) === discoveryText(fields.category)) || definition.kinds.includes(fields.productKind) || definition.words.some((word) => discoveryText(row.title || row.productName).includes(discoveryText(word))) : discoveryText(fields.category) === discoveryText(input.category))) return false;
  }
  for (const name of ["subcategory", "productKind", "unit", "currency"] as const) if (input[name] && !aliasesFor(name, input[name]!).some((alias) => discoveryText(fields[name] || (name === "currency" ? "EUR" : "")) === discoveryText(alias))) return false;
  if (input.locationLabel && !discoveryText(fields.locationLabel).includes(discoveryText(input.locationLabel))) return false;
  if (input.deliveryChannel && fields.deliveryChannel !== input.deliveryChannel) return false;
  if (input.minPrice != null && (price == null || !Number.isFinite(price) || price < input.minPrice)) return false;
  if (input.maxPrice != null && (price == null || !Number.isFinite(price) || price > input.maxPrice)) return false;
  const date = new Date(row.createdAt).getTime(), from = discoveryDate(input.dateFrom), to = discoveryDate(input.dateTo, true);
  if ((from && date < +from) || (to && date > +to)) return false;
  if (input.radiusKm != null) {
    const lat = fields.locationLatApprox, lng = fields.locationLngApprox;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (discoveryDistance(input.latitude!, input.longitude!, lat, lng) > input.radiusKm) return false;
  }
  return true;
}
export function discoveryDistance(lat: number, lng: number, otherLat: number, otherLng: number) {
  const radians = Math.PI / 180;
  const a = Math.sin((otherLat - lat) * radians / 2) ** 2 + Math.cos(lat * radians) * Math.cos(otherLat * radians) * Math.sin((otherLng - lng) * radians / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function matchesResponse(offer: any, response: string | null | undefined, now = new Date()) {
  if (!response) return true;
  if (response === "any") return Boolean(offer);
  if (response === "none") return !offer;
  if (!offer) return false;
  const status = offer.allwainStatus || "active", expires = offer.proposalExpiresAt || offer.meta?.validUntil;
  if (response === "expired") return status === "active" && expires && +new Date(expires) <= +now;
  if (response === "active") return status === "active" && (!expires || +new Date(expires) > +now);
  return status === response;
}
function stable(value: any): any { return Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] != null && key !== "cursor" && key !== "limit" && key !== "searchOwnerUserIds").map((key) => [key, stable(value[key])])) : value; }
function secret() { const value = ENV.ALLWAIN_AUDIT_HMAC_SECRET || ENV.JWT_SECRET; if (!value && ENV.NODE_ENV !== "test") throw new Error("DISCOVERY_SIGNING_UNAVAILABLE"); return String(value || "isolated-test-discovery-secret"); }
export function discoveryCursor(input: any, dataset: string, actor: string) {
  const binding = createHmac("sha256", secret()).update(JSON.stringify(stable({ dataset, actor, input }))).digest("base64url");
  const encode = (row: any, sort = "newest", dateField = "createdAt") => {
    const payload = Buffer.from(JSON.stringify({ v: 1, binding, id: row.id, value: sort === "newest" ? new Date(row[dateField] || 0).toISOString() : row.price })).toString("base64url");
    return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
  };
  let row: { id: string; value: string | number } | null = null;
  if (input.cursor) {
    try {
      const [payload, signature, extra] = String(input.cursor).split(".");
      const expected = createHmac("sha256", secret()).update(payload).digest(); const supplied = Buffer.from(signature || "", "base64url");
      if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error();
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (parsed.v !== 1 || parsed.binding !== binding || typeof parsed.id !== "string" || !parsed.id) throw new Error();
      row = parsed;
    } catch { throw new Error("INVALID_DISCOVERY_CURSOR"); }
  }
  return { row, encode, where(sort = "newest", dateField = "createdAt") { if (!row) return {}; const field = sort === "newest" ? dateField : "price", value = sort === "newest" ? new Date(row.value) : row.value, comparison = sort === "price_asc" ? "gt" : "lt"; return { OR: [{ [field]: { [comparison]: value } }, { [field]: value, id: { [comparison]: row.id } }] }; } };
}
export function discoveryPage<T extends { id: string; createdAt?: any; price?: number | null }>(rows: T[], input: any, dataset: string, actor: string) {
  validateDiscovery(input, input.sort); const cursor = discoveryCursor(input, dataset, actor), sort = input.sort || "newest";
  const compare = (a: T, b: T) => sort === "price_asc" ? Number(a.price) - Number(b.price) || a.id.localeCompare(b.id) : sort === "price_desc" ? Number(b.price) - Number(a.price) || b.id.localeCompare(a.id) : +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0) || b.id.localeCompare(a.id);
  const sorted = [...rows].sort(compare).filter((row) => !cursor.row || compare(row, { id: cursor.row.id, createdAt: cursor.row.value, price: cursor.row.value } as T) > 0);
  const items = sorted.slice(0, input.limit), hasNextPage = sorted.length > input.limit;
  return { items, pageInfo: { hasNextPage, nextCursor: hasNextPage && items.length ? cursor.encode(items.at(-1), sort) : null } };
}
