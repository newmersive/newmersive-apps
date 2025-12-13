import fs from "fs";
import path from "path";
import {
  User,
  Offer,
  Trade,
  Product,
  Lead,
  LeadGlobal,
  Contract,
  OrderGroup,
  ReferralStat,
  AllwainSavingTransaction,
} from "../shared/types";

const DATA_FILE =
  process.env.DATA_FILE || path.join(process.cwd(), "data", "database.json");

/* =========================
   PASSWORD RESET TOKENS
========================= */

interface PasswordResetTokenRecord {
  token: string;
  userId: string;
  expiresAt: number;
}

/* =========================
   DATABASE SHAPE
========================= */

export interface Database {
  users: User[];
  offers: Offer[];
  trades: Trade[];
  products: Product[];
  leads: Lead[];
  leadsGlobal: LeadGlobal[];
  contracts: Contract[];
  orderGroups: OrderGroup[];
  referralStats: ReferralStat[];
  allwainSavings: AllwainSavingTransaction[];
  passwordResetTokens: PasswordResetTokenRecord[];
}

/* =========================
   INITIAL SEED
========================= */

const initialDatabase: Database = {
  users: [],
  offers: [],
  trades: [],
  products: [],
  leads: [],
  leadsGlobal: [],
  contracts: [],
  orderGroups: [],
  referralStats: [],
  allwainSavings: [],
  passwordResetTokens: [],
};

let db: Database = { ...initialDatabase };

/* =========================
   FILE HELPERS
========================= */

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialDatabase, null, 2));
  }
}

export function loadDatabase() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const parsed = JSON.parse(raw);

  // Merge con defaults para soportar versiones antiguas del JSON
  db = {
    ...initialDatabase,
    ...parsed,
  };

  // Garantizar que todos los arrays existen
  db.users = db.users || [];
  db.offers = db.offers || [];
  db.trades = db.trades || [];
  db.products = db.products || [];
  db.leads = db.leads || [];
  db.leadsGlobal = db.leadsGlobal || [];
  db.contracts = db.contracts || [];
  db.orderGroups = db.orderGroups || [];
  db.referralStats = db.referralStats || [];
  db.allwainSavings = db.allwainSavings || [];
  db.passwordResetTokens = db.passwordResetTokens || [];
}

export function persistDatabase() {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function resetDatabase() {
  db = { ...initialDatabase };
  persistDatabase();
}

export function getDatabase(): Database {
  return db;
}

/* =========================
   USERS
========================= */

export function getUsers() {
  return db.users;
}

export function getUserById(id: string) {
  return db.users.find((u) => u.id === id);
}

export function getUserByEmail(email: string) {
  return db.users.find((u) => u.email === email);
}

export function getUserBySponsorCode(code: string) {
  return db.users.find((u) => u.sponsorCode === code);
}

export function upsertUser(user: User) {
  const index = db.users.findIndex((u) => u.id === user.id);
  if (index === -1) db.users.push(user);
  else db.users[index] = user;
  persistDatabase();
  return user;
}

/* =========================
   OFFERS
========================= */

export function getOffersByOwner(owner: "trueqia" | "allwain") {
  return db.offers.filter((o) => o.owner === owner);
}

export function getOfferById(id: string) {
  return db.offers.find((o) => o.id === id);
}

export function addOffer(offer: Offer) {
  db.offers.push(offer);
  persistDatabase();
  return offer;
}

/* =========================
   TRADES
========================= */

export function getTrades() {
  return db.trades;
}

export function getTradeById(id: string) {
  return db.trades.find((t) => t.id === id);
}

export function addTrade(trade: Trade) {
  db.trades.push(trade);
  persistDatabase();
  return trade;
}

export function updateTradeStatus(id: string, status: Trade["status"]) {
  const trade = getTradeById(id);
  if (!trade) return null;
  trade.status = status;
  trade.resolvedAt = new Date().toISOString();
  persistDatabase();
  return trade;
}

/* =========================
   PRODUCTS
========================= */

export function getProducts() {
  return db.products;
}

export function getProductById(id: string) {
  return db.products.find((p) => p.id === id);
}

export function getProductByEAN(ean: string) {
  return db.products.find((p) => p.ean === ean);
}

/* =========================
   LEADS (LOCAL)
========================= */

export function addLead(lead: Lead) {
  db.leads.push(lead);
  persistDatabase();
  return lead;
}

/* =========================
   LEADS GLOBAL (WHATSAPP / WEB / APP)
========================= */

export function addLeadGlobal(lead: LeadGlobal) {
  db.leadsGlobal.push(lead);
  persistDatabase();
  return lead;
}

export function getLeadsGlobal() {
  return db.leadsGlobal;
}

/* =========================
   CONTRACTS
========================= */

export function createContract(contract: Contract) {
  db.contracts.push(contract);
  persistDatabase();
  return contract;
}

export function getContractById(id: string) {
  return db.contracts.find((c) => c.id === id);
}

export function updateContractStatus(id: string, status: Contract["status"]) {
  const contract = getContractById(id);
  if (!contract) return null;
  contract.status = status;
  contract.updatedAt = new Date().toISOString();
  persistDatabase();
  return contract;
}

/* =========================
   ORDER GROUPS (ALLWAIN)
========================= */

export function getOrderGroups() {
  return db.orderGroups;
}

export function addOrderGroup(group: OrderGroup) {
  db.orderGroups.push(group);
  persistDatabase();
  return group;
}

/* =========================
   SAVINGS (ALLWAIN)
========================= */

export function addSaving(tx: AllwainSavingTransaction) {
  db.allwainSavings.push(tx);
  persistDatabase();
  return tx;
}

/* =========================
   REFERRALS (SPONSORS)
========================= */

export function addReferralStat(stat: ReferralStat) {
  db.referralStats.push(stat);
  persistDatabase();
  return stat;
}

export function getReferralStatsByUser(userId: string) {
  return db.referralStats.filter((r) => r.userId === userId);
}

/* =========================
   PASSWORD RESET TOKENS
========================= */

export function savePasswordResetToken(
  token: string,
  userId: string,
  expiresAt: number
) {
  db.passwordResetTokens = db.passwordResetTokens.filter(
    (r) => r.userId !== userId
  );
  db.passwordResetTokens.push({ token, userId, expiresAt });
  persistDatabase();
}

export function getPasswordResetToken(token: string) {
  const now = Date.now();
  const record = db.passwordResetTokens.find(
    (r) => r.token === token && r.expiresAt > now
  );
  return record || null;
}

export function deletePasswordResetToken(token: string) {
  db.passwordResetTokens = db.passwordResetTokens.filter(
    (r) => r.token !== token
  );
  persistDatabase();
}

/* =========================
   AUTO LOAD ON START
========================= */

loadDatabase();
