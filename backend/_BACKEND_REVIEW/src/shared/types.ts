export type UserRole = "user" | "buyer" | "company" | "admin";

/* =========================
   USER & AUTH
========================= */

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  /**
   * Código propio único que el usuario puede compartir como sponsor.
   */
  sponsorCode?: string;
  /**
   * Código de sponsor que lo invitó, si existe.
   */
  referredByCode?: string;
  avatarUrl?: string;
  /**
   * Saldo de tokens internos para TrueQIA.
   */
  tokens?: number;
  /**
   * Saldo/comisiones acumuladas para Allwain.
   */
  allwainBalance?: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  sponsorCode?: string;
  referredByCode?: string;
  avatarUrl?: string;
  tokens?: number;
  allwainBalance?: number;
}

export interface AuthTokenResponse {
  token: string;
  user: AuthUser;
}

/* =========================
   OFFERS & TRADES
========================= */

export type OfferOwner = "trueqia" | "allwain";

export interface Offer {
  id: string;
  title: string;
  description: string;
  owner: OfferOwner;
  ownerUserId: string;
  /**
   * Precio en tokens (TrueQIA).
   */
  tokens?: number;
  /**
   * Precio en dinero (Allwain).
   */
  price?: number;
  /**
   * Relación con un producto de catálogo (Allwain).
   */
  productId?: string;
  /**
   * Campos extra (distancia, imágenes, tags, etc.).
   */
  meta?: Record<string, unknown>;
}

export type TradeStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled";

export interface Trade {
  id: string;
  offerId: string;
  fromUserId: string;
  toUserId: string;
  tokens: number;
  status: TradeStatus;
  createdAt: string;
  resolvedAt?: string;
}

/* =========================
   PRODUCTS
========================= */

export interface Product {
  id: string;
  name: string;
  /**
   * Código de barras / EAN (opcional).
   */
  ean?: string;
  category?: string;
  brand?: string;
  /**
   * Texto descriptivo para fichas y demos.
   */
  description?: string;
  /**
   * URL de imagen para demos.
   */
  imageUrl?: string;
  /**
   * Algunos seeds usan este campo sólo para demo.
   */
  priceTokens?: number;
}

/* =========================
   LEADS LOCALES (APP)
========================= */

export type LeadStatus = "new" | "contacted" | "closed";

export interface Lead {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  /**
   * Origen interno del lead, por ejemplo:
   * - "allwain-offer-interest"
   * - "trueqia-trade-interest"
   */
  source: string;
  message?: string;
  /**
   * Relación opcional con oferta / usuario.
   */
  offerId?: string;
  userId?: string;
  status: LeadStatus;
  createdAt: string;
  notes?: string;
}

/* =========================
   LEADS GLOBALES (WHATSAPP / WEB)
========================= */

export type LeadGlobalChannel = "whatsapp" | "app" | "web";

export type LeadGlobalSourceApp = "trueqia" | "allwain";

export type LeadGlobalStatus = "new" | "contacted" | "closed";

export interface LeadGlobal {
  id: string;
  createdAt: string;
  channel: LeadGlobalChannel;
  sourceApp: LeadGlobalSourceApp;
  name?: string;
  phone?: string;
  email?: string;
  message: string;
  status: LeadGlobalStatus;
  /**
   * Campos abiertos para ampliar tracking sin romper el tipo.
   */
  meta?: Record<string, unknown>;
}

/* =========================
   ORDER GROUPS (ALLWAIN)
========================= */

export type OrderGroupStatus = "open" | "closing" | "closed";

export interface OrderGroupParticipant {
  userId: string;
  units: number;
}

export interface OrderGroup {
  id: string;
  productId: string;
  totalUnits: number;
  minUnitsPerClient: number;
  status: OrderGroupStatus;
  participants: OrderGroupParticipant[];
}

/* =========================
   REFERRALS & SAVINGS (ALLWAIN)
========================= */

export interface ReferralMonthlyHistory {
  month: number; // 1-12
  year: number;
  /**
   * Ahorro generado por este invitado en el mes.
   */
  saved: number;
  /**
   * Comisión para el sponsor en el mes.
   */
  commission: number;
}

export interface ReferralStat {
  id: string;
  /**
   * Usuario sponsor (quien invita).
   */
  userId: string;
  /**
   * Usuario invitado.
   */
  invitedUserId: string;
  /**
   * Total acumulado ahorrado por el invitado.
   */
  totalSavedByInvited: number;
  /**
   * Comisión total acumulada para el sponsor.
   */
  commissionEarned: number;
  /**
   * Historial mensual agregado.
   */
  monthlyHistory: ReferralMonthlyHistory[];
}

export interface AllwainSavingTransaction {
  id: string;
  userId: string;
  /**
   * Importe de ahorro registrado para el usuario.
   */
  amount: number;
  createdAt: string;
}

/* =========================
   CONTRACTS
========================= */

export type ContractApp = "trueqia" | "allwain";
export type ContractType = "trade" | "purchase";
export type ContractStatus =
  | "draft"
  | "active"
  | "closed"
  | "conflict";

export interface Contract {
  id: string;
  app: ContractApp;
  type: ContractType;
  status: ContractStatus;
  /**
   * Referencia opcional a la plantilla base (PDF).
   */
  basePdfId?: string;
  /**
   * Texto generado (IA) para el contrato.
   */
  generatedText?: string;
  createdAt: string;
  updatedAt: string;
}

/* =========================
   DEMO INPUTS
========================= */

export interface DemoContractInput {
  offerTitle: string;
  requesterName: string;
  providerName: string;
  tokens: number;
}
