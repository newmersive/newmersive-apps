import fs from "fs";
import path from "path";
import { ENV } from "../config/env";
import {
  Contract,
  ContractStatus,
  Lead,
  Offer,
  Product,
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
}

const DEFAULT_DATA_FILE = path.resolve(__dirname, "../../data/database.json");
const DATA_FILE = ENV.DATA_FILE
  ? path.resolve(process.cwd(), ENV.DATA_FILE)
  : DEFAULT_DATA_FILE;

let cache: Database | null = null;

const defaultDatabase: Database = {
  users: [
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
    {
      id: "product-1",
      name: "Café de especialidad",
      description: "Café de especialidad demo para el catálogo Allwain.",
      brand: "Allwain",
      priceTokens: 0,
      category: "gourmet",
      imageUrl: "",
    },
  ],
  offers: [
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
  ],
  trades: [
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

function loadDatabase(): Database {
  if (cache) return cache;

  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      cache = JSON.parse(raw) as Database;
    } catch (error) {
      cache = { ...defaultDatabase };
    }
  } else {
    cache = { ...defaultDatabase };
  }

  return cache ?? defaultDatabase;
}

function saveDatabase(db: Database): void {
  cache = db;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Unable to persist demo database:", error);
  }
}

export function getOffersByOwner(owner: "trueqia" | "allwain"): Offer[] {
  return loadDatabase().offers.filter((offer) => offer.owner === owner);
}

export function getOfferById(id: string): Offer | undefined {
  return loadDatabase().offers.find((offer) => offer.id === id);
}

export function getTrades(): Trade[] {
  return loadDatabase().trades;
}

export function getTradeById(id: string): Trade | undefined {
  return loadDatabase().trades.find((trade) => trade.id === id);
}

export function saveTrade(trade: Trade): Trade {
  const db = loadDatabase();
  const index = db.trades.findIndex((item) => item.id === trade.id);
  if (index >= 0) {
    db.trades[index] = trade;
  } else {
    db.trades.push(trade);
  }
  saveDatabase(db);
  return trade;
}

export function updateTradeStatus(
  tradeId: string,
  status: TradeStatus,
  contractId?: string,
): Trade | null {
  const trade = getTradeById(tradeId);
  if (!trade) return null;

  const updated: Trade = {
    ...trade,
    status,
    resolvedAt: status === "pending" ? undefined : new Date().toISOString(),
    contractId: status === "accepted" && contractId ? contractId : trade.contractId,
  };

  return saveTrade(updated);
}

export function getUsers(): User[] {
  return loadDatabase().users;
}

export function getUserById(id: string): User | undefined {
  return loadDatabase().users.find((user) => user.id === id);
}

export function createContract(
  contract: Omit<Contract, "createdAt" | "updatedAt" | "id"> & Partial<Contract>,
): Contract {
  const db = loadDatabase();
  const newContract: Contract = {
    id: contract.id ?? `contract-${Date.now()}`,
    createdAt: contract.createdAt ?? new Date().toISOString(),
    updatedAt: contract.updatedAt,
    ...contract,
  };

  db.contracts.push(newContract);
  saveDatabase(db);
  return newContract;
}

export function getContractById(id: string): Contract | undefined {
  return loadDatabase().contracts.find((contract) => contract.id === id);
}

export function updateContractStatus(
  id: string,
  status: ContractStatus,
): Contract | null {
  const db = loadDatabase();
  const index = db.contracts.findIndex((contract) => contract.id === id);
  if (index === -1) return null;

  db.contracts[index] = {
    ...db.contracts[index],
    status,
    updatedAt: new Date().toISOString(),
  };

  saveDatabase(db);
  return db.contracts[index];
}
