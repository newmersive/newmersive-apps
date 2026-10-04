import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";
import { createSyntheticAdmin } from "./helpers/synthetic-admin";

const client = new TestClient(app);

describe("TrueQIA contract routes", () => {
  let token: string;
  let fixtureUserId: string;
  let providerToken: string;
  let providerUserId: string;
  let contractId: string;

  before(async () => {
    await client.start();
    const login = await createSyntheticAdmin(client, "trueqia-contract-admin");
    token = login.token;
    fixtureUserId = login.user.id;

    const providerEmail = `contract-provider+${Date.now()}@test.local`;
    const provider = await client.post("/auth/register", {
      name: "Provider Demo",
      email: providerEmail,
      password: "Provider123!",
      sourceApp: "trueqia",
    });
    providerToken = provider.body.token;
    providerUserId = provider.body.user.id;
  });

  after(async () => {
    await client.stop();
  });

  it("lists available contract templates", async () => {
    const missingAuth = await client.get("/trueqia/contracts/templates");
    assert.equal(missingAuth.status, 401);

    const res = await client.get("/trueqia/contracts/templates", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length, 4);

    const contentRights = res.body.items.find(
      (item: any) => item.id === "trueqia-content-rights"
    );
    assert.ok(contentRights);
    assert.equal(contentRights.version, "1.0.0");
    assert.equal(contentRights.label, "Derechos");
    assert.ok(contentRights.title.includes("derechos de uso"));
    assert.ok(contentRights.summary);
    assert.equal(contentRights.clauses, undefined);
  });

  it("creates a contract draft with trade metadata", async () => {
    const offer = await client.post(
      "/trueqia/offers",
      {
        title: "Fotografia contractual con derechos",
        description: "Sesion creativa con entrega de imagenes para redes.",
        tokens: 30,
      },
      { Authorization: `Bearer ${providerToken}` }
    );
    const proposedTrade = await client.post(
      "/trueqia/trades",
      { offerId: offer.body.id, toUserId: providerUserId, tokens: 30 },
      { Authorization: `Bearer ${token}` }
    );
    const trade = await client.post(
      `/trueqia/trades/${proposedTrade.body.id}/accept`,
      {},
      { Authorization: `Bearer ${providerToken}` }
    );
    assert.equal(trade.status, 200);

    const res = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: offer.body.title,
        requesterName: "Admin Demo",
        providerName: "Admin Demo",
        tokens: trade.body.tokens,
        tradeId: trade.body.id,
        offerId: trade.body.offerId,
        toUserId: trade.body.toUserId,
        notes: "Entregar antes de cerrar el mes.",
        description: "Acuerdo operativo de prueba.",
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.app, "trueqia");
    assert.equal(res.body.status, "draft");
    contractId = res.body.id;
    assert.equal(res.body.tradeId, trade.body.id);
    assert.equal(res.body.offerId, trade.body.offerId);
    assert.equal(res.body.requesterUserId, fixtureUserId);
    assert.equal(res.body.tokens, trade.body.tokens);
    assert.equal(res.body.templateId, "trueqia-content-rights");
    assert.equal(res.body.templateVersion, "1.0.0");
    assert.ok(res.body.generatedText.includes("TrueQIA contenido y derechos de uso v1.0.0"));
    assert.ok(res.body.generatedText.includes("Entregar antes de cerrar el mes."));

    const list = await client.get("/trueqia/contracts", {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(list.status, 200);
    const listed = list.body.items.find((item: any) => item.id === res.body.id);
    assert.ok(listed);
    assert.equal(listed.templateId, "trueqia-content-rights");
    assert.equal(listed.templateVersion, "1.0.0");
  });

  it("exports a contract draft as pdf", async () => {
    assert.ok(contractId);

    const missingAuth = await client.getRaw(`/trueqia/contracts/${contractId}/pdf`);
    assert.equal(missingAuth.status, 401);

    const res = await client.getRaw(`/trueqia/contracts/${contractId}/pdf`, {
      Authorization: `Bearer ${token}`,
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("application/pdf"));
    assert.ok(res.headers["content-disposition"].includes(`trueqia-contract-${contractId}.pdf`));
    assert.equal(res.body.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(res.body.toString("latin1").includes("%%EOF"));
    assert.ok(!res.body.includes(Buffer.from("FEFF", "hex")), "PDF should not expose UTF-16 BOM markers");
    assert.ok(!res.body.toString("latin1").includes("þÿ"), "PDF should not render broken UTF-16 text markers");
  });

  it("auto-selects content rights templates from creative contract text", async () => {
    const res = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: "Sesion fotografica para reels de marca",
        requesterName: "Admin Demo",
        providerName: "Provider Demo",
        tokens: 40,
        notes: "Incluye uso de imagen, piezas de video y assets para redes.",
        description: "Entrega de fotografias y contenido audiovisual para campana.",
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.templateId, "trueqia-content-rights");
    assert.equal(res.body.templateVersion, "1.0.0");
    assert.ok(res.body.generatedText.includes("TrueQIA contenido y derechos de uso v1.0.0"));
    assert.ok(res.body.generatedText.includes("derecho de uso no exclusivo"));
  });

  it("uses a requested contract template when provided", async () => {
    const res = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: "Mentoria operativa con entregables",
        requesterName: "Admin Demo",
        providerName: "Provider Demo",
        tokens: 35,
        templateId: "trueqia-professional-services",
        description: "Sesion de consultoria con revision final.",
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.templateId, "trueqia-professional-services");
    assert.equal(res.body.templateVersion, "1.0.0");
    assert.ok(res.body.generatedText.includes("TrueQIA servicios profesionales v1.0.0"));
    assert.ok(res.body.generatedText.includes("diligencia profesional"));
  });

  it("accepts a contract draft for a participant", async () => {
    assert.ok(contractId);

    const res = await client.post(
      `/trueqia/contracts/${contractId}/accept`,
      {},
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.id, contractId);
    assert.equal(res.body.status, "partially_accepted");
    assert.ok(res.body.requesterAcceptedAt);
    assert.equal(res.body.providerAcceptedAt, null);

    const providerAccept = await client.post(
      `/trueqia/contracts/${contractId}/accept`,
      {},
      { Authorization: `Bearer ${providerToken}` }
    );
    assert.equal(providerAccept.status, 200);
    assert.equal(providerAccept.body.status, "accepted");
    assert.ok(providerAccept.body.providerAcceptedAt);

    const list = await client.get("/trueqia/contracts", {
      Authorization: `Bearer ${token}`,
    });

    const accepted = list.body.items.find((item: any) => item.id === contractId);
    assert.equal(accepted.status, "accepted");
  });

  it("requires both participants to accept when requester and provider differ", async () => {
    const offer = await client.post(
      "/trueqia/offers",
      {
        title: "Revision legal operativa",
        description: "Revision de un acuerdo interno de trueque.",
        tokens: 25,
      },
      { Authorization: `Bearer ${providerToken}` }
    );

    assert.equal(offer.status, 201);

    const draft = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: offer.body.title,
        requesterName: "Admin Demo",
        providerName: "Provider Demo",
        tokens: offer.body.tokens,
        offerId: offer.body.id,
        notes: "Aceptar por ambas partes.",
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(draft.status, 201);
    assert.equal(draft.body.status, "draft");

    const requesterAccept = await client.post(
      `/trueqia/contracts/${draft.body.id}/accept`,
      {},
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(requesterAccept.status, 200);
    assert.equal(requesterAccept.body.status, "partially_accepted");
    assert.ok(requesterAccept.body.requesterAcceptedAt);
    assert.equal(requesterAccept.body.providerAcceptedAt, null);

    const providerAccept = await client.post(
      `/trueqia/contracts/${draft.body.id}/accept`,
      {},
      { Authorization: `Bearer ${providerToken}` }
    );

    assert.equal(providerAccept.status, 200);
    assert.equal(providerAccept.body.status, "accepted");
    assert.ok(providerAccept.body.requesterAcceptedAt);
    assert.ok(providerAccept.body.providerAcceptedAt);
  });

  it("returns 404 when accepting unknown contracts", async () => {
    const res = await client.post(
      "/trueqia/contracts/missing-contract/accept",
      {},
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.error, "CONTRACT_NOT_FOUND");
  });

  it("rejects contract drafts for unknown trades", async () => {
    const res = await client.post(
      "/trueqia/contracts/preview",
      {
        offerTitle: "Contrato imposible",
        requesterName: "Admin Demo",
        providerName: "Proveedor",
        tokens: 10,
        tradeId: "missing-trade",
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.error, "TRADE_NOT_FOUND");
  });
});
