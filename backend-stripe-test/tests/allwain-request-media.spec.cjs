const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const express = require("express");

// Execute current routes, auth middleware, service and image helper sources.
// Configuration and aggregate storage are explicit fixtures: no dotenv, server,
// database.json, Prisma connection, original uploads or external network.
const root = path.resolve(__dirname, "..");
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function harness(uploadDir = "unused-test-upload-dir") {
  const request = {
    id: requestId, userId: "buyer", status: "submitted", visibility: "public",
    title: "Café", sourceType: "camera", extracted: { productName: "Café", rawText: "Factura: información privada" },
    imageMeta: { hasImage: true, source: "captured", url: `https://fixture.invalid/api/allwain/media/uploads/${requestId}.png` },
  };
  const users = new Map([
    ["buyer", { id: "buyer", name: "Comprador", role: "user", status: "active", deletedAt: null }],
    ["seller", { id: "seller", name: "Vendedor", role: "company", status: "active", deletedAt: null }],
    ["stranger", { id: "stranger", name: "Tercero", role: "user", status: "active", deletedAt: null }],
    ["admin", { id: "admin", name: "Operador", role: "admin", status: "active", deletedAt: null }],
  ]);
  const config = { ENV: { NODE_ENV: "test", STORAGE_DRIVER: "postgres", ALLWAIN_API_URL: "https://fixture.invalid", ALLWAIN_PUBLICATION_IMAGE_DIR: uploadDir } };
  const adminMfa = { verified: true, checks: [] };
  const requestLookups = [];
  const files = (relative) => path.join(root, "src", relative);
  const stubs = new Map([
    [files("config/env.ts"), config],
    [files("db/prisma.ts"), { getPrisma: () => { throw new Error("DATABASE_ACCESS_FORBIDDEN_IN_MEDIA_TEST"); } }],
    [files("services/data.store.pg.ts"), { getUserByIdPg: async (id) => users.get(id) || null }],
    [files("services/data.store.allwain.pg.ts"), { getAllwainScanRequestByIdPg: async (id) => {
      requestLookups.push(id);
      return id === request.id ? request : null;
    } }],
    [files("services/admin-mfa.service.ts"), { assertAdminMfa: async (identity) => {
      assert.equal(identity.id, "admin");
      assert.equal(identity.role, "admin");
      assert.equal(identity.email, "admin@example.test");
      assert.equal(identity.sessionId, "fixture-admin");
      assert.equal(identity.sourceApp, "allwain");
      adminMfa.checks.push({ ...identity });
      if (!adminMfa.verified) throw new Error("ADMIN_MFA_REQUIRED");
    } }],
    [files("services/allwain-money.ts"), { getAllwainDeliveryPricingConfig: () => ({}) }],
    [files("middleware/operation-rate-limit.middleware.ts"), { allwainAiRateLimit: (_req, _res, next) => next(), allwainOcrRateLimit: (_req, _res, next) => next() }],
    [files("services/auth-session.service.ts"), { resolveAccessToken: async (token) => {
      const actor = users.get(token);
      if (!actor) throw new Error("INVALID_FIXTURE_TOKEN");
      return { ...actor, email: `${actor.id}@example.test`, sessionId: `fixture-${actor.id}`, sourceApp: "allwain" };
    } }],
  ]);
  const real = new Set([
    files("routes/allwain.routes.ts"), files("middleware/auth.middleware.ts"),
    files("services/allwain.service.ts"), files("services/allwain-card-images.service.ts"),
  ]);
  const modules = new Map();
  function load(filename) {
    if (stubs.has(filename)) return stubs.get(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    if (!real.has(filename)) return {};
    const module = { exports: {} };
    modules.set(filename, module);
    const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
    }).outputText;
    const isolatedRequire = (id) => {
      if (id.startsWith(".")) return load(path.resolve(path.dirname(filename), `${id}.ts`));
      if (id === "express" || ["fs", "path", "crypto"].includes(id) || id.startsWith("node:")) return require(id);
      if (id === "@prisma/client") return { Prisma: {} };
      throw new Error(`Unexpected media test dependency: ${id}`);
    };
    // Share Error so fixture exceptions follow the real middleware's instanceof
    // branch and retain the MFA challenge code rather than a VM realm mismatch.
    vm.runInNewContext(javascript, { module, exports: module.exports, require: isolatedRequire, Buffer, Date, URL, Error }, { filename });
    return module.exports;
  }
  return {
    request, users, adminMfa, requestLookups,
    service: load(files("services/allwain.service.ts")),
    images: load(files("services/allwain-card-images.service.ts")),
    router: () => load(files("routes/allwain.routes.ts")).default,
  };
}

async function httpFixture(run) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "allwain-private-media-"));
  const imageFile = path.join(uploadDir, `${requestId}.png`);
  fs.writeFileSync(imageFile, imageBytes);
  let server;
  try {
    const fixture = harness(uploadDir);
    const app = express();
    app.use("/api/allwain", fixture.router());
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/allwain/media/uploads/`;
    const get = async (token, filename = `${requestId}.png`) => {
      const response = await fetch(`${baseUrl}${filename}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
    };
    await run({ ...fixture, get });
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    fs.unlinkSync(imageFile);
    fs.rmdirSync(uploadDir);
  }
}

describe("Allwain source image privacy", () => {
  it("public request images are curated illustrations for original, captured and misleading legacy metadata", () => {
    const h = harness();
    for (const source of ["original", "captured", "illustrative", "unknown", undefined]) {
      const metadata = { source, hasImage: true, url: h.request.imageMeta.url, alt: "Nombre y dirección de factura", bytesApprox: 12345, mimeType: "image/png", privateOriginalPath: "private", rawText: "private" };
      const before = structuredClone(metadata);
      const image = h.images.publicRequestCardImageMeta(metadata, h.request.extracted, h.request.title);
      assert.match(image.url, /\/card-images\/coffee\.jpg\?v=1$/);
      assert.notEqual(image.url, metadata.url);
      assert.equal(image.hasImage, false);
      assert.equal(image.illustrative, true);
      assert.equal(image.source, "illustrative");
      assert.equal(image.alt, "Café");
      assert.deepEqual(Object.keys(image).sort(), ["alt", "assignedAt", "hasImage", "illustrative", "key", "source", "url"].sort());
      assert.deepEqual(metadata, before, "do not change stored private metadata");
    }
  });

  it("the private owner image helper retains the original capture", () => {
    const h = harness();
    const image = h.images.ensureAllwainRequestImageMeta(h.request.imageMeta, h.request.extracted, h.request.title);
    assert.equal(image.url, h.request.imageMeta.url);
    assert.equal(image.source, "captured");
    assert.equal(image.illustrative, false);
  });

  it("the real media HTTP route denies anonymous, seller, stranger and unrelated admin access", () => httpFixture(async (h) => {
    assert.equal((await h.get()).status, 401);
    assert.equal((await h.get("unknown-token")).status, 401);
    for (const state of ["draft", "ready", "submitted", "awarded", "closed", "canceled", "archived"]) {
      h.request.status = state;
      for (const actor of ["seller", "stranger", "admin"]) {
        const response = await h.get(actor);
        assert.equal(response.status, 404, `${actor}/${state}`);
        assert.equal(response.bytes.equals(imageBytes), false);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      }
    }
    assert.equal(h.adminMfa.checks.length, 7, "the real middleware checks MFA on every admin request");
    assert.equal(h.requestLookups.length, 21, "verified MFA still runs the real image ownership checks");
  }));

  it("the real auth middleware rejects an admin awaiting MFA before image lookup", () => httpFixture(async (h) => {
    h.adminMfa.verified = false;
    const response = await h.get("admin");
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.bytes.toString("utf8")).error, "ADMIN_MFA_REQUIRED");
    assert.equal(response.bytes.equals(imageBytes), false);
    assert.equal(h.adminMfa.checks.length, 1);
    assert.deepEqual(h.requestLookups, [], "MFA challenge precedes media access and ownership lookup");
  }));

  it("the active owner can read original bytes without reusable HTTP caching, including archived history", () => httpFixture(async (h) => {
    for (const state of ["draft", "submitted", "awarded", "closed", "archived"]) {
      h.request.status = state;
      const response = await h.get("buyer");
      assert.equal(response.status, 200, state);
      assert.deepEqual(response.bytes, imageBytes);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
    assert.equal((await h.get("buyer", "invalid-file.png")).status, 404);
    assert.equal((await h.get("buyer", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png")).status, 404);
  }));

  it("disabled, locked and deleted owner records cannot read the original even if token resolution returns them", () => httpFixture(async (h) => {
    const owner = h.users.get("buyer");
    for (const status of ["disabled", "locked"]) {
      owner.status = status;
      assert.equal((await h.get("buyer")).status, 404, status);
    }
    owner.status = "active";
    owner.deletedAt = "2026-10-04T00:00:00.000Z";
    assert.equal((await h.get("buyer")).status, 404);
    h.users.delete("buyer");
    assert.equal((await h.get("buyer")).status, 401);
  }));
});
