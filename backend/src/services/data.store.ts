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
    meta: { category: "análisis

