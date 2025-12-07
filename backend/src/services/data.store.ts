import fs from "fs";
import path from "path";
import { ENV } from "../config/env";
import { Contract, Lead, Offer, Product, Trade, User } from "../shared/types";

interface Database {
  users: User[];
  offers: Offer[];
  trades: Trade[];
  products: Product[];
  leads: Lead[];
  contracts: Contract[];
}

const DEFAULT_DATA_FILE = path.resolve(__dirname, "../../data/database.json");
const DATA_FILE = ENV.DATA_FILE
  ? path.resolve(process.cwd(), ENV.DATA_FILE)
  : DEFAULT_DATA_FILE;

let cache: Database | null = null;

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
];

const defaultProducts: Product[] = [
  {
    id: "product-1",
    name: "Pack degustación Allwain",
    brand: "Allwain",
    category: "café",
  },
  {
    id: "product-2",
    name: "Kit etiquetas inteligentes",
    brand: "Allwain",
    category: "packaging",
  },
];

const defaultOffers: Offer[] = [
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

function mergeSeed<T extends { id: string }>(current: T[], seed: T[]): T[] {
  const existingIds = new Set(current.map((item) => item.id));
  const merged = [...current];

  for (const item of seed) {
    if (!existingIds.has(item.id)) {
      merged.push(item);
    }
  }

  return merged;
}

function loadDatabase(): Database {
  if (cache) return cache;

  let fileData: Partial<Database> = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      fileData = JSON.parse(raw) as Partial<Database>;
    } catch {
      fileData = {};
    }
  }

  const db: Database = {
    users: mergeSeed(fileData.users ?? [], defaultUsers),
    offers: mergeSeed(fileData.offers ?? [], defaultOffers),
    trades: mergeSeed(fileData.trades ?? [], defaultTrades),
    products: mergeSeed(fileData.products ?? [], defaultProducts),
    leads: fileData.leads ?? defaultLeads,
    contracts: fileData.contracts ?? defaultContracts,
  };

  cache = db;
  return db;
}

export function persistDatabase(db: Database) {
  cache = db;
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function resetDatabase() {
  cache = null;
  persistDatabase(loadDatabase());
}

export function getDatabase(): Database {
  return loadDatabase();
}

export function getUserByEmail(email: string): User | undefined {
  return getDatabase().users.find((u) => u.email === email);
}

export function getUserById(userId: string): User | undefined {
  return getDatabase().users.find((u) => u.id === userId);
}

export function upsertUser(user: User): void {
  const db = getDatabase();
  const index = db.users.findIndex((u) => u.id === user.id);
  if (index >= 0) {
    db.users[index] = user;
  } else {
    db.users.push(user);
  }
  persistDatabase(db);
}

export function setUsers(users: User[]): void {
  const db = getDatabase();
  db.users = users;
  persistDatabase(db);
}

export function getOffersByOwner(owner: "trueqia" | "allwain"): Offer[] {
  return getDatabase().offers.filter((offer) => offer.owner === owner);
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

export function getTradeById(tradeId: string): Trade | undefined {
  return getDatabase().trades.find((trade) => trade.id === tradeId);
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
    throw new Error("TRADE_NOT_FOUND");
  }
  db.trades[index] = trade;
  persistDatabase(db);
  return trade;
}
