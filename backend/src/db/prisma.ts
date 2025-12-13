import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ENV } from "../config/env";

let prisma: PrismaClient | null = null;
let pool: Pool | null = null;

export function getPrisma() {
  if (prisma) return prisma;

  if (!ENV.DATABASE_URL) {
    throw new Error("DATABASE_URL_MISSING");
  }

  pool = new Pool({
    connectionString: ENV.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });

  return prisma;
}
