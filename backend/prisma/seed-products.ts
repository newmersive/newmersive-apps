import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MISSING");

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

async function main() {
  const products = [
    {
      id: "prod-iphone-15",
      name: "iPhone 15",
      ean: "1111111111111",
      category: "smartphone",
      brand: "Apple",
      description: "iPhone 15 128GB",
      imageUrl: "https://example.com/iphone15.jpg",
      priceTokens: 1200,
    },
    {
      id: "prod-samsung-s24",
      name: "Samsung Galaxy S24",
      ean: "2222222222222",
      category: "smartphone",
      brand: "Samsung",
      description: "Galaxy S24 256GB",
      imageUrl: "https://example.com/galaxys24.jpg",
      priceTokens: 1100,
    },
    {
      id: "prod-airpods",
      name: "AirPods Pro",
      ean: "3333333333333",
      category: "audio",
      brand: "Apple",
      description: "AirPods Pro 2ª generación",
      imageUrl: "https://example.com/airpods.jpg",
      priceTokens: 350,
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: p,
      update: p,
    });
  }

  console.log("✅ Productos seed creados/actualizados");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

