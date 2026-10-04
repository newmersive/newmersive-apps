import assert from "node:assert";
import { after, before, describe, it } from "node:test";

import { app } from "../src/server";
import { closePrisma, getPrisma } from "../src/db/prisma";
import { verifyAllwainAuditChain } from "../src/services/allwain-audit";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);
const prisma = getPrisma();

type Session = {
  userId: string;
  headers: Record<string, string>;
};

async function register(name: string, seller = false): Promise<Session> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await client.post("/auth/register", {
    name,
    email: `shopping-list-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}+${suffix}@test.local`,
    password: "AllwainE2E123!",
    sourceApp: "allwain",
    ...(seller ? { role: "company" } : {}),
  });
  assert.equal(response.status, 201);
  const headers = { Authorization: `Bearer ${response.body.token}` };
  if (seller) {
    const activation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "company", displayName: name },
      headers,
    );
    assert.equal(activation.status, 200);
  }
  return { userId: response.body.user.id, headers };
}

describe("Allwain multi-product shopping lists", () => {
  let buyer: Session;
  let viewer: Session;
  let sellerA: Session;
  let sellerB: Session;

  before(async () => {
    assert.equal(process.env.STORAGE_DRIVER, "postgres");
    await client.start();
    buyer = await register("List Buyer");
    viewer = await register("List Viewer");
    sellerA = await register("List Supplier A", true);
    sellerB = await register("List Supplier B", true);
  });

  after(async () => {
    await client.stop();
    await closePrisma();
  });

  it("persists added and removed draft lines when read again", async () => {
    const created = await client.post("/allwain/shopping-lists", {
      title: "Validación de guardado local", currency: "EUR", proposalWindowDays: 14,
      items: [{ productName: "Leche", quantity: 2, unit: "l" }, { productName: "Arroz", quantity: 1, unit: "kg" }],
    }, buyer.headers);
    assert.equal(created.status, 201);
    const updated = await client.patch(`/allwain/shopping-lists/${created.body.id}`, {
      title: "Validación de guardado local", currency: "EUR", proposalWindowDays: 14,
      items: [{ productName: "Leche", quantity: 3, unit: "l" }, { productName: "Café", quantity: 2, unit: "pack" }],
    }, buyer.headers);
    assert.equal(updated.status, 200);
    const reread = await client.get(`/allwain/shopping-lists/${created.body.id}`, buyer.headers);
    assert.equal(reread.status, 200);
    assert.deepEqual(reread.body.items.map((item: any) => [item.productName, item.quantity]), [["Leche", 3], ["Café", 2]]);
    const forbidden = await client.get(`/allwain/shopping-lists/${created.body.id}`, viewer.headers);
    assert.ok([403, 404].includes(forbidden.status));
  });

  it("publishes, compares, awards and materializes every purchased line atomically", async () => {
    const created = await client.post(
      "/allwain/shopping-lists",
      {
        title: "Compra semanal para la oficina",
        description: "Productos habituales para diez personas.",
        currency: "EUR",
        proposalWindowDays: 14,
        locationLabel: "Foios, Valencia",
        preferredDeliveryChannel: "local_connector",
        recurrence: { enabled: true, interval: "weekly" },
        items: [
          {
            productName: "Naranjas",
            quantity: 10,
            unit: "kg",
            targetUnitPrice: 1.2,
          },
          { productName: "Leche", quantity: 6, unit: "l" },
          { productName: "Lavadoras", quantity: 2, unit: "ud" },
        ],
      },
      buyer.headers,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.status, "draft");
    assert.equal(created.body.items.length, 3);
    assert.equal(created.body.recurrence.interval, "weekly");

    const published = await client.post(
      `/allwain/shopping-lists/${created.body.id}/publish`,
      {},
      buyer.headers,
    );
    assert.equal(published.status, 200);
    assert.equal(published.body.status, "published");
    assert.equal(published.body.version, 2);

    const market = await client.get(
      "/allwain/shopping-lists/market?q=oficina&limit=10",
      sellerA.headers,
    );
    assert.equal(market.status, 200);
    const opportunity = market.body.items.find(
      (item: any) => item.id === created.body.id,
    );
    assert.ok(opportunity);
    assert.equal(opportunity.deliveryAddress, null);
    assert.equal(opportunity.items.length, 3);
    assert.equal(opportunity.proposals.length, 0);

    const proposalBody = (prices: number[]) => ({
      listVersion: published.body.version,
      description: "Suministro completo con productos disponibles y revisados.",
      deliveryEstimate: "Entrega en 48 horas",
      items: published.body.items.map((item: any, index: number) => ({
        shoppingListItemId: item.id,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: prices[index],
      })),
    });
    const proposalA = await client.post(
      `/allwain/shopping-lists/${created.body.id}/proposals`,
      proposalBody([1.2, 1.5, 250]),
      sellerA.headers,
    );
    assert.equal(proposalA.status, 201);
    assert.equal(proposalA.body.myProposal.items.length, 3);
    assert.equal(proposalA.body.myProposal.price, 521);
    assert.equal(
      proposalA.body.myProposal.meta?.shoppingListDefaults?.deliveryAddress,
      undefined,
    );

    const proposalB = await client.post(
      `/allwain/shopping-lists/${created.body.id}/proposals`,
      proposalBody([1.1, 1.4, 275]),
      sellerB.headers,
    );
    assert.equal(proposalB.status, 201);

    const sellerMarketAfterProposal = await client.get(
      "/allwain/shopping-lists/market?q=oficina&limit=10",
      sellerA.headers,
    );
    const sellerSummary = sellerMarketAfterProposal.body.items.find(
      (item: any) => item.id === created.body.id,
    );
    assert.equal(sellerSummary.proposalCount, 2);
    assert.equal(sellerSummary.proposals.length, 1);
    assert.equal(sellerSummary.myProposal.items.length, 0);

    const buyerSummaryPage = await client.get(
      "/allwain/shopping-lists/mine?limit=10",
      buyer.headers,
    );
    const buyerSummary = buyerSummaryPage.body.items.find(
      (item: any) => item.id === created.body.id,
    );
    assert.equal(buyerSummary.proposalCount, 2);
    assert.equal(buyerSummary.proposals.length, 0);

    const privateView = await client.get(
      `/allwain/shopping-lists/${created.body.id}`,
      viewer.headers,
    );
    assert.equal(privateView.status, 200);
    assert.equal(privateView.body.proposalCount, 2);
    assert.equal(privateView.body.proposals.length, 0);

    const buyerView = await client.get(
      `/allwain/shopping-lists/${created.body.id}`,
      buyer.headers,
    );
    assert.equal(buyerView.status, 200);
    assert.equal(buyerView.body.proposals.length, 2);
    const selected = buyerView.body.proposals.find(
      (proposal: any) => proposal.ownerUserId === sellerA.userId,
    );
    const notSelected = buyerView.body.proposals.find(
      (proposal: any) => proposal.ownerUserId === sellerB.userId,
    );
    assert.ok(selected && notSelected);

    const purchaseKey = `allwain:list-test:${created.body.id}`;
    const accepted = await client.post(
      `/allwain/offers/${selected.id}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey,
        recurringOrder: {
          enabled: true,
          interval: "weekly",
          label: "Cada semana",
        },
      },
      buyer.headers,
    );
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.shoppingListId, created.body.id);
    assert.equal(accepted.body.type, "shopping_list_proposal");
    assert.equal(accepted.body.quantity, 1);
    assert.equal(accepted.body.unit, "lista");
    assert.equal(accepted.body.subtotalAmount, 52_100);

    const [storedList, order, lines, offers] = await Promise.all([
      prisma.allwainShoppingList.findUnique({ where: { id: created.body.id } }),
      prisma.allwainOrder.findUnique({
        where: { contractId: accepted.body.id },
      }),
      prisma.allwainOrderLine.findMany({
        where: { order: { contractId: accepted.body.id } },
        orderBy: { productName: "asc" },
      }),
      prisma.offer.findMany({
        where: { shoppingListId: created.body.id },
        orderBy: { ownerUserId: "asc" },
      }),
    ]);
    assert.equal(storedList?.status, "awarded");
    assert.equal(storedList?.selectedOfferId, selected.id);
    assert.equal(order?.shoppingListId, created.body.id);
    assert.equal(lines.length, 3);
    assert.equal(
      lines.reduce((sum, line) => sum + line.subtotalAmount, 0),
      order?.subtotalAmount,
    );
    assert.ok(lines.every((line) => line.shoppingListItemId));
    assert.ok(lines.every((line) => line.shoppingListProposalItemId));
    assert.equal(
      offers.find((offer) => offer.id === selected.id)?.allwainStatus,
      "selected",
    );
    assert.equal(
      offers.find((offer) => offer.id === notSelected.id)?.allwainStatus,
      "not_selected",
    );

    const repeated = await client.post(
      `/allwain/offers/${selected.id}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey,
      },
      buyer.headers,
    );
    assert.equal(repeated.status, 201);
    assert.equal(repeated.body.id, accepted.body.id);
    assert.equal(
      await prisma.allwainOrder.count({
        where: { shoppingListId: created.body.id },
      }),
      1,
    );

    const audit = await verifyAllwainAuditChain(
      "shopping_list",
      created.body.id,
    );
    assert.equal(audit.valid, true);
    assert.ok(audit.count >= 5);
  });

  it("accepts partial proposals and keeps the list open until every item is awarded", async () => {
    const created = await client.post(
      "/allwain/shopping-lists",
      {
        title: "Lista que admite varios proveedores",
        proposalWindowDays: 7,
        items: [
          { productName: "Arroz", quantity: 5, unit: "kg" },
          { productName: "Aceite", quantity: 2, unit: "l" },
          { productName: "Café", quantity: 3, unit: "paquete" },
        ],
      },
      buyer.headers,
    );
    const published = await client.post(
      `/allwain/shopping-lists/${created.body.id}/publish`,
      {},
      buyer.headers,
    );
    const partialA = await client.post(
      `/allwain/shopping-lists/${created.body.id}/proposals`,
      {
        listVersion: published.body.version,
        description: "Puedo suministrar arroz y aceite.",
        deliveryEstimate: "Mañana",
        items: published.body.items.slice(0, 2).map((item: any) => ({
          shoppingListItemId: item.id,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: 2,
        })),
      },
      sellerA.headers,
    );
    assert.equal(partialA.status, 201);
    assert.equal(partialA.body.myProposal.items.length, 2);
    assert.equal(partialA.body.myProposal.coverageKind, "partial");

    const partialB = await client.post(
      `/allwain/shopping-lists/${created.body.id}/proposals`,
      {
        listVersion: published.body.version,
        description: "Puedo suministrar el café.",
        deliveryEstimate: "En 48 horas",
        items: [
          {
            shoppingListItemId: published.body.items[2].id,
            quantity: published.body.items[2].quantity,
            unit: published.body.items[2].unit,
            unitPrice: 4,
          },
        ],
      },
      sellerB.headers,
    );
    assert.equal(partialB.status, 201);

    const firstAward = await client.post(
      `/allwain/offers/${partialA.body.myProposal.id}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey: `partial-a:${created.body.id}`,
      },
      buyer.headers,
    );
    assert.equal(firstAward.status, 201);
    const afterFirst = await client.get(
      `/allwain/shopping-lists/${created.body.id}`,
      buyer.headers,
    );
    assert.equal(afterFirst.body.status, "partially_awarded");
    assert.equal(afterFirst.body.awardedItemCount, 2);
    assert.equal(afterFirst.body.remainingItemCount, 1);
    assert.equal(afterFirst.body.selectedOfferId, null);

    const secondAward = await client.post(
      `/allwain/offers/${partialB.body.myProposal.id}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey: `partial-b:${created.body.id}`,
      },
      buyer.headers,
    );
    assert.equal(secondAward.status, 201);
    const afterSecond = await client.get(
      `/allwain/shopping-lists/${created.body.id}`,
      buyer.headers,
    );
    assert.equal(afterSecond.body.status, "awarded");
    assert.equal(afterSecond.body.awardedItemCount, 3);
    assert.equal(afterSecond.body.remainingItemCount, 0);
    assert.equal(afterSecond.body.orderCount, 2);
    assert.equal(afterSecond.body.selectedOfferId, null);
    assert.equal(
      await prisma.allwainOrderLine.count({
        where: { shoppingListItem: { shoppingListId: created.body.id } },
      }),
      3,
    );
  });

  it("awards once under concurrency, reopens after cancellation and closes after delivery", async () => {
    const created = await client.post(
      "/allwain/shopping-lists",
      {
        title: "Compra única con carrera de selección",
        proposalWindowDays: 7,
        items: [
          { productName: "Café", quantity: 4, unit: "paquete" },
          { productName: "Leche", quantity: 12, unit: "l" },
        ],
      },
      buyer.headers,
    );
    const published = await client.post(
      `/allwain/shopping-lists/${created.body.id}/publish`,
      {},
      buyer.headers,
    );
    const proposal = (prices: number[]) => ({
      listVersion: published.body.version,
      description: "Propuesta completa para la compra única.",
      deliveryEstimate: "Disponible mañana",
      items: published.body.items.map((item: any, index: number) => ({
        shoppingListItemId: item.id,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: prices[index],
      })),
    });
    const [proposalA, proposalB] = await Promise.all([
      client.post(
        `/allwain/shopping-lists/${created.body.id}/proposals`,
        proposal([3.5, 1.2]),
        sellerA.headers,
      ),
      client.post(
        `/allwain/shopping-lists/${created.body.id}/proposals`,
        proposal([3.25, 1.3]),
        sellerB.headers,
      ),
    ]);
    assert.equal(proposalA.status, 201);
    assert.equal(proposalB.status, 201);
    const offerAId = proposalA.body.myProposal.id;
    const offerBId = proposalB.body.myProposal.id;

    const attempts = await Promise.all([
      client.post(
        `/allwain/offers/${offerAId}/accept`,
        {
          quantity: 1,
          deliveryMethod: "pickup",
          deliveryChannel: "pickup",
          purchaseKey: `list-race-a:${created.body.id}`,
        },
        buyer.headers,
      ),
      client.post(
        `/allwain/offers/${offerBId}/accept`,
        {
          quantity: 1,
          deliveryMethod: "pickup",
          deliveryChannel: "pickup",
          purchaseKey: `list-race-b:${created.body.id}`,
        },
        buyer.headers,
      ),
    ]);
    assert.deepEqual(
      attempts.map((attempt) => attempt.status).sort(),
      [201, 409],
    );
    const winner = attempts.find((attempt) => attempt.status === 201);
    assert.ok(winner);
    assert.equal(
      await prisma.allwainOrder.count({
        where: { shoppingListId: created.body.id },
      }),
      1,
    );
    const firstOrder = await prisma.allwainOrder.findUnique({
      where: { contractId: winner.body.id },
    });
    assert.ok(firstOrder);
    const canceled = await client.post(
      `/allwain/payments/orders/${firstOrder.id}/cancel`,
      {},
      buyer.headers,
    );
    assert.equal(canceled.status, 200);
    assert.equal(canceled.body.status, "canceled");
    const reopened = await prisma.allwainShoppingList.findUnique({
      where: { id: created.body.id },
    });
    assert.equal(reopened?.status, "published");
    assert.equal(reopened?.selectedOfferId, null);
    assert.equal(
      await prisma.offer.count({
        where: {
          shoppingListId: created.body.id,
          allwainStatus: "active",
        },
      }),
      2,
    );

    const winningOfferId = firstOrder.offerId;
    const winningSeller = winningOfferId === offerAId ? sellerA : sellerB;
    const originalRevision = await prisma.allwainProposalRevision.findUnique({
      where: { id: firstOrder.acceptedProposalRevisionId! },
    });
    const selectedAgain = await client.post(
      `/allwain/offers/${winningOfferId}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey: `list-reselected:${created.body.id}`,
      },
      buyer.headers,
    );
    assert.equal(selectedAgain.status, 201);
    const completedOrder = await prisma.allwainOrder.findUnique({
      where: { contractId: selectedAgain.body.id },
    });
    assert.ok(completedOrder);
    assert.notEqual(completedOrder.acceptedProposalRevisionId, firstOrder.acceptedProposalRevisionId);
    assert.deepEqual(await prisma.allwainProposalRevision.findUnique({
      where: { id: firstOrder.acceptedProposalRevisionId! },
    }), originalRevision);
    await prisma.$transaction([
      prisma.allwainOrder.update({
        where: { id: completedOrder.id },
        data: {
          status: "paid",
          paymentStatus: "paid",
          fulfillmentStatus: "pending",
        },
      }),
      prisma.contract.update({
        where: { id: selectedAgain.body.id },
        data: { paymentStatus: "paid" },
      }),
    ]);
    for (const action of ["prepare", "ready", "deliver"]) {
      const advanced = await client.post(
        `/allwain/payments/orders/${completedOrder.id}/status`,
        { action },
        winningSeller.headers,
      );
      assert.equal(advanced.status, 200);
    }
    const completed = await client.post(
      `/allwain/payments/orders/${completedOrder.id}/status`,
      { action: "complete" },
      buyer.headers,
    );
    assert.equal(completed.status, 200);
    assert.equal(completed.body.fulfillmentStatus, "completed");
    assert.equal(
      (
        await prisma.allwainShoppingList.findUnique({
          where: { id: created.body.id },
        })
      )?.status,
      "closed",
    );
    const audit = await verifyAllwainAuditChain(
      "shopping_list",
      created.body.id,
    );
    assert.equal(audit.valid, true);

    const duplicated = await client.post(
      `/allwain/shopping-lists/${created.body.id}/duplicate`,
      { proposalWindowDays: 14 },
      buyer.headers,
    );
    assert.equal(duplicated.status, 201);
    assert.equal(duplicated.body.status, "draft");
    assert.equal(duplicated.body.visibility, "private");
    assert.equal(duplicated.body.sourceShoppingListId, created.body.id);
    assert.equal(duplicated.body.selectedOfferId, null);
    assert.equal(duplicated.body.proposalCount, 0);
    assert.equal(duplicated.body.items.length, 2);
    assert.notDeepEqual(
      duplicated.body.items.map((item: any) => item.id),
      created.body.items.map((item: any) => item.id),
    );
    const duplicatedAudit = await verifyAllwainAuditChain(
      "shopping_list",
      duplicated.body.id,
    );
    assert.equal(duplicatedAudit.valid, true);
    assert.equal(duplicatedAudit.count, 1);
  });

  it("requires a package weight when the buyer asks for carrier delivery", async () => {
    const created = await client.post(
      "/allwain/shopping-lists",
      {
        title: "Compra para enviar por mensajería",
        proposalWindowDays: 7,
        preferredDeliveryChannel: "carrier",
        items: [
          { productName: "Café", quantity: 4, unit: "paquete" },
          { productName: "Aceite", quantity: 2, unit: "l" },
        ],
      },
      buyer.headers,
    );
    const published = await client.post(
      `/allwain/shopping-lists/${created.body.id}/publish`,
      {},
      buyer.headers,
    );
    const payload = {
      listVersion: published.body.version,
      description: "Productos embalados y listos para mensajería.",
      deliveryEstimate: "Preparación en 24 horas",
      items: published.body.items.map((item: any) => ({
        shoppingListItemId: item.id,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: 3,
      })),
    };
    const missingWeight = await client.post(
      `/allwain/shopping-lists/${created.body.id}/proposals`,
      payload,
      sellerA.headers,
    );
    assert.equal(missingWeight.status, 400);
    assert.equal(
      missingWeight.body.error,
      "INVALID_SHOPPING_LIST_SHIPPING_WEIGHT",
    );
    const complete = await client.post(
      `/allwain/shopping-lists/${created.body.id}/proposals`,
      { ...payload, shippingWeightKg: 8.5 },
      sellerA.headers,
    );
    assert.equal(complete.status, 201);
    assert.equal(complete.body.myProposal.meta.shippingWeightKg, 8.5);
  });

  it("turns an OCR document into locked requests with auditable proposal revisions", async () => {
    const testImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const rawText = [
      "SUPERMERCADO FOIOS",
      "Ticket 48392",
      "2 x Leche entera 2,50 EUR",
      "Arroz redondo 2,40 EUR",
      "Aceite oliva 5,90 EUR",
      "TOTAL 10,80 EUR",
    ].join("\n");
    const legacyBypass = await client.post(
      "/allwain/scan-requests",
      { sourceType: "camera", imageBase64: testImage, rawText },
      buyer.headers,
    );
    assert.equal(legacyBypass.status, 409);
    assert.equal(legacyBypass.body.error, "OCR_DOCUMENT_REVIEW_REQUIRED");

    const captured = await client.post(
      "/allwain/scan-captures",
      { sourceType: "camera", imageBase64: testImage, rawText },
      buyer.headers,
    );
    assert.equal(captured.status, 201);
    assert.equal(captured.body.kind, "shopping_list");
    assert.equal(captured.body.shoppingList.sourceKind, "ocr_document");
    assert.equal(captured.body.shoppingList.items.length, 3);
    assert.ok(
      captured.body.shoppingList.items.every(
        (item: any) =>
          item.referencePriceLocked === true &&
          item.referencePriceSource === "ocr_document",
      ),
    );

    const duplicate = await client.post(
      "/allwain/scan-captures",
      { sourceType: "camera", imageBase64: testImage, rawText },
      buyer.headers,
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, "DUPLICATE_EVIDENCE_DOCUMENT");

    const list = captured.body.shoppingList;
    const selectedIds = list.items.slice(0, 2).map((item: any) => item.id);
    const reviewed = await client.patch(
      `/allwain/shopping-lists/${list.id}/ocr-review`,
      { selectedItemIds: selectedIds },
      buyer.headers,
    );
    assert.equal(reviewed.status, 200);
    assert.equal(
      reviewed.body.items.filter((item: any) => item.reviewStatus === "selected")
        .length,
      2,
    );

    const attemptedEdit = await client.patch(
      `/allwain/shopping-lists/${list.id}`,
      {
        title: list.title,
        items: list.items.map((item: any) => ({
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          targetUnitPrice: 999,
        })),
      },
      buyer.headers,
    );
    assert.equal(attemptedEdit.status, 409);
    assert.equal(attemptedEdit.body.error, "OCR_LIST_REVIEW_ONLY");

    const published = await client.post(
      `/allwain/shopping-lists/${list.id}/publish`,
      {},
      buyer.headers,
    );
    assert.equal(published.status, 200);
    assert.equal(published.body.status, "published");

    const market = await client.get(
      `/allwain/shopping-lists/${list.id}`,
      sellerA.headers,
    );
    assert.equal(market.status, 200);
    assert.equal(market.body.items.length, 2);
    const milk = market.body.items.find((item: any) => /leche/i.test(item.productName));
    const rice = market.body.items.find((item: any) => /arroz/i.test(item.productName));
    assert.ok(milk && rice);

    const proposal = (milkPrice: number, ricePrice: number) => ({
      listVersion: published.body.version,
      description: "Productos disponibles con la calidad solicitada.",
      deliveryEstimate: "Entrega mañana por la tarde",
      validForMinutes: 1_440,
      items: [
        {
          shoppingListItemId: milk.id,
          quantity: milk.quantity,
          unit: milk.unit,
          unitPrice: milkPrice,
        },
        {
          shoppingListItemId: rice.id,
          quantity: rice.quantity,
          unit: rice.unit,
          unitPrice: ricePrice,
        },
      ],
    });
    const aboveReference = await client.post(
      `/allwain/shopping-lists/${list.id}/proposals`,
      proposal(1.26, 2.2),
      sellerA.headers,
    );
    assert.equal(aboveReference.status, 400);
    assert.equal(aboveReference.body.error, "OFFER_ABOVE_REFERENCE_PRICE");

    const first = await client.post(
      `/allwain/shopping-lists/${list.id}/proposals`,
      proposal(1.1, 2.2),
      sellerA.headers,
    );
    assert.equal(first.status, 201);
    assert.equal(first.body.myProposal.proposalRevision, 1);
    assert.ok(first.body.myProposal.validUntil);

    const worse = await client.post(
      `/allwain/shopping-lists/${list.id}/proposals`,
      proposal(1.15, 2.2),
      sellerA.headers,
    );
    assert.equal(worse.status, 409);
    assert.equal(worse.body.error, "PROPOSAL_NOT_IMPROVED");

    const improved = await client.post(
      `/allwain/shopping-lists/${list.id}/proposals`,
      proposal(1.05, 2.1),
      sellerA.headers,
    );
    assert.equal(improved.status, 200);
    assert.equal(improved.body.myProposal.proposalRevision, 2);
    const revisions = await prisma.allwainProposalRevision.findMany({
      where: { offerId: improved.body.myProposal.id },
      orderBy: { revision: "asc" },
    });
    assert.deepEqual(
      revisions.map((revision) => [revision.revision, revision.status]),
      [
        [1, "superseded"],
        [2, "current"],
      ],
    );

    const annulled = await client.post(
      `/allwain/scan-captures/${captured.body.evidenceDocumentId}/annul`,
      { reason: "ocr_incorrect_restart" },
      buyer.headers,
    );
    assert.equal(annulled.status, 200);
    assert.equal(annulled.body.status, "annulled");
    assert.equal(
      (
        await prisma.allwainShoppingList.findUnique({ where: { id: list.id } })
      )?.status,
      "canceled",
    );
    assert.equal(
      (
        await prisma.offer.findUnique({
          where: { id: improved.body.myProposal.id },
        })
      )?.allwainStatus,
      "withdrawn",
    );
    assert.equal(
      (
        await prisma.allwainProposalRevision.findFirst({
          where: {
            offerId: improved.body.myProposal.id,
            revision: 2,
          },
        })
      )?.status,
      "withdrawn",
    );

    const recaptured = await client.post(
      "/allwain/scan-captures",
      { sourceType: "camera", imageBase64: testImage, rawText },
      buyer.headers,
    );
    assert.equal(recaptured.status, 201);
    assert.notEqual(
      recaptured.body.evidenceDocumentId,
      captured.body.evidenceDocumentId,
    );
  });

  it("charges the buyer on verified savings and leaves the accepted price intact for the seller", async () => {
    const created = await client.post(
      "/allwain/scan-requests",
      {
        sourceType: "text",
        rawText: "Producto: Televisor OLED verificado\nCantidad: 1 unidad\nPrecio: 1000 EUR",
      },
      buyer.headers,
    );
    assert.equal(created.status, 201);
    const edited = await client.patch(
      `/allwain/scan-requests/${created.body.id}`,
      {
        extracted: {
          productName: "Televisor OLED verificado",
          quantity: 1,
          unit: "ud",
          targetPrice: 1_000,
          currency: "EUR",
          deliveryWindow: "Durante la próxima semana",
          deliveryMethod: "pickup",
          deliveryAddress: "Punto de recogida de prueba, Foios",
          locationLabel: "Foios, Valencia",
        },
      },
      buyer.headers,
    );
    assert.equal(edited.status, 200);
    assert.equal(
      (
        await client.post(
          `/allwain/scan-requests/${created.body.id}/confirm`,
          {},
          buyer.headers,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await client.post(
          `/allwain/scan-requests/${created.body.id}/launch`,
          {},
          buyer.headers,
        )
      ).status,
      200,
    );

    const tooHigh = await client.post(
      `/allwain/market/requests/${created.body.id}/offers`,
      {
        price: 1_000.01,
        availableQuantity: 1,
        deliveryEstimate: "Recogida en 24 horas",
        description: "Televisor revisado y disponible para recogida.",
        validForMinutes: 1_440,
      },
      sellerB.headers,
    );
    assert.equal(tooHigh.status, 400);
    assert.equal(tooHigh.body.error, "OFFER_ABOVE_REFERENCE_PRICE");

    const proposal = await client.post(
      `/allwain/market/requests/${created.body.id}/offers`,
      {
        price: 900,
        availableQuantity: 1,
        deliveryEstimate: "Recogida en 24 horas",
        description: "Televisor revisado y disponible para recogida.",
        validForMinutes: 1_440,
      },
      sellerB.headers,
    );
    assert.equal(proposal.status, 201);
    assert.equal(proposal.body.proposalRevision, 1);
    assert.ok(proposal.body.proposalExpiresAt);

    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.offer.update({
      where: { id: proposal.body.id },
      data: { proposalExpiresAt: expiredAt },
    });
    await prisma.allwainProposalRevision.update({
      where: {
        offerId_revision: { offerId: proposal.body.id, revision: 1 },
      },
      data: { validUntil: expiredAt },
    });
    const expiredAcceptance = await client.post(
      `/allwain/offers/${proposal.body.id}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey: `expired-savings:${created.body.id}`,
      },
      buyer.headers,
    );
    assert.equal(expiredAcceptance.status, 409);
    assert.equal(expiredAcceptance.body.error, "PROPOSAL_EXPIRED");

    const renewed = await client.post(
      `/allwain/market/requests/${created.body.id}/offers`,
      {
        price: 900,
        availableQuantity: 1,
        deliveryEstimate: "Recogida en 24 horas",
        description: "Televisor revisado y disponible para recogida.",
        validForMinutes: 1_440,
      },
      sellerB.headers,
    );
    assert.equal(renewed.status, 201);
    assert.equal(renewed.body.id, proposal.body.id);
    assert.equal(renewed.body.proposalRevision, 2);

    const accepted = await client.post(
      `/allwain/offers/${renewed.body.id}/accept`,
      {
        quantity: 1,
        deliveryMethod: "pickup",
        deliveryChannel: "pickup",
        purchaseKey: `verified-savings:${created.body.id}`,
      },
      buyer.headers,
    );
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.feeBasis, "verified_savings");
    assert.equal(accepted.body.platformFeePayer, "buyer");
    assert.equal(accepted.body.referenceAmount, 100_000);
    assert.equal(accepted.body.acceptedOfferAmount, 90_000);
    assert.equal(accepted.body.grossSavingsAmount, 10_000);
    assert.equal(accepted.body.platformFeeAmount, 1_000);
    assert.equal(accepted.body.netSavingsAmount, 9_000);
    assert.equal(accepted.body.sellerAmount, 90_000);
    assert.equal(accepted.body.totalPrice, 910);
  });
});
