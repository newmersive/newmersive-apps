import assert from "node:assert/strict";
import { before, after, describe, it } from "node:test";
import { app } from "../src/server";
import { getDatabase, persistDatabase } from "../src/services/data.store";
import { getPrisma, closePrisma } from "../src/db/prisma";
import { ENV } from "../src/config/env";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);
const prefix = `skills-${Date.now()}`;
const headers: Record<string, Record<string, string>> = {};
const ids: Record<string, string> = {};
let offerId: string; let tradeId: string; let contractId: string;
const api = (path: string) => `/trueqia${path}`;
const post = (who: string, path: string, body = {}) => client.post(api(path), body, headers[who]);
const get = (who: string, path: string) => client.get(api(path), headers[who]);
const patch = (who: string, path: string, body: any) => client.patch(api(path), body, headers[who]);
const skill = (overrides = {}) => ({ title: "Diseño de una tarjeta", description: "Una tarjeta de visita con revisión conjunta.", tokens: 25, category: "design", mode: "remote", included: "Una propuesta y una revisión", excluded: "Impresión", duration: "Dos sesiones", availability: "Tardes", portfolioUrl: "https://example.com/portfolio", ...overrides });

describe(`Trueqia workspace (${ENV.STORAGE_DRIVER})`, () => {
  before(async () => {
    assert.equal(ENV.NODE_ENV, "test");
    if (ENV.STORAGE_DRIVER === "postgres") assert.ok(["127.0.0.1", "localhost", "[::1]", "::1"].includes(new URL(ENV.DATABASE_URL!).hostname));
    await client.start();
    for (const name of ["requester", "provider", "other"]) {
      const result = await client.post("/auth/register", { name: `Test ${name}`, email: `${prefix}-${name}@example.test`, password: "OnlyLocalTest_2026!", sourceApp: "trueqia" });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      ids[name] = result.body.user.id; headers[name] = { Authorization: `Bearer ${result.body.token}` };
    }
    if (ENV.STORAGE_DRIVER === "postgres") await getPrisma().user.update({ where: { id: ids.requester }, data: { tokens: 1000 } });
    else { getDatabase().users.find(x => x.id === ids.requester)!.tokens = 1000; persistDatabase(); }
  });
  after(async () => { await client.stop(); await closePrisma(); });

  it("validates titles, integers, HTTPS and rejects publishing duplicate simultaneous requests", async () => {
    for (const invalid of [{ title: "  " }, { tokens: 0 }, { tokens: 1.5 }, { tokens: -1 }, { portfolioUrl: "javascript:alert(1)" }, { mode: "unsafe" }, { publicListing: "true" }]) {
      assert.equal((await post("provider", "/offers", skill(invalid))).status, 400);
    }
    const results = await Promise.all(Array.from({ length: 4 }, () => post("provider", "/offers", skill({ clientRequestId: `${prefix}-one` }))));
    for (const result of results) assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(new Set(results.map(x => x.body.id)).size, 1);
    offerId = results[0].body.id;
    assert.equal(results[0].body.owner.tokens, undefined);
    assert.equal(results[0].body.owner.email, undefined);
  });

  it("separates explicit public discovery and sanitizes profiles", async () => {
    assert.equal((await client.get(api(`/discover/${offerId}`))).status, 404);
    const privateProfile = await patch("provider", "/profiles/me", { displayName: "Clara", bio: "Diseño sencillo y con calma", portfolioUrl: "https://example.com", avatarUrl: "https://example.com/avatar.jpg", locationLabel: "Foios", isPublic: false });
    assert.equal(privateProfile.status, 200);
    assert.equal((await get("other", `/profiles/${ids.provider}`)).body.bio, undefined);
    assert.equal((await client.get(api(`/discover/profiles/${ids.provider}`))).status, 404);
    assert.equal((await patch("provider", `/offers/${offerId}`, { publicListing: true })).status, 200);
    let discovery = await client.get(api(`/discover/${offerId}`));
    assert.equal(discovery.status, 200); assert.equal(discovery.body.owner.name, "Miembro de Trueqia");
    assert.equal(discovery.body.meta, undefined); assert.equal(discovery.body.ownerUserId, undefined);
    await patch("provider", "/profiles/me", { isPublic: true });
    discovery = await client.get(api(`/discover/${offerId}`));
    assert.equal(discovery.body.owner.name, "Clara");
    const profile = await client.get(api(`/discover/profiles/${ids.provider}`));
    assert.equal(profile.body.bio, "Diseño sencillo y con calma");
    assert.equal(profile.body.email, undefined); assert.equal(profile.body.tokens, undefined);
    assert.equal((await patch("other", `/offers/${offerId}`, { title: "Robo" })).status, 404);
  });

  it("filters and paginates server-side, allows management and hides paused skills", async () => {
    await post("provider", "/offers", skill({ title: "Otra habilidad", category: "language", clientRequestId: `${prefix}-two` }));
    const page = await get("requester", "/offers?category=design&limit=1&offset=0");
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.equal(page.body.items[0].id, offerId);
    assert.equal((await patch("provider", `/offers/${offerId}`, { status: "paused" })).status, 200);
    assert.equal((await get("requester", `/offers/${offerId}`)).status, 404);
    assert.equal((await client.get(api(`/discover/${offerId}`))).status, 404);
    const own = await get("provider", "/offers?mine=true");
    assert.ok(own.body.items.some((x: any) => x.id === offerId && x.status === "paused"));
    await patch("provider", `/offers/${offerId}`, { status: "active" });
  });

  it("deduplicates proposals and snapshots skill conditions before later edits", async () => {
    const proposals = await Promise.all(Array.from({ length: 5 }, () => post("requester", "/trades", { offerId, toUserId: ids.provider, tokens: 25 })));
    assert.ok(proposals.every(x => x.status === 201));
    assert.equal(new Set(proposals.map(x => x.body.id)).size, 1);
    tradeId = proposals[0].body.id;
    await patch("provider", `/offers/${offerId}`, { title: "Título actualizado", description: "Condiciones para nuevas solicitudes", tokens: 30 });
    const trade = await get("requester", `/trades/${tradeId}`);
    assert.equal(trade.body.trade.title, "Diseño de una tarjeta"); assert.equal(trade.body.trade.tokens, 25);
    assert.equal((await post("provider", `/trades/${tradeId}/accept`)).status, 200);
  });

  it("negotiates versions bilaterally, invalidates stale drafts and blocks stale or unsigned terms", async () => {
    const previewBody = { tradeId, offerTitle: "Tarjeta", requesterName: "Solicitante", providerName: "Proveedor", tokens: 25 };
    const first = await post("requester", "/contracts/preview", previewBody);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const terms = { sessions: 2, deliverable: "Tarjeta final en PDF", dueDate: "2026-12-01", revisions: 1, excluded: "Impresión" };
    const proposal = await post("provider", `/trades/${tradeId}/negotiations`, { tokens: 20, terms, expectedVersion: 0 });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal((await post("requester", `/contracts/${first.body.id}/accept`)).status, 409);
    assert.equal((await post("requester", `/trades/${tradeId}/negotiations`, { tokens: 20, terms, expectedVersion: 0 })).status, 409);
    const accepted = await post("requester", `/trades/${tradeId}/negotiations/accept`, { version: 1 });
    assert.equal(accepted.body.trade.tokens, 20);
    assert.equal(accepted.body.trade.negotiation.status, "accepted");
    const previews = await Promise.all([post("requester", "/contracts/preview", previewBody), post("provider", "/contracts/preview", previewBody)]);
    assert.ok(previews.every(x => x.status === 201), JSON.stringify(previews));
    assert.equal(previews[0].body.id, previews[1].body.id);
    contractId = previews[0].body.id;
    assert.equal(previews[0].body.version, 2); assert.equal(previews[0].body.replacesId, first.body.id);
    assert.equal(previews[0].body.tokens, 20); assert.match(previews[0].body.generatedText, /Tarjeta final en PDF/);
    const partial = await post("requester", `/contracts/${contractId}/accept`);
    assert.equal(partial.status, 200); assert.equal(partial.body.status, "partially_accepted");
    assert.equal((await post("provider", `/trades/${tradeId}/negotiations`, { tokens: 10, terms, expectedVersion: 1 })).status, 409);
  });

  it("transfers only once at activation and exposes only recorded token movements", async () => {
    const before = await get("requester", "/tokens/movements");
    assert.equal(before.body.items.length, 0); assert.equal(before.body.balance, 1000);
    const signed = await Promise.all(Array.from({ length: 3 }, () => post("provider", `/contracts/${contractId}/accept`)));
    assert.ok(signed.every(x => x.status === 200), JSON.stringify(signed));
    const requester = await get("requester", "/tokens/movements");
    assert.equal(requester.body.balance, 980); assert.equal(requester.body.items.length, 1);
    assert.equal(requester.body.items[0].direction, "out"); assert.equal(requester.body.items[0].amount, 20);
    assert.equal((await post("requester", `/trades/${tradeId}/cancellation`, { reason: "No quiero continuar" })).status, 409);
  });

  it("records private issues and a bilateral solution without token reversals", async () => {
    const agreementBefore = await get("requester", `/contracts/${contractId}`);
    const created = await post("requester", `/trades/${tradeId}/issues`, { kind: "delay", description: "Necesitamos otra fecha", evidenceUrl: "https://example.com/reference" });
    assert.equal(created.status, 201);
    const issueId = created.body.trade.issues[0].id;
    assert.equal((await post("other", `/trades/${tradeId}/issues/${issueId}/messages`, { text: "Acceso externo" })).status, 404);
    await post("provider", `/trades/${tradeId}/issues/${issueId}/messages`, { text: "Propongo el viernes" });
    const resolution = await post("provider", `/trades/${tradeId}/issues/${issueId}/resolution`, { text: "Entregar el viernes" });
    assert.equal(resolution.body.trade.issues[0].status, "resolution_proposed");
    const accepted = await post("requester", `/trades/${tradeId}/issues/${issueId}/resolution/accept`, { expectedText: "Entregar el viernes" });
    assert.equal(accepted.body.trade.issues[0].status, "resolved");
    assert.equal((await get("requester", `/contracts/${contractId}`)).body.updatedAt, agreementBefore.body.updatedAt);
    assert.equal((await get("requester", "/tokens/movements")).body.balance, 980);
  });

  it("cancels bilaterally before transfer and blocks subsequent signing", async () => {
    const skillRes = await post("provider", "/offers", skill({ title: "Sesión para cancelar", clientRequestId: `${prefix}-cancel` }));
    const trade = await post("requester", "/trades", { offerId: skillRes.body.id, toUserId: ids.provider });
    await post("provider", `/trades/${trade.body.id}/accept`);
    const contract = await post("requester", "/contracts/preview", { tradeId: trade.body.id, offerTitle: "Prueba", requesterName: "A", providerName: "B", tokens: 25 });
    assert.equal((await post("requester", `/trades/${trade.body.id}/cancellation`, { reason: "Cambio de disponibilidad" })).status, 200);
    assert.equal((await post("provider", `/contracts/${contract.body.id}/accept`)).status, 409);
    const pending = await get("provider", `/trades/${trade.body.id}`);
    const cancelled = await post("provider", `/trades/${trade.body.id}/cancellation/accept`, { expectedCreatedAt: pending.body.trade.cancellation.createdAt });
    assert.equal(cancelled.body.trade.status, "cancelled");
    assert.equal((await post("provider", `/contracts/${contract.body.id}/accept`)).status, 409);
    assert.equal((await get("requester", "/tokens/movements")).body.balance, 980);
  });

  it("serializes acceptance of unique skills across different requesters", async () => {
    const offer = await post("provider", "/offers", skill({ title: "Una única plaza", isUnique: true, clientRequestId: `${prefix}-unique` }));
    const first = await post("requester", "/trades", { offerId: offer.body.id, toUserId: ids.provider });
    const second = await post("other", "/trades", { offerId: offer.body.id, toUserId: ids.provider });
    const accepted = await Promise.all([post("provider", `/trades/${first.body.id}/accept`), post("provider", `/trades/${second.body.id}/accept`)]);
    assert.equal(accepted.filter(x => x.status === 200).length, 1, JSON.stringify(accepted));
    assert.equal(accepted.filter(x => x.status === 409).length, 1);
    const list = await get("provider", "/trades");
    assert.equal(list.body.items.filter((x: any) => x.offerId === offer.body.id && x.status === "accepted").length, 1);
    assert.equal((await patch("provider", `/offers/${offer.body.id}`, { isUnique: false })).status, 409);
  });
  it("keeps legacy snapshots and rejects stale resolution/cancellation confirmations", async () => {
    const offering = await post("provider", "/offers", skill({ title: "Título legado", clientRequestId: `${prefix}-legacy` }));
    const trade = await post("requester", "/trades", { offerId: offering.body.id, toUserId: ids.provider });
    if (ENV.STORAGE_DRIVER === "postgres") await getPrisma().$executeRawUnsafe('UPDATE "Trade" SET "trueqiaDetails" = NULL WHERE "id" = $1', trade.body.id);
    else { getDatabase().trades.find(x => x.id === trade.body.id)!.trueqiaDetails = null; persistDatabase(); }
    await patch("provider", `/offers/${offering.body.id}`, { title: "Futuras publicaciones" });
    assert.equal((await get("requester", `/trades/${trade.body.id}`)).body.trade.title, "Título legado");
    await post("provider", `/trades/${trade.body.id}/accept`);
    const cancellation = await post("requester", `/trades/${trade.body.id}/cancellation`, { reason: "Pendiente de decidir" });
    assert.equal((await post("provider", `/trades/${trade.body.id}/cancellation/accept`, { expectedCreatedAt: "stale" })).status, 409);
    const declined = await post("provider", `/trades/${trade.body.id}/cancellation/decline`, { expectedCreatedAt: cancellation.body.trade.cancellation.createdAt });
    assert.equal(declined.body.trade.status, "accepted");
    assert.equal(declined.body.trade.cancellation.status, "declined");
    assert.equal(declined.body.trade.cancellationHistory.length, 1);
    const issue = await post("requester", `/trades/${trade.body.id}/issues`, { kind: "other", description: "Aclarar alcance" });
    const issueId = issue.body.trade.issues[0].id;
    await post("provider", `/trades/${trade.body.id}/issues/${issueId}/resolution`, { text: "Versión A" });
    await post("provider", `/trades/${trade.body.id}/issues/${issueId}/resolution`, { text: "Versión B" });
    assert.equal((await post("requester", `/trades/${trade.body.id}/issues/${issueId}/resolution/accept`, { expectedText: "Versión A" })).status, 409);
    const revised = await post("requester", `/trades/${trade.body.id}/issues/${issueId}/resolution/accept`, { expectedText: "Versión B" });
    assert.equal(revised.body.trade.issues[0].resolutionHistory.length, 2);
    assert.equal(revised.body.trade.issues[0].status, "resolved");
  });

  it("creates needs and private responses without starting or charging a trade", async () => {
    assert.equal((await client.get(api("/needs"))).status, 401);
    assert.equal((await post("requester", "/needs", { title: " ", description: "Ayuda" })).status, 400);
    const duplicateNeeds = await Promise.all(Array.from({ length: 3 }, () => post("requester", "/needs", { title: "Otra necesidad", description: "Publicación reintentada", clientRequestId: `${prefix}-need` })));
    assert.ok(duplicateNeeds.every(x => x.status === 201));
    assert.equal(new Set(duplicateNeeds.map(x => x.body.id)).size, 1);
    const need = await post("requester", "/needs", { title: "Necesito una tarjeta", description: "Busco ayuda con una tarjeta sencilla", category: "design", mode: "remote", availability: "Esta semana" });
    assert.equal(need.status, 201, JSON.stringify(need.body));
    const id = need.body.id;
    assert.equal((await patch("other", `/needs/${id}`, { title: "Ajena" })).status, 404);
    assert.equal((await post("requester", `/needs/${id}/responses`, { offerId, message: "Yo" })).status, 409);
    assert.equal((await post("other", `/needs/${id}/responses`, { offerId, message: "Oferta ajena" })).status, 404);
    const tradesBefore = await get("requester", "/trades");
    const responses = await Promise.all(Array.from({ length: 3 }, () => post("provider", `/needs/${id}/responses`, { offerId, message: "Puedo ayudarte con mi habilidad" })));
    assert.ok(responses.every(x => x.status === 201), JSON.stringify(responses));
    assert.equal(new Set(responses.map(x => x.body.id)).size, 1);
    const own = await get("requester", `/needs/${id}`);
    assert.equal(own.body.responses.length, 1); assert.equal(own.body.responses[0].offer.id, offerId);
    assert.equal((await get("provider", `/needs/${id}`)).body.responses.length, 1);
    assert.equal((await get("other", `/needs/${id}`)).body.responses.length, 0);
    assert.equal((await get("requester", "/trades")).body.items.length, tradesBefore.body.items.length);
    assert.equal((await get("requester", "/tokens/movements")).body.balance, 980);
    const list = await get("other", "/needs?category=design&mode=remote&limit=1");
    assert.equal(list.status, 200); assert.equal(list.body.items[0].id, id);
    await patch("requester", `/needs/${id}`, { status: "closed" });
    assert.equal((await post("provider", `/needs/${id}/responses`, { offerId, message: "Más ayuda" })).status, 409);
    assert.ok((await get("requester", "/needs?mine=true")).body.items.some((x: any) => x.id === id && x.status === "closed"));
  });

});
