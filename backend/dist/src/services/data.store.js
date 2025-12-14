"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDatabase = loadDatabase;
exports.persistDatabase = persistDatabase;
exports.resetDatabase = resetDatabase;
exports.getDatabase = getDatabase;
exports.getUsers = getUsers;
exports.getUserById = getUserById;
exports.getUserByEmail = getUserByEmail;
exports.getUserBySponsorCode = getUserBySponsorCode;
exports.upsertUser = upsertUser;
exports.getOffersByOwner = getOffersByOwner;
exports.getOfferById = getOfferById;
exports.addOffer = addOffer;
exports.getTrades = getTrades;
exports.getTradeById = getTradeById;
exports.addTrade = addTrade;
exports.updateTradeStatus = updateTradeStatus;
exports.getProducts = getProducts;
exports.getProductById = getProductById;
exports.getProductByEAN = getProductByEAN;
exports.addLead = addLead;
exports.addLeadGlobal = addLeadGlobal;
exports.getLeadsGlobal = getLeadsGlobal;
exports.createContract = createContract;
exports.getContractById = getContractById;
exports.updateContractStatus = updateContractStatus;
exports.getOrderGroups = getOrderGroups;
exports.addOrderGroup = addOrderGroup;
exports.addSaving = addSaving;
exports.addReferralStat = addReferralStat;
exports.getReferralStatsByUser = getReferralStatsByUser;
exports.savePasswordResetToken = savePasswordResetToken;
exports.getPasswordResetToken = getPasswordResetToken;
exports.deletePasswordResetToken = deletePasswordResetToken;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_FILE = process.env.DATA_FILE || path_1.default.join(process.cwd(), "data", "database.json");
/* =========================
   INITIAL SEED
========================= */
const initialDatabase = {
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
let db = { ...initialDatabase };
/* =========================
   FILE HELPERS
========================= */
function ensureFile() {
    const dir = path_1.default.dirname(DATA_FILE);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    if (!fs_1.default.existsSync(DATA_FILE)) {
        fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(initialDatabase, null, 2));
    }
}
function loadDatabase() {
    ensureFile();
    const raw = fs_1.default.readFileSync(DATA_FILE, "utf-8");
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
function persistDatabase() {
    ensureFile();
    fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
function resetDatabase() {
    db = { ...initialDatabase };
    persistDatabase();
}
function getDatabase() {
    return db;
}
/* =========================
   USERS
========================= */
function getUsers() {
    return db.users;
}
function getUserById(id) {
    return db.users.find((u) => u.id === id);
}
function getUserByEmail(email) {
    return db.users.find((u) => u.email === email);
}
function getUserBySponsorCode(code) {
    return db.users.find((u) => u.sponsorCode === code);
}
function upsertUser(user) {
    const index = db.users.findIndex((u) => u.id === user.id);
    if (index === -1)
        db.users.push(user);
    else
        db.users[index] = user;
    persistDatabase();
    return user;
}
/* =========================
   OFFERS
========================= */
function getOffersByOwner(owner) {
    return db.offers.filter((o) => o.owner === owner);
}
function getOfferById(id) {
    return db.offers.find((o) => o.id === id);
}
function addOffer(offer) {
    db.offers.push(offer);
    persistDatabase();
    return offer;
}
/* =========================
   TRADES
========================= */
function getTrades() {
    return db.trades;
}
function getTradeById(id) {
    return db.trades.find((t) => t.id === id);
}
function addTrade(trade) {
    db.trades.push(trade);
    persistDatabase();
    return trade;
}
function updateTradeStatus(id, status) {
    const trade = getTradeById(id);
    if (!trade)
        return null;
    trade.status = status;
    trade.resolvedAt = new Date().toISOString();
    persistDatabase();
    return trade;
}
/* =========================
   PRODUCTS
========================= */
function getProducts() {
    return db.products;
}
function getProductById(id) {
    return db.products.find((p) => p.id === id);
}
function getProductByEAN(ean) {
    return db.products.find((p) => p.ean === ean);
}
/* =========================
   LEADS (LOCAL)
========================= */
function addLead(lead) {
    db.leads.push(lead);
    persistDatabase();
    return lead;
}
/* =========================
   LEADS GLOBAL (WHATSAPP / WEB / APP)
========================= */
function addLeadGlobal(lead) {
    db.leadsGlobal.push(lead);
    persistDatabase();
    return lead;
}
function getLeadsGlobal() {
    return db.leadsGlobal;
}
/* =========================
   CONTRACTS
========================= */
function createContract(contract) {
    db.contracts.push(contract);
    persistDatabase();
    return contract;
}
function getContractById(id) {
    return db.contracts.find((c) => c.id === id);
}
function updateContractStatus(id, status) {
    const contract = getContractById(id);
    if (!contract)
        return null;
    contract.status = status;
    contract.updatedAt = new Date().toISOString();
    persistDatabase();
    return contract;
}
/* =========================
   ORDER GROUPS (ALLWAIN)
========================= */
function getOrderGroups() {
    return db.orderGroups;
}
function addOrderGroup(group) {
    db.orderGroups.push(group);
    persistDatabase();
    return group;
}
/* =========================
   SAVINGS (ALLWAIN)
========================= */
function addSaving(tx) {
    db.allwainSavings.push(tx);
    persistDatabase();
    return tx;
}
/* =========================
   REFERRALS (SPONSORS)
========================= */
function addReferralStat(stat) {
    db.referralStats.push(stat);
    persistDatabase();
    return stat;
}
function getReferralStatsByUser(userId) {
    return db.referralStats.filter((r) => r.userId === userId);
}
/* =========================
   PASSWORD RESET TOKENS
========================= */
function savePasswordResetToken(token, userId, expiresAt) {
    db.passwordResetTokens = db.passwordResetTokens.filter((r) => r.userId !== userId);
    db.passwordResetTokens.push({ token, userId, expiresAt });
    persistDatabase();
}
function getPasswordResetToken(token) {
    const now = Date.now();
    const record = db.passwordResetTokens.find((r) => r.token === token && r.expiresAt > now);
    return record || null;
}
function deletePasswordResetToken(token) {
    db.passwordResetTokens = db.passwordResetTokens.filter((r) => r.token !== token);
    persistDatabase();
}
/* =========================
   AUTO LOAD ON START
========================= */
loadDatabase();
