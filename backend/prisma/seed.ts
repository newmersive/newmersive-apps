import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createSeedPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MISSING");

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return { prisma, pool };
}

async function main() {
  const { prisma, pool } = createSeedPrisma();

  try {
    console.log("🧹 Clearing tables (order matters) ...");

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany(),
      prisma.allwainSavingTransaction.deleteMany(),
      prisma.referralStat.deleteMany(),
      prisma.orderGroup.deleteMany(),
      prisma.contract.deleteMany(),
      prisma.leadGlobal.deleteMany(),
      prisma.lead.deleteMany(),
      prisma.trade.deleteMany(),
      prisma.offer.deleteMany(),
      prisma.product.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    console.log("👤 Seeding users ...");
    const adminPass = await bcrypt.hash("admin123", 10);
    const demoPass = await bcrypt.hash("demo123", 10);

    const admin = await prisma.user.create({
      data: {
        name: "Admin",
        email: "admin@newmersive.local",
        passwordHash: adminPass,
        role: "admin",
        sponsorCode: "SPN-ADMIN",
        tokens: 1000,
        allwainBalance: 0,
      },
    });

    const demoUser = await prisma.user.create({
      data: {
        name: "Demo User",
        email: "demo@newmersive.local",
        passwordHash: demoPass,
        role: "user",
        sponsorCode: "SPN-DEMO",
        referredByCode: "SPN-ADMIN",
        tokens: 250,
        allwainBalance: 120,
      },
    });

    console.log("📦 Seeding products ...");
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

    console.log("🟦 Seeding TrueQIA offers ...");
    await prisma.offer.createMany({
      data: [
        {
          title: "Diseño de landing TrueQIA",
          description: "Diseño de landing para trueques con branding y analytics.",
          owner: "trueqia",
          ownerUserId: demoUser.id,
          tokens: 80,
          isUnique: false,
        },
        {
          title: "Consultoría de contratos",
          description: "Plantillas y revisión de contratos de trueques empresariales.",
          owner: "trueqia",
          ownerUserId: admin.id,
          tokens: 120,
          isUnique: true,
        },
        {
          title: "Mentoría de community",
          description: "Sesión 1:1 para activar comunidad y referidos en TrueQIA.",
          owner: "trueqia",
          ownerUserId: demoUser.id,
          tokens: 60,
          isUnique: false,
        },
      ],
    });

    console.log("🟧 Seeding Allwain offers (price) ...");
    await prisma.offer.createMany({
      data: [
        {
          title: "Pack degustación Allwain",
          description: "3 orígenes con envío 24h.",
          owner: "allwain",
          ownerUserId: admin.id,
          price: 32,
          productId: "prod-airpods",
          meta: { format: "demo" },
        },
        {
          title: "Oferta Allwain demo",
          description: "Oferta con precio real para validar UI.",
          owner: "allwain",
          ownerUserId: admin.id,
          price: 19.99,
          productId: "prod-iphone-15",
          meta: { channel: "demo" },
        },
      ],
    });

    console.log("✅ Seed COMPLETED");
  } finally {
    // cierre limpio
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});
