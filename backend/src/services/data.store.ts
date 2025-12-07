import fs from "fs";
import path from "path";
import { Contract, Lead, Offer, Product, Trade, User } from "../shared/types";

interface Database {
  users: User[];
  offers: Offer[];
  trades: Trade[];
  products: Product[];
  leads: Lead[];
  contracts: Contract[];
}

const DATA_FILE =
  process.env.DATA_FILE || path.join(__dirname, "../../data/database.json");

let cache: Database | null = null;

const defaultUsers: User[] = [
  {
    id: "1",
    name: "Admin Demo",
    email: "admin@newmersive.local",
    passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
    role: "admin",
    createdAt: "2024-01-01T00:00:00.000Z",
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
    ownerUserId: "1",
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
    ownerUserId: "1",
    price: 45,
    meta: { category: "análisis" },
  },
];

const defaultProducts: Product[] = [
  { id: "product-1", name: "Café de especialidad", brand: "Allwain", category: "gourmet" },
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

const defaultLeads: Lead[] = [];
const defaultContracts: Contract[] = [];

const defaultData: Database = {
  users: defaultUsers,
  offers: defaultOffers,
  trades: defaultTrades,
  products: defaultProducts,
  leads: defaultLeads,
  contracts: defaultContracts,
};

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureDefaultAdmin(users: User[]): User[] {
  const hasAdmin = users.some((u) => u.email === defaultUsers[0].email);
  return hasAdmin ? users : [...users, { ...defaultUsers[0] }];
}

function mergeDefaultOffers(offers: Offer[]): Offer[] {
  const missingDefaults = defaultOffers.filter(
    (defaultOffer) => !offers.some((offer) => offer.id === defaultOffer.id)
  );
  return [...offers, ...missingDefaults];
}

function mergeDefaultProducts(products: Product[]): Product[] {
  const missingDefaults = defaultProducts.filter(
    (defaultProduct) => !products.some((product) => product.id === defaultProduct.id)
  );
  return [...products, ...missingDefaults];
}

function loadFromDisk(): Database {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return { ...defaultData };
  }

  const raw = fs.readFileSync(DATA_FILE, "utf8");
  if (!raw) return { ...defaultData };

  const parsed = JSON.parse(raw) as Partial<Database>;
  return {
    users: ensureDefaultAdmin(parsed.users ?? []),
    offers: mergeDefaultOffers(parsed.offers ?? defaultOffers),
    trades: parsed.trades ?? defaultTrades,
    products: mergeDefaultProducts(parsed.products ?? defaultProducts),
    leads: parsed.leads ?? defaultLeads,
    contracts: parsed.contracts ?? defaultContracts,
  };
}

function saveToDisk(data: Database) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getDatabase(): Database {
  if (!cache) {
    cache = loadFromDisk();
  }
  return cache;
}

export function persistDatabase() {
  if (!cache) return;
  saveToDisk(cache);
}

export function resetDatabase(data: Partial<Database>) {
  cache = {
    users: ensureDefaultAdmin(data.users ?? []),
    offers: mergeDefaultOffers(data.offers ?? defaultOffers),
    trades: data.trades ?? defaultTrades,
    products: mergeDefaultProducts(data.products ?? defaultProducts),
    leads: data.leads ?? defaultLeads,
    contracts: data.contracts ?? defaultContracts,
  };
  persistDatabase();
}

export function upsertUser(user: User) {
  const db = getDatabase();
  const existingIndex = db.users.findIndex((u) => u.id === user.id);
  if (existingIndex >= 0) {
    db.users[existingIndex] = user;
  } else {
    db.users.push(user);
  }
  persistDatabase();
}

export function setUsers(users: User[]) {
  const db = getDatabase();
  db.users = users;
  persistDatabase();
}

export function getOffersForOwner(owner: "trueqia" | "allwain") {
  return getDatabase().offers.filter((offer) => offer.owner === owner);
}

export function getTrades() {
  return getDatabase().trades;
}
