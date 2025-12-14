require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MISSING");

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: url })),
});

(async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.table(
    users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      hasPasswordHash: !!u.passwordHash,
      createdAt: u.createdAt,
    }))
  );

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
