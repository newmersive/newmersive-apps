import fs from "fs";
import path from "path";
import { ENV } from "../config/env";
import {
  AllwainSavingTransaction,
  Contract,
  ContractStatus,
  Lead,
  OrderGroup,
  Offer,
  Product,
  ReferralStat,
  Trade,
  TradeStatus,
  User,
} from "../shared/types";

interface Database {
  users: User[];
  offers: Offer[];
  trades: Trade[];
  products: Product[];
  leads: Lead[];
  contracts: Contract[];
  referralStats: ReferralStat[];
  allwainSavings: AllwainSavingTransaction[];
  orderGroups: OrderGroup[];
}

interface PasswordResetToken {
  token: string;
  userId: string;
  expiresAt: number;
}

const DEFAULT_DATA_FILE = path.resolve(__dirname, "../../data/database.json");
const DATA_FILE = ENV.DATA_FILE
  ? path.resolve(process.cwd(), ENV.DATA_FILE)
  : DEFAULT_DATA_FILE;

let cache: Database | null = null;
const passwordResetTokens: PasswordResetToken[] = [];

/**
 * =========================
 * DATOS POR DEFECTO
 * =========================
 */

const defaultUsers: User[] = [
  {
    id: "1",
    name: "Admin Demo",
    email: "admin@newmersive.local",
    passwordHash:
      "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "admin",
    createdAt: "2024-01-01T00:00:00.000Z",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-ADMIN",
  },
  {
    id: "2",
    name: "TrueQIA Demo",
    email: "trueqia-demo@newmersive.app",
    passwordHash:
      "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "user",
    createdAt: "2024-01-02T00:00:00.000Z",
    avatarUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=trueqia-demo",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-TRUEQIA",
  },
  {
    id: "3",
    name: "Allwain Ops",
    email: "ops@allwain.app",
    passwordHash:
      "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "company",
    createdAt: "2024-01-03T00:00:00.000Z",
    avatarUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=allwain",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-ALLWAIN",
  },
  // DEMO ONLY
  {
    id: "4",
    name: "Demo Producer",
    email: "demo-producer@trueqia.local",
    passwordHash:
      "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "user",
    createdAt: "2024-01-04T00:00:00.000Z",
    avatarUrl: "https://i.pravatar.cc/300?img=11",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-DEMO-PROD",
  },
  {
    id: "5",
    name: "Demo Videographer",
    email: "demo-video@trueqia.local",
    passwordHash:
      "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "user",
    createdAt: "2024-01-05T00:00:00.000Z",
    avatarUrl: "https://i.pravatar.cc/300?img=12",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-DEMO-VID",
  },
  {
    id: "6",
    name: "Demo Strategist",
    email: "demo-strategy@trueqia.local",
    passwordHash:
      "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "user",
    createdAt: "2024-01-06T00:00:00.000Z",
    avatarUrl: "https://i.pravatar.cc/300?img=13",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-DEMO-STR",
  },
];

const defaultProducts: Product[] = [
  {
    id: "product-allwain-1",
    name: "Pack degustación Allwain",
    description:
      "Selección de granos de especialidad con ficha sensorial y QR nutricional.",
    brand: "Allwain",
    // Product no define precio, usamos extra field para demo
    priceTokens: 35 as any,
    category: "café",
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93",
  },
  {
    id: "product-allwain-2",
    name: "Kit etiquetas inteligentes",
    description:
      "Lote demo de etiquetas inteligentes para trazabilidad y recompensas.",
    brand: "Allwain",
    priceTokens: 55 as any,
    category: "packaging",
    imageUrl: "https://images.unsplash.com/photo-1497534446932-c925b458314e",
  },
  {
    id: "product-1",
    name: "Café de especialidad",
    description: "Café de especialidad demo para el catálogo Allwain.",
    brand: "Allwain",
    priceTokens: 0 as any,
    category: "gourmet",
    imageUrl: "",
  },
];

// Ofertas demo TrueQIA
const demoTrueqiaOffers: Offer[] = [
  {
    id: "offer-trueqia-1",
    title: "Trueque: edición de video por fotografías",
    description:
      "Producción y montaje completo de video a cambio de una sesión de fotos del evento.",
    owner: "trueqia",
    ownerUserId: "1",
    tokens: 80,
    meta: { category: "creativos" },
  },
  {
    id: "offer-trueqia-2",
    title: "Mentoría IA ↔ diseño de marca",
    description:
      "Sesión 1 a 1 para integrar IA en flujos de trabajo a cambio de un kit de branding sencillo.",
    owner: "trueqia",
    ownerUserId: "1",
    tokens: 120,
    meta: { category: "formación" },
  },
  {
    id: "offer-trueqia-demo-1",
    title: "Storyboard exprés por fotos del backstage",
    description:
      "Bosquejo de guion visual en 48h a cambio de un paquete de fotografías del rodaje.",
    owner: "trueqia",
    ownerUserId: "4",
    tokens: 10,
    meta: { category: "preproducción" },
  },
  {
    id: "offer-trueqia-demo-2",
    title: "Set de reels verticales",
    description:
      "Edición de 3 reels verticales listos para publicar a cambio de testimonios grabados.",
    owner: "trueqia",
    ownerUserId: "5",
    tokens: 20,
    meta: { category: "social" },
  },
  {
    id: "offer-trueqia-demo-3",
    title: "Copy + pauta básica",
    description:
      "Redacción y configuración inicial de campaña con IA a cambio de assets del producto.",
    owner: "trueqia",
    ownerUserId: "6",
    tokens: 50,
    meta: { category: "growth" },
  },
];

const defaultOffers: Offer[] = [
  ...demoTrueqiaOffers,
  {
    id: "offer-allwain-1",
    title: "Compra de lote café de especialidad",
    description:
      "Pack degustación 3 orígenes con envío 24h y puntos Allwain acumulados.",
    owner: "allwain",
    ownerUserId: "3",
    price: 30,
    productId: "product-1",
    meta: { category: "gourmet" },
  },
  {
    id: "offer-allwain-2",
    title: "Comisión: análisis de etiquetas",
    description:
      "Revisión bajo demanda del QR nutricional y sugerencias de mejora para tu línea de producto.",
    owner: "allwain",
    ownerUserId: "3",
    price: 45,
    meta: { category: "análisis" },
  },
  {
    id: "offer-allwain-3",
    title: "Bundle Allwain + TrueQIA",
    description:
      "Tokens conjuntos para lanzar campaña conjunta con catálogo Allwain y activaciones TrueQIA.",
    owner: "allwain",
    ownerUserId: "3",
    tokens: 150,
    price: 45,
    meta: { category: "alianzas" },
  },
];

const defaultTrades: Trade[] = [
  {
    id: "trade-1",
    offerId: "offer-trueqia-1",
    fromUserId: "1",
    toUserId: "2",
    tokens: 150,
    status: "pending",
    createdAt: "2024-02-01T12:00:00.000Z",
  },
  {
    id: "trade-2",
    offerId: "offer-allwain-1",
    fromUserId: "3",
    toUserId: "2",
    tokens: 90,
    status: "accepted",
    createdAt: "2024-02-10T15:30:00.000Z",
    resolvedAt: "2024-02-11T10:00:00.000Z",
  },
];

const defaultLeads: Lead[] = [];
const defaultContracts: Contract[] = [];
const defaultReferralStats: ReferralStat[] = [];
const defaultAllwainSavings: AllwainSavingTransaction[] = [];
const defaultOrderGroups: OrderGroup[] = [];

const defaultDatabase: Database = {
  users: defaultUsers,
  offers: defaultOffers,
  trades: defaultTrades,
  products: defaultProducts,
  leads: defaultLeads,
  contracts: defaultContracts,
  referralStats: defaultReferralStats,
  allwainSavings: defaultAllwainSavings,
  orderGroups: defaultOrderGroups,
};

/**
 * =========================
 * UTILIDADES
 * =========================
 */

function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function mergeById<T extends { id: string }>(
  defaults: T[],
  existing: T[] = []
): T[] {
  const map = new Map<string, T>();
  defaults.forEach((item) => map.set(item.id, item));
  existing.forEach((item) =>
    map.set(item.id, { ...(map.get(item.id) as T), ...item })
  );
  return Array.from(map.values());
}

function loadDatabase(): Database {
  if (cache) return cache;

  let data: Partial<Database> = {};

  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      data = JSON.parse(content) as Partial<Database>;
    } catch {
      data = {};
    }
  }

  const merged: Database = {
    users: mergeById(defaultUsers, data.users ?? []),
    offers: mergeById(defaultOffers, data.offers ?? []),
    trades: mergeById(defaultTrades, data.trades ?? []),
    products: mergeById(defaultProducts, data.products ?? []),
    leads: mergeById(defaultLeads, data.leads ?? []),
    contracts: mergeById(defaultContracts, data.contracts ?? []),
    referralStats: mergeById(defaultReferralStats, data.referralStats ?? []),
    allwainSavings: mergeById(
      defaultAllwainSavings,
      data.allwainSavings ?? []
    ),
    orderGroups: mergeById(defaultOrderGroups, data.orderGroups ?? []),
  };

  persistDatabase(merged);
  return merged;
}

function saveDatabase(db: Database): void {
  ensureDirExists(DATA_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
  cache = db;
}

/**
 * =========================
 * API PÚBLICA DB
 * =========================
 */

export function getDatabase(): Database {
  if (!cache) {
    cache = loadDatabase();
  }
  return cache;
}

export function persistDatabase(db?: Database) {
  const current = db ?? getDatabase();
  saveDatabase(current);
}

export function resetDatabase() {
  saveDatabase({ ...defaultDatabase });
}

/**
 * =========================
 * USERS
 * =========================
 */

export function getUsers(): User[] {
  return getDatabase().users;
}

export function getUserById(id: string): User | undefined {
  return getDatabase().users.find((u) => u.id === id);
}

export function getUserByEmail(email: string): User | undefined {
  return getDatabase().users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
}

export function getUserBySponsorCode(code?: string): User | undefined {
  if (!code) return undefined;
  return getDatabase().users.find((u) => u.sponsorCode === code);
}

// alias usado en allwain.service
export function findUserBySponsorCode(code: string): User | undefined {
  return getUserBySponsorCode(code);
}

export function upsertUser(user: User) {
  const db = getDatabase();
  const index = db.users.findIndex((u) => u.id === user.id);
  if (index === -1) {
    db.users.push(user);
  } else {
    db.users[index] = { ...db.users[index], ...user };
  }
  persistDatabase(db);
}

export function setUsers(users: User[]) {
  const db = getDatabase();
  db.users = users;
  persistDatabase(db);
}

/**
 * =========================
 * PRODUCTS
 * =========================
 */

export function getProducts(): Product[] {
  return getDatabase().products;
}

export function getProductById(id: string): Product | undefined {
  return getDatabase().products.find((p) => p.id === id);
}

export function getProductByEan(ean: string): Product | undefined {
  return getDatabase().products.find((p) => p.ean === ean);
}

/**
 * =========================
 * OFFERS & TRADES
 * =========================
 */

export function getOffersByOwner(owner: "trueqia" | "allwain"): Offer[] {
  return getDatabase().offers.filter((o) => o.owner === owner);
}

export function getOfferById(id: string): Offer | undefined {
  return getDatabase().offers.find((o) => o.id === id);
}

export function addOffer(offer: Offer): Offer {
  const db = getDatabase();
  db.offers.push(offer);
  persistDatabase(db);
  return offer;
}

export function getTrades(): Trade[] {
  return getDatabase().trades;
}

export function getTradeById(id: string): Trade | undefined {
  return getDatabase().trades.find((t) => t.id === id);
}

export function addTrade(trade: Trade): Trade {
  const db = getDatabase();
  db.trades.push(trade);
  persistDatabase(db);
  return trade;
}

export function updateTrade(trade: Trade): Trade {
  const db = getDatabase();
  const index = db.trades.findIndex((t) => t.id === trade.id);
  if (index === -1) {
    db.trades.push(trade);
  } else {
    db.trades[index] = { ...db.trades[index], ...trade };
  }
  persistDatabase(db);
  return trade;
}

export function saveTrade(trade: Trade): Trade {
  // por compatibilidad con versiones anteriores
  return updateTrade(trade);
}

export function updateTradeStatus(
  tradeId: string,
  status: TradeStatus,
  _contractId?: string
): Trade | null {
  const trade = getTradeById(tradeId);
  if (!trade) return null;

  const updated: Trade = {
    ...trade,
    status,
    resolvedAt:
      status === "pending" ? undefined : new Date().toISOString(),
  };

  return updateTrade(updated);
}

/**
 * =========================
 * LEADS
 * =========================
 */

export function addLead(lead: Lead): Lead {
  const db = getDatabase();
  db.leads.push(lead);
  persistDatabase(db);
  return lead;
}

export function getLeads(): Lead[] {
  return getDatabase().leads;
}

/**
 * =========================
 * ORDER GROUPS (Allwain pedidos grupales)
 * =========================
 */

export function getOrderGroups(): OrderGroup[] {
  return getDatabase().orderGroups;
}

export function getOrderGroupById(id: string): OrderGroup | undefined {
  return getDatabase().orderGroups.find((og) => og.id === id);
}

export function addOrderGroup(orderGroup: OrderGroup): OrderGroup {
  const db = getDatabase();
  db.orderGroups.push(orderGroup);
  persistDatabase(db);
  return orderGroup;
}

export function updateOrderGroup(orderGroup: OrderGroup): OrderGroup {
  const db = getDatabase();
  const index = db.orderGroups.findIndex((og) => og.id === orderGroup.id);
  if (index === -1) {
    throw new Error("ORDER_GROUP_NOT_FOUND");
  }
  db.orderGroups[index] = orderGroup;
  persistDatabase(db);
  return orderGroup;
}

/**
 * =========================
 * CONTRACTS
 * =========================
 */

export function createContract(
  contract: Omit<Contract, "createdAt" | "id"> & Partial<Contract>
): Contract {
  const db = getDatabase();
  const newContract: Contract = {
    id: contract.id ?? `contract-${Date.now()}`,
    createdAt: contract.createdAt ?? new Date().toISOString(),
    status: contract.status ?? ("draft" as ContractStatus),
    ...contract,
  };
  db.contracts.push(newContract);
  persistDatabase(db);
  return newContract;
}

export function getContractById(id: string): Contract | undefined {
  return getDatabase().contracts.find((c) => c.id === id);
}

export function updateContractStatus(
  id: string,
  status: ContractStatus
): Contract | null {
  const db = getDatabase();
  const index = db.contracts.findIndex((c) => c.id === id);
  if (index === -1) return null;

  db.contracts[index] = {
    ...db.contracts[index],
    status,
    updatedAt: new Date().toISOString(),
  };

  persistDatabase(db);
  return db.contracts[index];
}

/**
 * =========================
 * REFERRALS / SPONSORS (Allwain)
 * =========================
 */

export function getReferralStats(): ReferralStat[] {
  return getDatabase().referralStats;
}

export function getReferralStat(
  userId: string,
  invitedUserId: string
): ReferralStat | undefined {
  return getDatabase().referralStats.find(
    (stat) => stat.userId === userId && stat.invitedUserId === invitedUserId
  );
}

export function getReferralStatsBySponsor(userId: string): ReferralStat[] {
  return getDatabase().referralStats.filter((stat) => stat.userId === userId);
}

export function upsertReferralStat(stat: ReferralStat): ReferralStat {
  const db = getDatabase();
  const index = db.referralStats.findIndex(
    (item) =>
      item.userId === stat.userId &&
      item.invitedUserId === stat.invitedUserId
  );

  if (index === -1) {
    db.referralStats.push(stat);
  } else {
    db.referralStats[index] = { ...db.referralStats[index], ...stat };
  }

  persistDatabase(db);
  return stat;
}

export function addAllwainSavingTransaction(
  transaction: AllwainSavingTransaction
): AllwainSavingTransaction {
  const db = getDatabase();
  db.allwainSavings.push(transaction);
  persistDatabase(db);
  return transaction;
}

export function getAllwainSavingTransactions(): AllwainSavingTransaction[] {
  return getDatabase().allwainSavings;
}

/**
 * =========================
 * PASSWORD RESET TOKENS
 * =========================
 */

export function savePasswordResetToken(
  token: string,
  userId: string,
  expiresAt: number
) {
  // limpiamos caducados y duplicados del mismo user
  const now = Date.now();
  for (let i = passwordResetTokens.length - 1; i >= 0; i--) {
    const t = passwordResetTokens[i];
    if (t.expiresAt <= now || t.userId === userId) {
      passwordResetTokens.splice(i, 1);
    }
  }
  passwordResetTokens.push({ token, userId, expiresAt });
}

export function getPasswordResetToken(
  token: string
): PasswordResetToken | undefined {
  const now = Date.now();
  const record = passwordResetTokens.find((t) => t.token === token);
  if (!record) return undefined;
  if (record.expiresAt <= now) {
    deletePasswordResetToken(token);
    return undefined;
  }
  return record;
}

export function deletePasswordResetToken(token: string) {
  const index = passwordResetTokens.findIndex((t) => t.token === token);
  if (index >= 0) {
    passwordResetTokens.splice(index, 1);
  }
}


