"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrisma = getPrisma;
exports.closePrisma = closePrisma;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const env_1 = require("../config/env");
let prisma = null;
let pool = null;
function getPrisma() {
    if (prisma)
        return prisma;
    if (!env_1.ENV.DATABASE_URL)
        throw new Error("DATABASE_URL_MISSING");
    pool = new pg_1.Pool({
        connectionString: env_1.ENV.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    prisma = new client_1.PrismaClient({ adapter });
    return prisma;
}
async function closePrisma() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
    }
    if (pool) {
        await pool.end();
        pool = null;
    }
}
