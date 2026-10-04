import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const ADMIN_EMAIL = "admin@newmersive.local";
const DEMO_EMAIL = "demo@newmersive.local";

function createSeedPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MISSING");

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return { prisma, pool };
}

async function createPasswordHash(password: string) {
  return bcrypt.hash(password, 10);
}

async function upsertSeedUser(
  prisma: PrismaClient,
  input: {
    email: string;
    password: string;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    return prisma.user.update({
      where: { email: input.email },
      data: input.update as any,
    });
  }

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await createPasswordHash(input.password),
      ...input.create,
    } as any,
  });
}

async function upsertProducts(prisma: PrismaClient) {
  const products = [
    {
      id: "demo-allwain-coffee-1",
      name: "Cafe de origen Chiapas 250g",
      ean: "7501234567890",
      category: "cafe",
      brand: "Allwain",
      description: "Tostado medio con trazabilidad y QR nutricional.",
      imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93",
      priceTokens: 35,
    },
    {
      id: "demo-allwain-labels-1",
      name: "Kit de etiquetas inteligentes 50u",
      category: "packaging",
      brand: "Allwain",
      description: "Etiquetas NFC/QR para trazabilidad y recompensas.",
      imageUrl: "https://images.unsplash.com/photo-1497534446932-c925b458314e",
      priceTokens: 55,
    },
    {
      id: "demo-allwain-coldbrew-1",
      name: "Cold Brew listo para beber 330ml",
      category: "bebidas",
      brand: "Allwain",
      description: "Botella RTD con codigo nutricional y recomendacion de pairing.",
      imageUrl: "https://images.unsplash.com/photo-1510626176961-4b37d0f0b35c",
      priceTokens: 45,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      create: product,
      update: product,
    });
  }

  return products.length;
}

async function upsertOffers(prisma: PrismaClient, ownerIds: { adminId: string; demoUserId: string }) {
  const offers = [
    {
      id: "seed-trueqia-landing",
      title: "Diseno de landing TrueQIA",
      description: "Landing para trueques con branding, copy y medicion basica.",
      owner: "trueqia",
      ownerUserId: ownerIds.demoUserId,
      tokens: 80,
      price: null,
      productId: null,
      meta: { category: "creativos" },
      isUnique: false,
    },
    {
      id: "seed-trueqia-contracts",
      title: "Consultoria de contratos",
      description: "Plantillas y revision de contratos de trueques empresariales.",
      owner: "trueqia",
      ownerUserId: ownerIds.adminId,
      tokens: 120,
      price: null,
      productId: null,
      meta: { category: "legal" },
      isUnique: true,
    },
    {
      id: "seed-trueqia-community",
      title: "Mentoria de community",
      description: "Sesion 1:1 para activar comunidad y referidos en TrueQIA.",
      owner: "trueqia",
      ownerUserId: ownerIds.demoUserId,
      tokens: 60,
      price: null,
      productId: null,
      meta: { category: "growth" },
      isUnique: false,
    },
    {
      id: "seed-allwain-coffee-pack",
      title: "Pack degustacion Allwain",
      description: "3 origenes con envio 24h y puntos Allwain para tu siguiente compra.",
      owner: "allwain",
      ownerUserId: ownerIds.adminId,
      tokens: null,
      price: 32,
      productId: "demo-allwain-coffee-1",
      meta: { format: "grano" },
      isUnique: false,
    },
    {
      id: "seed-allwain-trace",
      title: "Suscripcion Allwain Trace",
      description: "Entrega mensual con seguimiento de finca y alertas de stock.",
      owner: "allwain",
      ownerUserId: ownerIds.adminId,
      tokens: 90,
      price: 38,
      productId: "demo-allwain-coffee-1",
      meta: { term: "mensual" },
      isUnique: false,
    },
    {
      id: "seed-allwain-labels",
      title: "Integracion Allwain Rewards",
      description: "Configuramos la experiencia de escaneo con landing y wallet de puntos.",
      owner: "allwain",
      ownerUserId: ownerIds.adminId,
      tokens: null,
      price: 55,
      productId: "demo-allwain-labels-1",
      meta: { service: "onboarding" },
      isUnique: false,
    },
  ];

  for (const offer of offers) {
    await prisma.offer.upsert({
      where: { id: offer.id },
      create: offer as any,
      update: offer as any,
    });
  }

  return offers.length;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PRODUCTION_SEED_DISABLED: use the reviewed production catalog importer instead",
    );
  }

  const { prisma, pool } = createSeedPrisma();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!adminPassword || adminPassword.length < 16) {
    throw new Error("SEED_ADMIN_PASSWORD_REQUIRED_MIN_16");
  }
  if (!demoPassword || demoPassword.length < 16) {
    throw new Error("SEED_DEMO_PASSWORD_REQUIRED_MIN_16");
  }

  try {
    console.log("Seed starting (idempotent, non destructive) ...");

    const admin = await upsertSeedUser(prisma, {
      email: ADMIN_EMAIL,
      password: adminPassword,
      create: {
        name: "Admin",
        role: "admin",
        sponsorCode: "SPN-ADMIN",
        tokens: 1000,
        allwainBalance: 0,
      },
      update: {
        name: "Admin",
        role: "admin",
        sponsorCode: "SPN-ADMIN",
      },
    });

    const demoUser = await upsertSeedUser(prisma, {
      email: DEMO_EMAIL,
      password: demoPassword,
      create: {
        name: "Demo User",
        role: "user",
        sponsorCode: "SPN-DEMO",
        referredByCode: "SPN-ADMIN",
        tokens: 250,
        allwainBalance: 120,
      },
      update: {
        name: "Demo User",
        role: "user",
        sponsorCode: "SPN-DEMO",
        referredByCode: "SPN-ADMIN",
      },
    });

    const productCount = await upsertProducts(prisma);
    const offerCount = await upsertOffers(prisma, {
      adminId: admin.id,
      demoUserId: demoUser.id,
    });

    console.log(`Seed completed: users=2 products=${productCount} offers=${offerCount}`);
    console.log(`Admin email: ${ADMIN_EMAIL}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});
