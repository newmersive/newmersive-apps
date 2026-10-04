const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { harness, catalog } = require("./allwain-offer-integrity.spec.cjs");

describe("Pass 3 discovery using actual JSON services", () => {
  it("finds a relevant publication after 1,000 unrelated rows before page limit", async () => {
    const h = harness({ driver: "json", offers: [...Array.from({ length: 1_000 }, (_, i) => catalog({ id: `unrelated-${i}`, title: "Cajas de naranjas", description: "", createdAt: "2026-10-04T10:00:00Z" })), catalog({ id: "wanted", title: "Lavadora Bosch", description: "", category: "Hogar", productKind: "appliance", unit: "ud", currency: "EUR", price: 450, createdAt: "2026-01-01T10:00:00Z" })] });
    const result = await h.service.listAllwainOfferPage("buyer", { limit: 1, category: "electrodomesticos", subcategory: null, productKind: "appliance", unit: "ud", currency: "EUR", minPrice: 400, maxPrice: 500 });
    assert.deepEqual(Array.from(result.items, (row) => row.id), ["wanted"]); assert.equal(result.pageInfo.hasNextPage, false);
  });
  it("preserves legacy household washing machines and excludes oranges/electronics/vehicles/services", async () => {
    const h = harness({ driver: "json", offers: [catalog({ id: "washer", title: "Lavadora", category: "Hogar", description: "" }), catalog({ id: "orange", category: "Alimentación" }), catalog({ id: "tv", title: "Televisor", category: "electronica", productKind: "electronics", description: "" }), catalog({ id: "car", title: "Coche", category: "vehiculos", productKind: "vehicle", description: "" }), catalog({ id: "repair", title: "Reparación", category: "servicios", productKind: "service", description: "" })] });
    for (const [category, id] of [["electrodomesticos", "washer"], ["alimentacion", "orange"], ["electronica", "tv"], ["vehiculos", "car"], ["servicios", "repair"]]) assert.deepEqual(Array.from((await h.service.listAllwainOfferPage("buyer", { limit: 1, category })).items, (row) => row.id), [id]);
  });
  it("keyset pages equal-date rows without duplicates and binds cursor to filters/owner/sort", async () => {
    const h = harness({ driver: "json", offers: ["a", "b", "c"].map((id) => catalog({ id, unit: "kg", currency: "EUR" })) });
    const first = await h.service.listAllwainOfferPage("buyer", { limit: 1 });
    assert.equal(first.items[0].id, "c"); assert.ok(first.pageInfo.nextCursor.includes("."));
    const next = await h.service.listAllwainOfferPage("buyer", { limit: 1, cursor: first.pageInfo.nextCursor });
    assert.equal(next.items[0].id, "b");
    for (const changes of [{ query: "Naranjas" }, { ownerUserId: "seller" }, { unit: "kg", currency: "EUR", sort: "price_asc" }]) await assert.rejects(h.service.listAllwainOfferPage(changes.ownerUserId || "buyer", { limit: 1, cursor: first.pageInfo.nextCursor, ...changes }), /INVALID_DISCOVERY_CURSOR/);
    await assert.rejects(h.service.listAllwainOfferPage("buyer", { limit: 1, cursor: first.pageInfo.nextCursor.replace(/.$/, "!") }), /INVALID_DISCOVERY_CURSOR/);
  });
  it("price comparisons require explicit comparable unit and currency and reject malformed ranges", async () => {
    const h = harness({ driver: "json" });
    for (const filters of [{ minPrice: 1 }, { sort: "price_asc" }, { unit: "kg", currency: "EUR", minPrice: 5, maxPrice: 1 }, { unit: "kg", currency: "EUR", maxPrice: NaN }]) await assert.rejects(h.service.listAllwainOfferPage("buyer", { limit: 1, ...filters }), /PRICE_FILTER_REQUIRES_UNIT_CURRENCY|INVALID_DISCOVERY_PRICE/);
  });
  it("unit and subcategory aliases match metadata-only legacy records", async () => {
    const h = harness({ driver: "json", offers: [catalog({ id: "legacy", title: "Lavadora", category: null, subcategory: null, unit: null, currency: null, meta: { category: "hogar", subcategory: "lavadora", unit: "unidad", currency: "EUR" } })] });
    assert.equal((await h.service.listAllwainOfferPage("buyer", { limit: 1, category: "electrodomesticos", subcategory: "lavadoras", unit: "ud", currency: "EUR" })).items[0].id, "legacy");
  });
  it("proximity handles dateline and excludes rows without valid approximate coordinates", () => {
    const { discovery } = harness({ driver: "json" });
    const filters = { latitude: 0, longitude: 179.9, radiusKm: 30 };
    assert.equal(discovery.matchesDiscovery({ extracted: { locationLatApprox: 0, locationLngApprox: -179.9 } }, filters), true);
    assert.equal(discovery.matchesDiscovery({ deliveryAddress: { latitude: 0, longitude: 179.9 } }, filters), false);
    assert.equal(discovery.matchesDiscovery({ extracted: { locationLatApprox: 0, locationLngApprox: 178 } }, filters), false);
    assert.throws(() => discovery.validateDiscovery({ latitude: 40, radiusKm: 20 }), /INVALID_DISCOVERY_LOCATION/);
  });
  it("response active excludes expired, selected, withdrawn and empty proposals", () => {
    const { discovery } = harness({ driver: "json" });
    for (const offer of [null, { allwainStatus: "withdrawn" }, { allwainStatus: "selected" }, { allwainStatus: "active", proposalExpiresAt: "2020-01-01" }]) assert.equal(Boolean(discovery.matchesResponse(offer, "active")), false);
    assert.equal(discovery.matchesResponse({ allwainStatus: "active", proposalExpiresAt: "2099-01-01" }, "active"), true);
    assert.equal(discovery.matchesResponse(null, "none"), true);
    assert.equal(discovery.matchesResponse(null, "any"), false);
    assert.equal(discovery.matchesResponse({ allwainStatus: "withdrawn" }, "any"), true);
  });
  it("date-only end is inclusive, impossible dates and reversed ranges fail", () => {
    const { discovery } = harness({ driver: "json" });
    assert.equal(discovery.discoveryDate("2026-10-04", true).toISOString(), "2026-10-04T23:59:59.999Z");
    assert.throws(() => discovery.validateDiscovery({ dateFrom: "2026-02-30" }), /INVALID_DISCOVERY_DATE/);
    assert.throws(() => discovery.validateDiscovery({ dateFrom: "2026-10-04", dateTo: "2026-10-03" }), /INVALID_DISCOVERY_DATE/);
  });
  it("own scan filters reach an old request beyond 1,000 rows without mixing another account", async () => {
    const request = (id, extra = {}) => ({ id, userId: "buyer", sourceType: "manual", status: "submitted", visibility: "public", title: "Naranjas", description: "", extracted: { category: "alimentacion", productKind: "produce_weight", unit: "kg", currency: "EUR", confidence: 1 }, offers: [], ai: {}, createdAt: "2026-10-04T10:00:00Z", ...extra });
    const h = harness({ driver: "json", requests: [...Array.from({ length: 1_000 }, (_, index) => request(`orange-${index}`)), request("wanted", { title: "Lavadora", status: "closed", createdAt: "2026-01-01T10:00:00Z", extracted: { category: "Hogar", unit: "unidad", currency: "EUR", targetPrice: 450, locationLabel: "Foios", locationLatApprox: 39.538, locationLngApprox: -0.357, confidence: 1 } }), request("foreign", { userId: "stranger", title: "Lavadora" })] });
    const result = await h.service.listAllwainScanRequestPage("buyer", { limit: 1, statuses: ["closed", "canceled"], category: "electrodomesticos", unit: "ud", currency: "EUR", minPrice: 400, maxPrice: 500, latitude: 39.538, longitude: -0.357, radiusKm: 1 });
    assert.equal(result.items[0].id, "wanted"); assert.equal(result.pageInfo.hasNextPage, false);
    assert.equal((await h.service.listAllwainScanRequestPage("stranger", { limit: 1, statuses: ["closed"] })).items.length, 0);
  });
  it("market JSON response and approximate zone filters precede pagination without returning private addresses", async () => {
    const request = (id, extra = {}) => ({ id, userId: "buyer", sourceType: "manual", status: "submitted", visibility: "public", title: "Lavadora", description: "", extracted: { category: "Hogar", unit: "ud", currency: "EUR", locationLatApprox: 39.538, locationLngApprox: -0.357, deliveryAddress: "Dirección privada", confidence: 1 }, offers: [], ai: {}, createdAt: "2026-10-04T10:00:00Z", ...extra });
    const h = harness({ driver: "json", requests: [...Array.from({ length: 1_000 }, (_, index) => request(`none-${index}`)), request("wanted", { createdAt: "2026-01-01T10:00:00Z" })], offers: [catalog({ id: "withdrawn", allwainType: "proposal", requestId: "wanted", allwainStatus: "withdrawn" })] });
    const result = await h.service.listAllwainMarketRequestPage("seller", { limit: 1, responseStatus: "withdrawn", latitude: 39.538, longitude: -0.357, radiusKm: 1 });
    assert.equal(result.items[0].id, "wanted"); assert.equal(result.pageInfo.hasNextPage, false); assert.equal(result.items[0].extracted.deliveryAddress, undefined);
  });
});
