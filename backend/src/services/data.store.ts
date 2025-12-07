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

/**
 * Datos por defecto en memoria: usuarios demo, ofertas, productos, leads y contratos.
 */

const defaultUsers: User[] = [
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
];

const defaultProducts: Product[] = [
  {
    id: "product-allwain-1",
    name: "Pack degustación Allwain",
    description: "Selección de granos de especialidad con ficha sensorial y QR nutricional.",
    brand: "Allwain",
    // Si Product no tuviera este campo en tipos, Typescript lo permite como extra
    priceTokens: 35 as any,
    category: "café",
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93",
  },
  {
    id: "product-allwain-2",
    name: "Kit etiquetas inteligentes",
    description: "Lote demo de etiquetas inteligentes para trazabilidad y recompensas.",
    brand: "Allwain",
    priceTokens: 55 as any,
    category: "packaging",
    imageUrl: "https://images.uns
