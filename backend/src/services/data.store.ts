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

const seedDatabase: Database = {
  users: [
    {
      id: "1",
      name: "Admin Demo",
      email: "admin@newmersive.local",
      passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
      role: "admin",
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "2",
      name: "TrueQIA Demo",
      email: "trueqia-demo@newmersive.app",
      passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
      role: "user",
      createdAt: "2024-01-02T00:00:00.000Z",
      avatarUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=trueqia-demo",
    },
    {
      id: "3",
      name: "Allwain Ops",
      email: "ops@allwain.app",
      passwordHash: "$2a$10$Ljb/uUGMma.UWeFZ1lok6ubGIi2wZoa8dhTAZur6gvVuLMHAuEkTW",
      role: "company",
      createdAt: "2024-01-03T00:00:00.000Z",
      avatarUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=allwain",
    },
  ],
  offers: [
    {
      id: "offer-trueqia-1",
      title: "Trueque: edición de video por fotografías",
      description:
        "Producción y montaje completo de video a cambio de una sesión de fotos del evento.",
      tokens: 80,
      owner: "trueqia",
      category: "creativos",
    },
    {
      id: "offer-trueqia-2",
      title: "Mentoría IA ↔ diseño de marca",
      description:
        "Sesión 1 a 1 para integrar IA en flujos de trabajo a cambio de un kit de branding sencillo.",
      tokens: 120,
      owner: "trueqia",
      category: "formación",
    },
    {
      id: "offer-allwain-1",
      title: "Compra de lote café de especialidad",
      description:
        "Pack degustación 3 orígenes con envío 24h y puntos Allwain acumulados.",
      tokens: 30,
      owner: "allwain",
      category: "gourmet",
    },
    {
      id: "offer-allwain-2",
      title: "Comisión: análisis de etiquetas",
      description:
        "Revisión bajo demanda del QR nutricional y sugerencias de mejora para tu línea de producto.",
      tokens: 45,
      owner: "allwain",
      category: "análisis",
    },
    {
      id: "offer-allwain-3",
      title: "Bundle Allwain + TrueQIA",
      description:
        "Tokens conjuntos para lanzar campaña conjunta con catálogo Allwain y activaciones TrueQIA.",
      tokens: 150,
      owner: "allwain",
      category: "alianzas",
    },
  ],
  trades: [
    {
      id: "trade-1",
      title: "Trueque de horas de diseño",
      status: "activo",
      participants: ["trueqia-demo@newmersive.app", "company@trueqia.app"],
      tokens: 150,
    },
    {
      id: "trade-2",
      title: "Alianza para campaña social",
      status: "negociando",
      participants: ["marca@allwain.com", "creador@trueqia.app"],
      tokens: 90,
    },
  ],
  products: [
    {
      id: "product-allwain-1",
      name: "Pack degustación Allwain",
      description: "Selección de granos de especialidad con ficha sensorial y QR nutricional.",
      brand: "Allwain",
      priceTokens: 35,
      category: "café",
      imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93",
    },
    {
      id: "product-allwain-2",
      name: "Kit etiquetas inteligentes",
      description: "Lote demo de etiquetas inteligentes para trazabilidad y recompensas.",
      brand: "Allwain",
      priceTokens: 55,
      category: "packaging",
      imageUrl: "https://images.unsplash.com/photo-1497534446932-c925b458314e",
    },
  ],
  leads: [
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
  ],
  contracts: [
    {
      id: "contract-1",
      title: "Piloto Allwain x tienda local",
      status: "draft",
      counterparties: ["ops@allwain.app", "hola@cafedebarrio.local"],
      valueTokens: 250,
      createdAt: "2024-01-06T00:00:00.000Z",
      notes: "Contrato simulado en memoria hasta migrar a PostgreSQL.",
    },
  ],
};

const database: Database = loadInitialDatabase();

function loadInitialDatabase(): Database {
  const fromDisk = readFromDisk();
  const base = cloneDatabase(seedDatabase);

  if (!fromDisk) {
    return base;
  }

  return mergeDatabase(base, fromDisk);
}

function readFromDisk(): Partial<Database> | null {
  if (!DATA_FILE) return null;

  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const content = fs.readFileSync(DATA_FILE, "utf8");
    if (!content.trim()) return null;

    return JSON.parse(content) as Partial<Database>;
  } catch (error) {
    console.warn("[data.store] No se pudo leer DATA_FILE, usando seed en memoria", error);
    return null;
  }
}

function mergeDatabase(seed: Database, persisted: Partial<Database>): Database {
  return {
    users: mergeById(persisted.users, seed.users),
    offers: mergeById(persisted.offers, seed.offers),
    trades: mergeById(persisted.trades, seed.trades),
    products: mergeById(persisted.products, seed.products),
    leads: mergeById(persisted.leads, seed.leads),
    contracts: mergeById(persisted.contracts, seed.contracts),
  };
}

function mergeById<T extends { id: string }>(
  preferred: T[] | undefined,
  defaults: T[]
): T[] {
  const map = new Map<string, T>();
  defaults.forEach((item) => map.set(item.id, item));
  (preferred || []).forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function cloneDatabase(db: Database): Database {
  return {
    users: [...db.users],
    offers: [...db.offers],
    trades: [...db.trades],
    products: [...db.products],
    leads: [...db.leads],
    contracts: [...db.contracts],
  };
}

function upsertEntity<T extends { id: string }>(collection: T[], entity: T) {
  const index = collection.findIndex((item) => item.id === entity.id);
  if (index >= 0) {
    collection[index] = entity;
  } else {
    collection.push(entity);
  }
}

function ensureDataDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Persiste el estado actual en disco. Temporal para desarrollo hasta migrar a PostgreSQL.
 */
export function persistDatabase() {
  if (!DATA_FILE) return;

  try {
    ensureDataDir(DATA_FILE);
    fs.writeFileSync(DATA_FILE, JSON.stringify(database, null, 2), "utf8");
  } catch (error) {
    console.warn("[data.store] Persistencia en JSON omitida (se continúa en memoria)", error);
  }
}

export function getDatabase(): Database {
  return database;
}

export function resetDatabase(data: Partial<Database>) {
  const base = mergeDatabase(seedDatabase, data);
  database.users = base.users;
  database.offers = base.offers;
  database.trades = base.trades;
  database.products = base.products;
  database.leads = base.leads;
  database.contracts = base.contracts;
}

export function getUsers(): User[] {
  return database.users;
}

export function getUserById(id: string): User | undefined {
  return database.users.find((user) => user.id === id);
}

export function getUserByEmail(email: string): User | undefined {
  return database.users.find((user) => user.email === email.toLowerCase());
}

export function upsertUser(user: User): void {
  upsertEntity(database.users, user);
}

export function getOffers(): Offer[] {
  return database.offers;
}

export function getOffersByOwner(owner: Offer["owner"]): Offer[] {
  return database.offers.filter((offer) => offer.owner === owner);
}

export function upsertOffer(offer: Offer): void {
  upsertEntity(database.offers, offer);
}

export function getTrades(): Trade[] {
  return database.trades;
}

export function upsertTrade(trade: Trade): void {
  upsertEntity(database.trades, trade);
}

export function getProducts(): Product[] {
  return database.products;
}

export function upsertProduct(product: Product): void {
  upsertEntity(database.products, product);
}

export function getLeads(): Lead[] {
  return database.leads;
}

export function upsertLead(lead: Lead): void {
  upsertEntity(database.leads, lead);
}

export function getContracts(): Contract[] {
  return database.contracts;
}

export function upsertContract(contract: Contract): void {
  upsertEntity(database.contracts, contract);
}
