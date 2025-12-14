import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    // Prisma 7: el seed se configura aquí (no en package.json)
    seed: "ts-node --transpile-only prisma/seed.ts",
  },
});
