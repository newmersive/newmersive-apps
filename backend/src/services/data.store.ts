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

const passwordResetTokens = new Map<string, { userId: string; token: string; expiresAt: number }>();

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
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
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
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
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
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
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
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "user",
    createdAt: "2024-01-04T00:00:00.000Z",
    avatarUrl: "https://i.pravatar.cc/300?img=11",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-DEMO-PROD",
  },
  // DEMO ONLY
  {
    id: "5",
    name: "Demo Videographer",
    email: "demo-video@trueqia.local",
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "user",
    createdAt: "2024-01-05T00:00:00.000Z",
    avatarUrl: "https://i.pravatar.cc/300?img=12",
    tokens: 0,
    allwainBalance: 0,
    sponsorCode: "SPN-DEMO-VID",
  },
  // DEMO ONLY
  {
    id: "6",
    name: "Demo Strategist",
    email: "demo-strategy@trueqia.local",
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
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
    price: 45,
    tokens: 150,
    meta: { category: "alianzas" },
  },
];

const defaultTrades: Trade[] = [
  {
    id: "trade-1",
    offerId: "offer-trueqia-1",
    fromUserId: "1",
    toUserId: "1",
    tokens: 150,
    status: "pending",
    createdAt: "2024-02-01T12:00:00.000Z",
  },
  {
    id: "trade-2",
    offerId: "offer-allwain-1",
    fromUserId: "1",
    toUserId: "1",
    tokens: 90,
    status: "accepted",
    createdAt: "2024-02-10T15:30:00.000Z",
    resolvedAt: "2024-02-11T10:00:00.000Z",
  },
];

const defaultLeads: Lead[] = [
  {
    id: "lead-1",
    name: "Café de barrio",
    email: "hola@cafedebarrio.local",
    source: "landing-allwain",
    message: "Buscamos pruebas rápidas con QR nutricional.",
    status: "contacted",
    createdAt: "2024-01-04T00:00:00.000Z",
  },
  {
    id: "lead-2",
    name: "Productora creativa",
    email: "hola@productora.tv",
    source: "trueqia-demo",
    message: "Nos interesa un piloto de marketplace colaborativo.",
    status: "new",
    createdAt: "2024-01-05T00:00:00.000Z",
  },
];

const defaultContracts: Contract[] = [
  {
    id: "contract-1",
    title: "Piloto Allwain x tienda local",
    status: "draft",
    counterparties: ["ops@allwain.app", "hola@cafedebarrio.local"],
    valueTokens: 250,
    createdAt: "2024-01-06T00:00:00.000Z",
    notes: "Contrato simulado en memoria hasta migrar a PostgreSQL.",
  },
];

function getDefaultDatabase(): Database {
  return {
    users: [...defaultUsers],
    offers: [...defaultOffers],
    trades: [...defaultTrades],
    products: [...defaultProducts],
    leads: [...defaultLeads],
    contracts: [...defaultContracts],
  };
}

function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function mergeById<T extends { id: string }>(defaults: T[], existing: T[]): T[] {
  const map = new Map<string, T>();
  defaults.forEach((item) => map.set(item.id, item));
  existing.forEach((item) => map.set(item.id, { ...map.get(item.id), ...item } as T));
  return Array.from(map.values());
}

function loadDatabase(): Database {
  if (cache) return cache;

  let data: Database;
  if (fs.existsSync(DATA_FILE)) {
    const content = fs.readFileSync(DATA_FILE, "utf-8");
    data = JSON.parse(content) as Database;
  } else {
    data = getDefaultDatabase();
  }

  data = {
    users: mergeById(defaultUsers, data.users || []),
    offers: mergeById(defaultOffers, data.offers || []),
    trades: mergeById(defaultTrades, data.trades || []),
    products: mergeById(defaultProducts, data.products || []),
    leads: mergeById(defaultLeads, data.leads || []),
    contracts: mergeById(defaultContracts, data.contracts || []),
  };

  persistDatabase(data);
  return data;
}

export function persistDatabase(data: Database) {
  ensureDirExists(DATA_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  cache = data;
}

export function resetDatabase() {
  const defaults = getDefaultDatabase();
  persistDatabase(defaults);
}

export function getDatabase(): Database {
  if (!cache) {
    cache = loadDatabase();
  }
  return cache as Database;
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

export function getUserByEmail(email: string): User | undefined {
  return getDatabase().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserBySponsorCode(code?: string): User | undefined {
  if (!code) return undefined;
  return getDatabase().users.find((u) => u.sponsorCode === code);
}

function ensureDemoOffers(offers: Offer[]): Offer[] {
  if (ENV.DEMO_MODE !== "true") return offers;
  if (offers.length >= 5) return offers;

  const existingIds = new Set(offers.map((o) => o.id));
  const augmented = [...offers];

  for (const offer of demoTrueqiaOffers) {
    if (augmented.length >= 5) break;
    if (!existingIds.has(offer.id)) {
      augmented.push(offer);
    }
  }

  return augmented;
}

export function getOffersByOwner(owner: "trueqia" | "allwain"): Offer[] {
  const offers = getDatabase().offers.filter((o) => o.owner === owner);
  return owner === "trueqia" ? ensureDemoOffers(offers) : offers;
}

export function getTrades(): Trade[] {
  return getDatabase().trades;
}

export function getUserProfile(userId: string): User | undefined {
  return getDatabase().users.find((u) => u.id === userId);
}

export function savePasswordResetToken(userId: string, token: string, ttlMinutes = 30) {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  passwordResetTokens.set(userId, { userId, token, expiresAt });
}

export function getPasswordResetToken(userId: string) {
  const entry = passwordResetTokens.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    passwordResetTokens.delete(userId);
    return undefined;
  }
  return entry.token;
}

export function deletePasswordResetToken(userId: string) {
  passwordResetTokens.delete(userId);
}
