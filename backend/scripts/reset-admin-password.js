// scripts/reset-admin-password.js
require("dotenv/config");

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

async function main() {
  const email = (process.argv[2] || "admin@newmersive.local").toLowerCase();
  const newPassword = process.argv[3] || "12345678";

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MISSING (revisa .env en backend)");

  const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.error("USER_NOT_FOUND:", email);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log("OK password reset:");
  console.table([{ id: user.id, email: user.email, role: user.role, newPassword }]);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
