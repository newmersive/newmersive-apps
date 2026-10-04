const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

const baseDatabaseUrl = process.env.DATABASE_URL;
if (!baseDatabaseUrl) {
  console.error("DATABASE_URL is required to create the isolated PostgreSQL database.");
  process.exit(1);
}

const baseUrl = new URL(baseDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
  console.error("The isolated suite only creates databases on local PostgreSQL hosts.");
  process.exit(1);
}

const databaseName = `newmersive_e2e_${Date.now()}_${process.pid}`;
if (!/^newmersive_e2e_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error("Unsafe isolated database name");
}

const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${databaseName}`;
const quotedDatabase = `"${databaseName.replace(/"/g, '""')}"`;
const evidenceDir = path.join(os.tmpdir(), `${databaseName}-evidence`);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${path.basename(command)} exited with ${result.status ?? 1}`);
  }
}

async function deployMigrationsWithRequiredFixture(prismaCli, env, testUrl) {
  const firstAttempt = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    { cwd: root, env, stdio: "inherit" },
  );
  if ((firstAttempt.status ?? 1) === 0) return;

  const migrationName = "20260906193000_promote_newmersive_admin";
  const database = new Client({ connectionString: testUrl.toString() });
  await database.connect();
  try {
    const failed = await database.query(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`,
      [migrationName],
    );
    if (failed.rowCount !== 1) {
      throw new Error(
        `Migration deployment failed outside the expected isolated-data fixture (${firstAttempt.status ?? 1}).`,
      );
    }

    await database.query(
      `INSERT INTO "User" (
         "id", "name", "email", "role", "status", "tokenVersion",
         "failedLoginCount", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, 0, 0, CURRENT_TIMESTAMP)
       ON CONFLICT ("email") DO NOTHING`,
      [
        "isolated-newmersive-admin",
        "Newmersive test admin",
        "newmersive@gmail.com",
        "user",
        "active",
      ],
    );
  } finally {
    await database.end();
  }

  run(
    process.execPath,
    [prismaCli, "migrate", "resolve", "--rolled-back", migrationName],
    env,
  );
  run(process.execPath, [prismaCli, "migrate", "deploy"], env);
}

async function main() {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${quotedDatabase}`);
    created = true;
    const env = {
      ...process.env,
      DATABASE_URL: testUrl.toString(),
      NODE_ENV: "test",
      STORAGE_DRIVER: "postgres",
      ALLWAIN_PAYMENTS_ENABLED: "false",
      ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: "false",
      ALLWAIN_EVIDENCE_DIR: evidenceDir,
    };
    const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
    await deployMigrationsWithRequiredFixture(prismaCli, env, testUrl);
    run(process.execPath, ["--test", "-r", "ts-node/register", "tests/allwain-shopping-lists-postgres.spec.ts"], env);
  } finally {
    if (created) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
      await admin.query(`DROP DATABASE ${quotedDatabase}`);
    }
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
