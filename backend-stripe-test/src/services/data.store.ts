import fs from "fs";
import path from "path";
import type { TrueqiaTesterActionRecord, TrueqiaTesterIncidentRecord } from "./trueqia-tester.service";
import {
  User,
  CourseEntitlement,
  CourseEntitlementRecord,
  Offer,
  Trade,
  Product,
  Lead,
  LeadGlobal,
  Contract,
  TrueqiaChatMessage,
  ChatThreadRecord,
  ChatParticipantRecord,
  ChatBlockRecord,
  OrderGroup,
  ReferralStat,
  AllwainSavingTransaction,
  AllwainScanRequest,
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
  trueqiaTesterActions: TrueqiaTesterActionRecord[];
  trueqiaTesterIncidents: TrueqiaTesterIncidentRecord[];
  trueqiaProfiles: Record<string, Record<string, unknown>>;
  trueqiaNeeds: any[];
  trueqiaNeedResponses: any[];
  users: User[];
  courseEntitlements: CourseEntitlementRecord[];
  offers: Offer[];
  trades: Trade[];
  products: Product[];
  leads: Lead[];
  leadsGlobal: LeadGlobal[];
  contracts: Contract[];
  trueqiaChatMessages: TrueqiaChatMessage[];
  chatThreads: ChatThreadRecord[];
  chatParticipants: ChatParticipantRecord[];
  chatBlocks: ChatBlockRecord[];
  orderGroups: OrderGroup[];
  referralStats: ReferralStat[];
  allwainSavings: AllwainSavingTransaction[];
  allwainScanRequests: AllwainScanRequest[];
  passwordResetTokens: PasswordResetTokenRecord[];
}

/* =========================
   INITIAL SEED
========================= */

const initialDatabase: Database = {
  trueqiaTesterActions: [],
  trueqiaTesterIncidents: [],
  trueqiaProfiles: {},
  trueqiaNeeds: [],
  trueqiaNeedResponses: [],
  users: [],
  courseEntitlements: [],
  offers: [],
  trades: [],
  products: [],
  leads: [],
  leadsGlobal: [],
  contracts: [],
  trueqiaChatMessages: [],
  chatThreads: [],
  chatParticipants: [],
  chatBlocks: [],
  orderGroups: [],
  referralStats: [],
  allwainSavings: [],
  allwainScanRequests: [],
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
  db.courseEntitlements = db.courseEntitlements || [];
  db.offers = db.offers || [];
  db.trades = db.trades || [];
  db.products = db.products || [];
  db.leads = db.leads || [];
  db.leadsGlobal = db.leadsGlobal || [];
  db.contracts = db.contracts || [];
  db.trueqiaChatMessages = db.trueqiaChatMessages || [];
  db.chatThreads = db.chatThreads || [];
  db.chatParticipants = db.chatParticipants || [];
  db.chatBlocks = db.chatBlocks || [];
  db.orderGroups = db.orderGroups || [];
  db.referralStats = db.referralStats || [];
  db.allwainSavings = db.allwainSavings || [];
  db.allwainScanRequests = db.allwainScanRequests || [];
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
   COURSE ENTITLEMENTS
========================= */

export function getCourseEntitlementsByUserId(userId: string) {
  return db.courseEntitlements.filter((item) => item.userId === userId);
}

export function getCourseEntitlementByUserAndType(
  userId: string,
  entitlement: CourseEntitlement
) {
  return db.courseEntitlements.find(
    (item) => item.userId === userId && item.entitlement === entitlement
  );
}

export function upsertCourseEntitlement(record: CourseEntitlementRecord) {
  const index = db.courseEntitlements.findIndex(
    (item) => item.userId === record.userId && item.entitlement === record.entitlement
  );

  if (index === -1) {
    db.courseEntitlements.push(record);
  } else {
    db.courseEntitlements[index] = {
      ...db.courseEntitlements[index],
      ...record,
      id: db.courseEntitlements[index].id,
      grantedAt: db.courseEntitlements[index].grantedAt,
    };
  }

  persistDatabase();
  return index === -1 ? record : db.courseEntitlements[index];
}

/* =========================
   OFFERS
========================= */

export function getOffersByOwner(owner: "trueqia" | "allwain") {
  return db.offers
    .filter((o) => o.owner === owner)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function getOfferById(id: string) {
  return db.offers.find((o) => o.id === id);
}

export function addOffer(offer: Offer) {
  db.offers.push(offer);
  persistDatabase();
  return offer;
}

export function updateOffer(offer: Offer) {
  const index = db.offers.findIndex((item) => item.id === offer.id);
  if (index < 0) return null;
  db.offers[index] = offer;
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

export function updateTradeLifecycle(id: string, patch: Partial<Trade>) {
  const trade = getTradeById(id);
  if (!trade) return null;
  Object.assign(trade, patch);
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

export function getContracts() {
  return db.contracts;
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

export function updateContractAcceptance(
  id: string,
  patch: Pick<Contract, "status"> & Partial<Pick<Contract, "requesterAcceptedAt" | "providerAcceptedAt">>
) {
  const contract = getContractById(id);
  if (!contract) return null;
  contract.status = patch.status;
  if ("requesterAcceptedAt" in patch) contract.requesterAcceptedAt = patch.requesterAcceptedAt;
  if ("providerAcceptedAt" in patch) contract.providerAcceptedAt = patch.providerAcceptedAt;
  contract.updatedAt = new Date().toISOString();
  persistDatabase();
  return contract;
}

export function updateContractDetails(id: string, patch: Partial<Contract>) {
  const contract = getContractById(id);
  if (!contract) return null;
  Object.assign(contract, patch, { id: contract.id, updatedAt: new Date().toISOString() });
  persistDatabase();
  return contract;
}

/* =========================
   TRUEQIA CHAT
========================= */

export function getTrueqiaChatMessages(userId: string, threadId: string) {
  return db.trueqiaChatMessages
    .filter((message) => message.userId === userId && message.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getTrueqiaChatThreadMessages(threadId: string) {
  return db.trueqiaChatMessages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addTrueqiaChatMessage(message: TrueqiaChatMessage) {
  db.trueqiaChatMessages.push(message);
  persistDatabase();
  return message;
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

export function updateOrderGroup(group: OrderGroup) {
  const index = db.orderGroups.findIndex((g) => g.id === group.id);
  if (index === -1) return null;
  db.orderGroups[index] = group;
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
   SCAN REQUESTS (ALLWAIN)
========================= */

export function getAllwainScanRequests(userId?: string) {
  const items = db.allwainScanRequests || [];
  return userId ? items.filter((item) => item.userId === userId) : items;
}

export function addAllwainScanRequest(item: AllwainScanRequest) {
  db.allwainScanRequests.push(item);
  persistDatabase();
  return item;
}

export function updateAllwainScanRequest(item: AllwainScanRequest) {
  const index = db.allwainScanRequests.findIndex((entry) => entry.id === item.id);
  if (index === -1) return null;
  db.allwainScanRequests[index] = item;
  persistDatabase();
  return item;
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

export function deletePasswordResetTokensForUser(userId: string) {
  db.passwordResetTokens = db.passwordResetTokens.filter(
    (record) => record.userId !== userId,
  );
  persistDatabase();
}

/* =========================
   AUTO LOAD ON START
========================= */

loadDatabase();
