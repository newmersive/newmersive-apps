import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { ENV } from "../src/config/env";
import { app } from "../src/server";
import { closePrisma, getPrisma } from "../src/db/prisma";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);
const prisma = getPrisma();

type Session = {
  userId: string;
  headers: Record<string, string>;
};

async function register(name: string, role?: "company"): Promise<Session> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await client.post("/auth/register", {
    name,
    email: `e2e-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}+${suffix}@test.local`,
    password: "AllwainE2E123!",
    sourceApp: "allwain",
    ...(role ? { role } : {}),
  });
  assert.equal(response.status, 201);
  if (role === "company") {
    const activation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "company", displayName: name },
      { Authorization: `Bearer ${response.body.token}` },
    );
    assert.equal(activation.status, 200);
  }
  return {
    userId: response.body.user.id,
    headers: { Authorization: `Bearer ${response.body.token}` },
  };
}

async function registerAdmin(): Promise<Session> {
  const email = `e2e-scale-admin+${Date.now()}@test.local`;
  const password = "AllwainE2E123!";
  const registration = await client.post("/auth/register", {
    name: "Scale Admin",
    email,
    password,
    sourceApp: "allwain",
  });
  assert.equal(registration.status, 201);
  await prisma.user.update({
    where: { id: registration.body.user.id },
    data: { role: "admin" },
  });
  const login = await client.post("/auth/login", {
    email,
    password,
    sourceApp: "allwain",
  });
  assert.equal(login.status, 200);
  return {
    userId: login.body.user.id,
    headers: { Authorization: `Bearer ${login.body.token}` },
  };
}

async function resetIsolatedDatabase() {
  const database = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT current_database() AS name
  `;
  assert.match(database[0]?.name || "", /e2e/i);
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE`);
}

describe("Allwain PostgreSQL marketplace at realistic volume", () => {
  let buyer: Session;
  let secondBuyer: Session;
  let seller: Session;
  let admin: Session;
  const proposalSellers: Session[] = [];

  before(async () => {
    assert.equal(process.env.STORAGE_DRIVER, "postgres");
    await resetIsolatedDatabase();
    await client.start();
    buyer = await register("Scale Buyer");
    secondBuyer = await register("Second Buyer");
    seller = await register("Scale Seller", "company");
    admin = await registerAdmin();
    for (let index = 0; index < 3; index += 1) {
      proposalSellers.push(
        await register(`Proposal Seller ${index + 1}`, "company"),
      );
    }

    const extraSellerUsers = Array.from({ length: 12 }, (_, index) => ({
      id: `e2e-scale-seller-${index.toString().padStart(2, "0")}`,
      name: `Scale bulk seller ${index + 1}`,
      email: `e2e-scale-seller-${index + 1}@test.local`,
      role: "company",
      sponsorCode: `E2ESELLER${index.toString().padStart(2, "0")}`,
    }));
    await prisma.user.createMany({ data: extraSellerUsers });
    await prisma.allwainBuyerProfile.createMany({
      data: extraSellerUsers.map((item) => ({ userId: item.id })),
    });
    await prisma.allwainSellerProfile.createMany({
      data: extraSellerUsers.map((item) => ({
        userId: item.id,
        status: "active",
        sellerType: "company",
        displayName: item.name,
        activatedAt: new Date(),
      })),
    });

    const products = Array.from({ length: 1_000 }, (_, index) => ({
      id: `e2e-product-${index.toString().padStart(4, "0")}`,
      name:
        index % 4 === 0
          ? `Naranja E2E ${index.toString().padStart(4, "0")}`
          : index % 4 === 1
            ? `Lavadora E2E ${index.toString().padStart(4, "0")}`
            : index % 4 === 2
              ? `Televisor E2E ${index.toString().padStart(4, "0")}`
              : `Servicio E2E ${index.toString().padStart(4, "0")}`,
      ean: `9900000${index.toString().padStart(6, "0")}`,
      category:
        index % 4 === 0
          ? "alimentacion"
          : index % 4 === 3
            ? "servicios"
            : "hogar",
      brand: `Marca E2E ${index % 20}`,
      description: "Producto generado exclusivamente para pruebas de escala.",
    }));
    await prisma.product.createMany({ data: products });

    const offerStatuses = [
      ...Array(700).fill("active"),
      ...Array(100).fill("paused"),
      ...Array(100).fill("sold_out"),
      ...Array(100).fill("closed"),
    ];
    const offers = products.map((product, index) => {
      const produce = index % 4 === 0;
      const status = offerStatuses[index];
      const stock =
        status === "sold_out" || status === "closed" ? 0 : 100 + index;
      const unit = produce ? "kg" : "unidad";
      return {
        id: `e2e-offer-${index.toString().padStart(4, "0")}`,
        title: product.name,
        description: `Oferta E2E ${index} con estado ${status}.`,
        owner: "allwain",
        ownerUserId: seller.userId,
        price: 1 + (index % 250) / 10,
        productId: product.id,
        allwainType: "catalog",
        allwainStatus: status,
        currency: "EUR",
        unit,
        category: product.category,
        productKind: produce
          ? "produce_weight"
          : index % 4 === 3
            ? "service"
            : "appliance",
        locationLabel: index % 2 ? "Foios, Valencia" : "Meliana, Valencia",
        meta: {
          source: "e2e-scale",
          inventoryManaged: true,
          stockQuantity: status === "sold_out" ? 100 : stock,
          availableQuantity: stock,
          reservedQuantity: 0,
          soldQuantity: status === "sold_out" ? 100 : 0,
          minQuantity: produce ? 5 : 1,
          quantityStep: 1,
          unit,
          category: product.category,
          productKind: produce ? "produce_weight" : "appliance",
          currency: "EUR",
        },
      };
    });
    for (let offset = 0; offset < offers.length; offset += 250) {
      await prisma.offer.createMany({
        data: offers.slice(offset, offset + 250),
      });
    }

    const phases = [
      "draft",
      "ready",
      "submitted",
      "awarded",
      "closed",
      "canceled",
      "archived",
    ];
    const requests = Array.from({ length: 1_000 }, (_, index) => {
      const status = phases[index % phases.length];
      const produce = index % 3 === 0;
      const selectedOfferId =
        status === "awarded"
          ? `e2e-proposal-${index.toString().padStart(4, "0")}-0`
          : null;
      return {
        id: `e2e-request-${index.toString().padStart(4, "0")}`,
        userId: buyer.userId,
        sourceType: index % 2 ? "text" : "camera",
        status,
        visibility: index === 996 ? "internal_test" : "public",
        title: `${produce ? "Naranjas" : "Lavadora"} petición E2E ${index.toString().padStart(4, "0")}`,
        description: `Petición de prueba en fase ${status}.`,
        extracted: {
          productName: produce ? "Naranjas" : "Lavadora",
          quantity: produce ? 20 : 1,
          unit: produce ? "kg" : "unidad",
          category: produce ? "alimentacion" : "hogar",
          productKind: produce ? "produce_weight" : "appliance",
          currency: "EUR",
          deliveryWindow: "Esta semana",
          deliveryMethod: "shipping",
          deliveryAddress: "Foios, Valencia",
          confidence: 1,
        },
        offers: [],
        ai: {
          provider: "mock",
          model: "e2e-scale",
          confidence: 1,
          summary: "Dato de prueba",
          warnings: [],
        },
        selectedOfferId,
        selectedAt: selectedOfferId ? new Date() : null,
        closedAt: ["closed", "canceled"].includes(status) ? new Date() : null,
        category: produce ? "alimentacion" : "hogar",
        productKind: produce ? "produce_weight" : "appliance",
        unit: produce ? "kg" : "unidad",
        currency: "EUR",
        locationLabel: "Foios, Valencia",
        locationLatApprox: 39.53,
        locationLngApprox: -0.36,
      };
    });
    for (let offset = 0; offset < requests.length; offset += 250) {
      await prisma.allwainScanRequest.createMany({
        data: requests.slice(offset, offset + 250),
      });
    }

    const proposals: any[] = [];
    for (let index = 0; index < requests.length; index += 1) {
      const status = requests[index].status;
      if (!["submitted", "awarded"].includes(status)) continue;
      const proposalCount = index % 50 === 2 ? 12 : 3;
      for (let sellerIndex = 0; sellerIndex < proposalCount; sellerIndex += 1) {
        const requestId = requests[index].id;
        const unit = requests[index].unit;
        const selected = status === "awarded" && sellerIndex === 0;
        proposals.push({
          id: `e2e-proposal-${index.toString().padStart(4, "0")}-${sellerIndex}`,
          title: `Propuesta ${sellerIndex + 1} para ${requests[index].title}`,
          description: "Propuesta vinculada y generada para pruebas.",
          owner: "allwain",
          ownerUserId: extraSellerUsers[sellerIndex].id,
          price: 10 + sellerIndex,
          allwainType: "proposal",
          allwainStatus: selected
            ? "selected"
            : status === "awarded"
              ? "not_selected"
              : "active",
          requestId,
          currency: "EUR",
          unit,
          category: requests[index].category,
          productKind: requests[index].productKind,
          meta: {
            requestId,
            source: "e2e-scale-proposal",
            inventoryManaged: true,
            stockQuantity: requests[index].extracted.quantity,
            availableQuantity: requests[index].extracted.quantity,
            reservedQuantity: 0,
            soldQuantity: 0,
            minQuantity: requests[index].extracted.quantity,
            quantityStep: 1,
            unit,
            currency: "EUR",
            deliveryEstimate: `${sellerIndex + 1} días`,
          },
        });
      }
    }
    for (let offset = 0; offset < proposals.length; offset += 250) {
      await prisma.offer.createMany({
        data: proposals.slice(offset, offset + 250),
      });
    }

    const orderPhases = [
      ["awaiting_payment", "awaiting_payment", "pending", "reserved"],
      ["paid", "paid", "pending", "sold"],
      ["preparing", "paid", "preparing", "sold"],
      ["ready", "paid", "ready", "sold"],
      ["dispatched", "paid", "dispatched", "sold"],
      ["delivered", "paid", "delivered", "sold"],
      ["completed", "paid", "completed", "sold"],
      ["canceled", "canceled", "pending", "released"],
    ] as const;
    const activityContracts = Array.from({ length: 120 }, (_, index) => {
      const phase = orderPhases[index % orderPhases.length];
      const createdAt = new Date(Date.now() - index * 60_000);
      return {
        id: `e2e-activity-contract-${index.toString().padStart(3, "0")}`,
        app: "allwain",
        type: "purchase",
        status: "accepted",
        offerId: `e2e-offer-${index.toString().padStart(4, "0")}`,
        purchaseKey: `allwain:e2e:activity:${index}`,
        requesterUserId: buyer.userId,
        providerUserId: seller.userId,
        offerTitle: `Pedido de escala ${index}`,
        requesterName: "Scale Buyer",
        providerName: "Scale Seller",
        quantity: 5,
        unit: index % 4 === 0 ? "kg" : "unidad",
        unitPrice: 1,
        totalPrice: 5,
        currency: "EUR",
        subtotalAmount: 500,
        platformFeeBps: 1_000,
        platformFeeAmount: 50,
        sellerAmount: 450,
        paymentMode: "immediate",
        paymentStatus: phase[1],
        inventoryStatus: phase[3],
        requesterAcceptedAt: createdAt,
        providerAcceptedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      };
    });
    await prisma.contract.createMany({ data: activityContracts });
    await prisma.allwainOrder.createMany({
      data: activityContracts.map((contract, index) => {
        const phase = orderPhases[index % orderPhases.length];
        return {
          id: `e2e-activity-order-${index.toString().padStart(3, "0")}`,
          contractId: contract.id,
          offerId: contract.offerId!,
          buyerUserId: buyer.userId,
          sellerUserId: seller.userId,
          paymentMode: "immediate",
          status: phase[0],
          paymentStatus: phase[1],
          fulfillmentStatus: phase[2],
          quantity: 5,
          unit: contract.unit!,
          unitPriceAmount: 100,
          subtotalAmount: 500,
          totalAmount: 500,
          currency: "eur",
          platformFeeBps: 1_000,
          platformFeeAmount: 50,
          platformNetFeeAmount: 50,
          platformRetainedAmount: 50,
          sellerAmount: 450,
          connectorFeeAmount: 0,
          inventoryStatus: phase[3],
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
        };
      }),
    });
  });

  after(async () => {
    await client.stop();
    await closePrisma();
  });

  it("contains at least 1,000 products, offers and phased requests", async () => {
    const [products, catalogOffers, requests] = await Promise.all([
      prisma.product.count({ where: { id: { startsWith: "e2e-product-" } } }),
      prisma.offer.count({ where: { id: { startsWith: "e2e-offer-" } } }),
      prisma.allwainScanRequest.count({
        where: { id: { startsWith: "e2e-request-" } },
      }),
    ]);
    assert.equal(products, 1_000);
    assert.equal(catalogOffers, 1_000);
    assert.equal(requests, 1_000);
    const grouped = await prisma.allwainScanRequest.groupBy({
      by: ["status"],
      where: { id: { startsWith: "e2e-request-" } },
      _count: { id: true },
    });
    assert.equal(grouped.length, 7);
    assert.ok(grouped.every((item) => item._count.id >= 140));
  });

  it("paginates the administrator request list instead of loading every row", async () => {
    const first = await client.get(
      "/admin/allwain/scan-requests?limit=8&status=submitted&q=Naranjas",
      admin.headers,
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 8);
    assert.equal(first.body.pageInfo.hasNextPage, true);
    assert.ok(
      first.body.items.every(
        (item: any) =>
          item.status === "submitted" &&
          item.title.toLowerCase().includes("naranjas"),
      ),
    );
    const second = await client.get(
      `/admin/allwain/scan-requests?limit=8&status=submitted&q=Naranjas&cursor=${encodeURIComponent(first.body.pageInfo.nextCursor)}`,
      admin.headers,
    );
    assert.equal(second.status, 200);
    const firstIds = new Set(first.body.items.map((item: any) => item.id));
    assert.ok(second.body.items.every((item: any) => !firstIds.has(item.id)));
  });

  it("paginates and filters the catalog without returning the whole dataset", async () => {
    const startedAt = performance.now();
    const first = await client.get(
      "/allwain/offers?scope=market&limit=30&category=alimentacion",
      buyer.headers,
    );
    const durationMs = performance.now() - startedAt;
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 30);
    assert.equal(first.body.pageInfo.hasNextPage, true);
    assert.ok(first.body.pageInfo.nextCursor);
    assert.ok(
      first.body.items.every(
        (item: any) => !item.allwainStatus || item.allwainStatus === "active",
      ),
    );
    assert.ok(durationMs < 3_000, `Catalog first page took ${durationMs}ms`);

    const second = await client.get(
      `/allwain/offers?scope=market&limit=30&category=alimentacion&cursor=${encodeURIComponent(first.body.pageInfo.nextCursor)}`,
      buyer.headers,
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.items.length, 30);
    const firstIds = new Set(first.body.items.map((item: any) => item.id));
    assert.ok(second.body.items.every((item: any) => !firstIds.has(item.id)));

    const exact = await client.get(
      "/allwain/offers?scope=market&q=Televisor%20E2E%200042&limit=10",
      buyer.headers,
    );
    assert.equal(exact.status, 200);
    assert.ok(
      exact.body.items.some((item: any) => item.id === "e2e-offer-0042"),
    );

    const bySeller = await client.get(
      "/allwain/offers?scope=market&q=Scale%20Seller&limit=5",
      buyer.headers,
    );
    assert.equal(bySeller.status, 200);
    assert.equal(bySeller.body.items.length, 5);
    assert.ok(
      bySeller.body.items.every(
        (item: any) => item.ownerUserId === seller.userId,
      ),
    );

    const soldOut = await client.get(
      "/allwain/offers?scope=market&status=sold_out&limit=5",
      buyer.headers,
    );
    assert.equal(soldOut.status, 200);
    assert.equal(soldOut.body.items.length, 5);
    assert.ok(
      soldOut.body.items.every(
        (item: any) => item.allwainStatus === "sold_out",
      ),
    );
  });

  it("searches across public entities without exposing private request data", async () => {
    const result = await client.get(
      "/allwain/search?q=Naranja&limit=6",
      buyer.headers,
    );
    assert.equal(result.status, 200);
    assert.ok(result.body.offers.length > 0);
    assert.ok(result.body.requests.length > 0);
    assert.ok(result.body.products.length > 0);
    assert.ok(
      result.body.requests.every(
        (item: any) =>
          item.extracted.deliveryAddress === undefined &&
          item.extracted.deliveryNotes === undefined &&
          item.extracted.rawText === undefined,
      ),
    );
    assert.ok(!JSON.stringify(result.body).includes("@test.local"));
  });

  it("paginates requests independently by lifecycle phase", async () => {
    const submitted = await client.get(
      "/allwain/scan-requests?status=submitted&limit=25",
      buyer.headers,
    );
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.items.length, 25);
    assert.ok(
      submitted.body.items.every((item: any) => item.status === "submitted"),
    );
    assert.equal(submitted.body.pageInfo.hasNextPage, true);

    const sellerMarket = await client.get(
      "/allwain/market/requests?limit=25&category=alimentacion",
      seller.headers,
    );
    assert.equal(sellerMarket.status, 200);
    assert.equal(sellerMarket.body.items.length, 25);
    assert.ok(
      sellerMarket.body.items.every((item: any) => item.status === "submitted"),
    );
    assert.ok(
      sellerMarket.body.items.every((item: any) => item.offerCount >= 3),
    );

    const manyOffers = await client.get(
      "/allwain/scan-requests/e2e-request-0002",
      buyer.headers,
    );
    assert.equal(manyOffers.status, 200);
    assert.equal(manyOffers.body.offers.length, 12);
  });

  it("keeps internal load-test requests out of the seller marketplace", async () => {
    const hidden = await client.get(
      "/allwain/market/requests/e2e-request-0996",
      seller.headers,
    );
    assert.equal(hidden.status, 404);

    const buyerActivity = await client.get(
      "/allwain/scan-requests?limit=25",
      buyer.headers,
    );
    assert.equal(buyerActivity.status, 200);
    assert.ok(
      buyerActivity.body.items.every(
        (item: any) => item.visibility === "public",
      ),
    );
    assert.ok(
      !buyerActivity.body.items.some(
        (item: any) => item.id === "e2e-request-0996",
      ),
    );
  });

  it("paginates agreements and orders and filters operational phases", async () => {
    const contracts = await client.get(
      "/allwain/contracts?scope=buyer&limit=25",
      buyer.headers,
    );
    assert.equal(contracts.status, 200);
    assert.equal(contracts.body.items.length, 25);
    assert.equal(contracts.body.pageInfo.hasNextPage, true);
    const contractPageTwo = await client.get(
      `/allwain/contracts?scope=buyer&limit=25&cursor=${contracts.body.pageInfo.nextCursor}`,
      buyer.headers,
    );
    assert.equal(contractPageTwo.status, 200);
    const firstContractIds = new Set(
      contracts.body.items.map((item: any) => item.id),
    );
    assert.ok(
      contractPageTwo.body.items.every(
        (item: any) => !firstContractIds.has(item.id),
      ),
    );

    const orders = await client.get(
      "/allwain/payments/orders?scope=buyer&limit=25",
      buyer.headers,
    );
    assert.equal(orders.status, 200);
    assert.equal(orders.body.items.length, 25);
    assert.equal(orders.body.pageInfo.hasNextPage, true);
    const ready = await client.get(
      "/allwain/payments/orders?scope=seller&fulfillmentStatus=ready&limit=20",
      seller.headers,
    );
    assert.equal(ready.status, 200);
    assert.ok(ready.body.items.length > 0);
    assert.ok(
      ready.body.items.every((item: any) => item.fulfillmentStatus === "ready"),
    );

    const summary = await client.get(
      "/allwain/payments/orders/summary?scope=seller",
      seller.headers,
    );
    assert.equal(summary.status, 200);
    assert.equal(summary.body.totalCount, 120);
    assert.equal(summary.body.newCount, 15);
    assert.equal(summary.body.readyCount, 15);
    assert.deepEqual(summary.body.toPrepare, [
      { unit: "unidad", quantity: 150 },
    ]);
    assert.deepEqual(summary.body.pendingIncome, [
      { currency: "EUR", amount: 33_750 },
    ]);
  });

  it("opens old notification targets directly without exposing them to strangers", async () => {
    const oldOrderId = "e2e-activity-order-119";
    const oldContractId = "e2e-activity-contract-119";

    const buyerOrder = await client.get(
      `/allwain/payments/orders/${oldOrderId}`,
      buyer.headers,
    );
    assert.equal(buyerOrder.status, 200);
    assert.equal(buyerOrder.body.id, oldOrderId);

    const sellerOrder = await client.get(
      `/allwain/payments/orders/${oldOrderId}`,
      seller.headers,
    );
    assert.equal(sellerOrder.status, 200);

    const strangerOrder = await client.get(
      `/allwain/payments/orders/${oldOrderId}`,
      secondBuyer.headers,
    );
    assert.equal(strangerOrder.status, 403);

    const buyerContract = await client.get(
      `/allwain/contracts/${oldContractId}`,
      buyer.headers,
    );
    assert.equal(buyerContract.status, 200);
    assert.equal(buyerContract.body.id, oldContractId);

    const strangerContract = await client.get(
      `/allwain/contracts/${oldContractId}`,
      secondBuyer.headers,
    );
    assert.equal(strangerContract.status, 404);
  });

  it("shows a submitted request to sellers with a privacy-safe projection", async () => {
    const requestId = "e2e-request-0009";
    const response = await client.get(
      `/allwain/market/requests/${requestId}`,
      seller.headers,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.id, requestId);
    assert.equal(response.body.status, "submitted");
    assert.equal(response.body.extracted.locationLabel, "Foios, Valencia");
    assert.equal(response.body.extracted.deliveryAddress, undefined);
    assert.equal(response.body.extracted.deliveryNotes, undefined);
    assert.equal(response.body.rawText, undefined);

    const buyerCannotUseSellerProjection = await client.get(
      `/allwain/market/requests/${requestId}`,
      secondBuyer.headers,
    );
    assert.equal(buyerCannotUseSellerProjection.status, 403);
  });

  it("completes the Allwain order chat with unread, access and blocking rules", async () => {
    const orderId = "e2e-activity-order-115";
    const opened = await client.post(
      `/chat/allwain/contexts/order/${orderId}/open`,
      {},
      buyer.headers,
    );
    assert.equal(opened.status, 200);
    const conversationId = opened.body.id;

    const sent = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "Mensaje privado de prueba de escala" },
      buyer.headers,
    );
    assert.equal(sent.status, 201);

    const sellerList = await client.get(
      "/chat/allwain/conversations",
      seller.headers,
    );
    assert.equal(sellerList.status, 200);
    const sellerConversation = sellerList.body.items.find(
      (item: any) => item.id === conversationId,
    );
    assert.ok(sellerConversation);
    assert.equal(sellerConversation.unreadCount, 1);
    assert.equal(
      sellerConversation.lastMessage.text,
      "Mensaje privado de prueba de escala",
    );

    const strangerRead = await client.get(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      secondBuyer.headers,
    );
    assert.equal(strangerRead.status, 404);

    const read = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/read`,
      {},
      seller.headers,
    );
    assert.equal(read.status, 200);
    const afterRead = await client.get(
      "/chat/allwain/conversations",
      seller.headers,
    );
    assert.equal(
      afterRead.body.items.find((item: any) => item.id === conversationId)
        .unreadCount,
      0,
    );

    const blocked = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/block`,
      { targetUserId: buyer.userId },
      seller.headers,
    );
    assert.equal(blocked.status, 200);
    const rejected = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "Este mensaje no debe guardarse" },
      buyer.headers,
    );
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error, "CHAT_BLOCKED");

    const unblocked = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/unblock`,
      { targetUserId: buyer.userId },
      seller.headers,
    );
    assert.equal(unblocked.status, 200);
    const resumed = await client.post(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages`,
      { text: "Conversación reanudada" },
      buyer.headers,
    );
    assert.equal(resumed.status, 201);

    const audit = await prisma.allwainAuditEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: "chat.message_sent",
      },
      orderBy: { sequence: "asc" },
    });
    assert.ok(audit);
    assert.equal(typeof (audit.payload as any).contentSha256, "string");
    assert.equal(
      JSON.stringify(audit.payload).includes("Mensaje privado"),
      false,
    );
  });

  it("paginates long chat histories and conversation lists without duplicates", async () => {
    const conversationId = "allwain:order:e2e-activity-order-115";
    const start = Date.now() + 10_000;
    await prisma.trueqiaChatMessage.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        id: `e2e-chat-message-${index.toString().padStart(3, "0")}`,
        threadId: conversationId,
        userId: buyer.userId,
        senderId: index % 2 ? seller.userId : buyer.userId,
        senderName: index % 2 ? "Scale Seller" : "Scale Buyer",
        senderRole: "user",
        text: `Mensaje paginado ${index}`,
        createdAt: new Date(start + index * 1_000),
      })),
    });
    await prisma.chatThread.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(start + 104_000) },
    });

    const latest = await client.get(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
      buyer.headers,
    );
    assert.equal(latest.status, 200);
    assert.equal(latest.body.items.length, 50);
    assert.equal(latest.body.pageInfo.hasPreviousPage, true);
    const previous = await client.get(
      `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/messages?limit=50&before=${latest.body.pageInfo.previousCursor}`,
      buyer.headers,
    );
    assert.equal(previous.status, 200);
    assert.equal(previous.body.items.length, 50);
    const latestIds = new Set(latest.body.items.map((item: any) => item.id));
    assert.ok(
      previous.body.items.every((item: any) => !latestIds.has(item.id)),
    );
    for (const page of [previous.body.items, latest.body.items]) {
      assert.ok(
        page.every(
          (item: any, index: number) =>
            index === 0 || page[index - 1].createdAt <= item.createdAt,
        ),
      );
    }

    const extraThreads = Array.from({ length: 35 }, (_, index) => ({
      id: `e2e-chat-list-${index.toString().padStart(2, "0")}`,
      app: "allwain",
      contextType: "order",
      contextId: `e2e-activity-order-${index.toString().padStart(3, "0")}`,
      title: `Conversación paginada ${index}`,
      status: "active",
      updatedAt: new Date(start + index * 500),
    }));
    await prisma.chatThread.createMany({
      data: extraThreads,
      skipDuplicates: true,
    });
    await prisma.chatParticipant.createMany({
      data: extraThreads.flatMap((thread) => [
        { threadId: thread.id, userId: buyer.userId },
        { threadId: thread.id, userId: seller.userId },
      ]),
      skipDuplicates: true,
    });
    const firstPage = await client.get(
      "/chat/allwain/conversations?limit=20",
      seller.headers,
    );
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.items.length, 20);
    assert.equal(firstPage.body.pageInfo.hasNextPage, true);
    const secondPage = await client.get(
      `/chat/allwain/conversations?limit=20&cursor=${encodeURIComponent(firstPage.body.pageInfo.nextCursor)}`,
      seller.headers,
    );
    assert.equal(secondPage.status, 200);
    const firstIds = new Set(firstPage.body.items.map((item: any) => item.id));
    assert.ok(
      secondPage.body.items.every((item: any) => !firstIds.has(item.id)),
    );
  });

  it("paginates notifications and keeps read actions scoped to their owner", async () => {
    await prisma.allwainNotification.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        id: `e2e-notification-${index.toString().padStart(3, "0")}`,
        userId: secondBuyer.userId,
        type: "e2e.scale",
        title: `Aviso de escala ${index}`,
        body: "Aviso generado exclusivamente para la base aislada.",
        route: "order",
        routeParams: { orderId: "e2e-activity-order-000", mode: "buy" },
        createdAt: new Date(Date.now() + index * 1_000),
      })),
    });
    const first = await client.get(
      "/allwain/notifications?limit=40",
      secondBuyer.headers,
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 40);
    assert.equal(first.body.unreadCount, 105);
    assert.equal(first.body.pageInfo.hasNextPage, true);
    const second = await client.get(
      `/allwain/notifications?limit=40&cursor=${first.body.pageInfo.nextCursor}`,
      secondBuyer.headers,
    );
    assert.equal(second.status, 200);
    const firstIds = new Set(first.body.items.map((item: any) => item.id));
    assert.ok(second.body.items.every((item: any) => !firstIds.has(item.id)));

    const targetId = first.body.items[0].id;
    const foreignRead = await client.post(
      `/allwain/notifications/${targetId}/read`,
      {},
      seller.headers,
    );
    assert.equal(foreignRead.status, 404);
    const ownRead = await client.post(
      `/allwain/notifications/${targetId}/read`,
      {},
      secondBuyer.headers,
    );
    assert.equal(ownRead.status, 200);
    assert.ok(ownRead.body.readAt);
    const allRead = await client.post(
      "/allwain/notifications/read-all",
      {},
      secondBuyer.headers,
    );
    assert.equal(allRead.status, 200);
    assert.equal(allRead.body.updated, 104);
  });

  it("keeps QR referral attribution immutable and paginates a connector network", async () => {
    const connector = await register("Scale Connector");
    const activated = await client.post(
      "/allwain/participation/connector/activate",
      {
        locationLabel: "Foios",
        latitude: 39.5334,
        longitude: -0.3567,
        radiusKm: 10,
        available: true,
      },
      connector.headers,
    );
    assert.equal(activated.status, 200);
    const referralCode = activated.body.connector.newmersiveId as string;
    assert.match(referralCode, /^NID-/);

    const referredEmail = `e2e-referred-${Date.now()}@test.local`;
    const registration = await client.post("/auth/register", {
      name: "QR Referred Seller",
      email: referredEmail,
      password: "AllwainE2E123!",
      sourceApp: "allwain",
      sponsorCode: referralCode.toLowerCase(),
    });
    assert.equal(registration.status, 201);
    const referredUserId = registration.body.user.id as string;
    const storedUser = await prisma.user.findUnique({
      where: { id: referredUserId },
    });
    assert.equal(storedUser?.referredByCode, referralCode);
    const attribution = await prisma.referralStat.findUnique({
      where: {
        userId_invitedUserId: {
          userId: connector.userId,
          invitedUserId: referredUserId,
        },
      },
    });
    assert.equal(attribution?.source, "registration_code");
    assert.equal(attribution?.status, "registered");

    const sellerActivation = await client.post(
      "/allwain/participation/seller/activate",
      { sellerType: "producer", displayName: "QR Referred Seller" },
      { Authorization: `Bearer ${registration.body.token}` },
    );
    assert.equal(sellerActivation.status, 200);

    const bulkInvitees = Array.from({ length: 65 }, (_, index) => ({
      id: `e2e-network-user-${index.toString().padStart(3, "0")}`,
      name: `Network Person ${index}`,
      email: `e2e-network-${index}@test.local`,
      role: "buyer",
      sponsorCode: `NID-E2ENET${index.toString().padStart(3, "0")}`,
      referredByCode: referralCode,
      createdAt: new Date(Date.now() + index * 1_000),
    }));
    await prisma.user.createMany({ data: bulkInvitees });
    await prisma.allwainBuyerProfile.createMany({
      data: bulkInvitees.map((item) => ({ userId: item.id })),
    });
    await prisma.allwainSellerProfile.createMany({
      data: bulkInvitees.map((item, index) => ({
        userId: item.id,
        status: index < 20 ? "onboarding" : "not_activated",
        sellerType: index < 20 ? "producer" : null,
        displayName: index < 20 ? item.name : null,
      })),
    });
    await prisma.allwainConnectorProfile.createMany({
      data: bulkInvitees.map((item) => ({ userId: item.id })),
    });
    await prisma.referralStat.createMany({
      data: bulkInvitees.map((item, index) => ({
        id: `e2e-network-referral-${index.toString().padStart(3, "0")}`,
        userId: connector.userId,
        invitedUserId: item.id,
        source: "registration_code",
        status: "registered",
        createdAt: new Date(Date.now() + index * 1_000),
      })),
    });

    const firstPage = await client.get(
      "/allwain/participation/connector/network?limit=30",
      connector.headers,
    );
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.items.length, 30);
    assert.equal(firstPage.body.totals.users, 66);
    assert.equal(firstPage.body.totals.sellers, 21);
    assert.equal(firstPage.body.pageInfo.hasNextPage, true);
    const secondPage = await client.get(
      `/allwain/participation/connector/network?limit=30&cursor=${firstPage.body.pageInfo.nextCursor}`,
      connector.headers,
    );
    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.items.length, 30);
    const firstIds = new Set(firstPage.body.items.map((item: any) => item.id));
    assert.ok(
      secondPage.body.items.every((item: any) => !firstIds.has(item.id)),
    );

    const inactiveSponsor = await prisma.user.findUnique({
      where: { id: secondBuyer.userId },
      select: { sponsorCode: true },
    });
    const rejectedReferral = await client.post("/auth/register", {
      name: "Invalid Referral",
      email: `e2e-invalid-referral-${Date.now()}@test.local`,
      password: "AllwainE2E123!",
      sourceApp: "allwain",
      sponsorCode: inactiveSponsor?.sponsorCode,
    });
    assert.equal(rejectedReferral.status, 400);
    assert.equal(rejectedReferral.body.error, "REFERRAL_CONNECTOR_NOT_ACTIVE");

    const duplicate = await client.post("/auth/register", {
      name: "Reassigned Referral",
      email: referredEmail,
      password: "AllwainE2E123!",
      sourceApp: "allwain",
      sponsorCode: referralCode,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
      (await prisma.user.findUnique({ where: { id: referredUserId } }))
        ?.referredByCode,
      referralCode,
    );

    const balanceBefore = storedUser?.allwainBalance || 0;
    const legacySaving = await client.post(
      "/allwain/savings",
      { amount: 1_000_000 },
      { Authorization: `Bearer ${registration.body.token}` },
    );
    assert.equal(legacySaving.status, 410);
    assert.equal(
      (await prisma.user.findUnique({ where: { id: referredUserId } }))
        ?.allwainBalance || 0,
      balanceBefore,
    );
  });

  it("publishes auditable opinions only after delivery and prevents duplicates", async () => {
    const notReady = await client.post(
      "/allwain/reputation/orders/e2e-activity-order-115/reviews",
      { subjectUserId: seller.userId, rating: 5 },
      buyer.headers,
    );
    assert.equal(notReady.status, 409);
    assert.equal(notReady.body.error, "ORDER_NOT_REVIEWABLE");

    const strangerState = await client.get(
      "/allwain/reputation/orders/e2e-activity-order-118",
      secondBuyer.headers,
    );
    assert.equal(strangerState.status, 404);

    const simultaneous = await Promise.all([
      client.post(
        "/allwain/reputation/orders/e2e-activity-order-117/reviews",
        {
          subjectUserId: seller.userId,
          rating: 4,
          comment: "Entrega correcta.",
        },
        buyer.headers,
      ),
      client.post(
        "/allwain/reputation/orders/e2e-activity-order-117/reviews",
        {
          subjectUserId: seller.userId,
          rating: 4,
          comment: "Entrega correcta.",
        },
        buyer.headers,
      ),
    ]);
    assert.deepEqual(
      simultaneous.map((item) => item.status).sort(),
      [201, 409],
    );

    const buyerReview = await client.post(
      "/allwain/reputation/orders/e2e-activity-order-118/reviews",
      { subjectUserId: seller.userId, rating: 5, comment: "Muy buena compra." },
      buyer.headers,
    );
    assert.equal(buyerReview.status, 201);
    const sellerReview = await client.post(
      "/allwain/reputation/orders/e2e-activity-order-118/reviews",
      { subjectUserId: buyer.userId, rating: 3, comment: "Comprador puntual." },
      seller.headers,
    );
    assert.equal(sellerReview.status, 201);

    const duplicate = await client.post(
      "/allwain/reputation/orders/e2e-activity-order-118/reviews",
      { subjectUserId: seller.userId, rating: 1 },
      buyer.headers,
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, "REVIEW_ALREADY_EXISTS");

    const sellerSummary = await client.get(
      `/allwain/reputation/users/${seller.userId}`,
      buyer.headers,
    );
    assert.equal(sellerSummary.status, 200);
    assert.equal(sellerSummary.body.reviewCount, 2);
    assert.equal(sellerSummary.body.score, 4.5);

    const response = await client.patch(
      `/allwain/reputation/reviews/${buyerReview.body.id}/response`,
      { response: "Gracias por confiar en nosotros." },
      seller.headers,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.response, "Gracias por confiar en nosotros.");
    const foreignResponse = await client.patch(
      `/allwain/reputation/reviews/${buyerReview.body.id}/response`,
      { response: "No debería guardarse." },
      secondBuyer.headers,
    );
    assert.equal(foreignResponse.status, 404);

    const reported = await client.post(
      `/allwain/reputation/reviews/${buyerReview.body.id}/report`,
      { reason: "Revisión E2E de moderación." },
      seller.headers,
    );
    assert.equal(reported.status, 200);
    assert.equal(reported.body.status, "reported");

    const events = await prisma.allwainAuditEvent.findMany({
      where: {
        aggregateId: "e2e-activity-order-118",
        eventType: { startsWith: "reputation.review_" },
      },
      orderBy: { sequence: "asc" },
    });
    assert.equal(events.length, 4);
    assert.ok(events.every((event) => Boolean(event.eventHash)));
    assert.ok(
      events.every(
        (event, index) =>
          index === 0 || event.previousHash === events[index - 1].eventHash,
      ),
    );
  });

  it("makes Guide confirmations create real, visible and idempotent records", async () => {
    const offerAction = {
      id: `e2e-guide-offer-${Date.now()}`,
      type: "create_offer",
      fields: {
        title: "Lavadora creada por Guía E2E",
        description: "Ficha confirmada por la guía y persistida de verdad.",
        price: 325,
        currency: "EUR",
        unit: "ud",
        availableQuantity: 4,
        minQuantity: 1,
        quantityStep: 1,
        saleMode: "immediate",
        deliveryEstimate: "Entrega en 48 horas",
        productKind: "goods",
      },
    };
    const offerKey = `guide-pg-offer-${Date.now()}`;
    const publishedOffer = await client.post(
      "/allwain/guide/actions",
      { idempotencyKey: offerKey, action: offerAction },
      seller.headers,
    );
    assert.equal(publishedOffer.status, 201);
    assert.equal(publishedOffer.body.type, "offer");
    const storedOffer = await prisma.offer.findUnique({
      where: { id: publishedOffer.body.id },
    });
    assert.equal(storedOffer?.title, offerAction.fields.title);
    assert.equal(storedOffer?.ownerUserId, seller.userId);
    assert.equal((storedOffer?.meta as any)?.source, "allwain-ai-guide");

    const repeatedOffer = await client.post(
      "/allwain/guide/actions",
      { idempotencyKey: offerKey, action: offerAction },
      seller.headers,
    );
    assert.equal(repeatedOffer.status, 201);
    assert.equal(repeatedOffer.body.id, publishedOffer.body.id);
    assert.equal(repeatedOffer.body.idempotent, true);
    assert.equal(
      await prisma.offer.count({
        where: { title: offerAction.fields.title, ownerUserId: seller.userId },
      }),
      1,
    );

    const reusedKey = await client.post(
      "/allwain/guide/actions",
      {
        idempotencyKey: offerKey,
        action: {
          ...offerAction,
          fields: { ...offerAction.fields, title: "Contenido distinto" },
        },
      },
      seller.headers,
    );
    assert.equal(reusedKey.status, 409);
    assert.equal(reusedKey.body.error, "IDEMPOTENCY_KEY_REUSED");

    const requestAction = {
      id: `e2e-guide-request-${Date.now()}`,
      type: "create_request",
      fields: {
        productName: "PlayStation 5 creada por Guía E2E",
        description: "Petición completa de prueba.",
        quantity: 1,
        unit: "ud",
        targetPrice: 450,
        currency: "EUR",
        deliveryWindow: "Esta semana",
        deliveryMethod: "shipping",
        deliveryAddress: "Valencia",
        deliveryNotes: "Avisar antes de entregar",
      },
    };
    await prisma.allwainBuyerPaymentProfile.deleteMany({
      where: { userId: buyer.userId },
    });
    const previousPublicationPolicy = {
      required: ENV.ALLWAIN_PUBLICATION_CARD_REQUIRED,
      paymentsEnabled: ENV.ALLWAIN_PAYMENTS_ENABLED,
      stripeLivemode: ENV.ALLWAIN_STRIPE_LIVEMODE,
    };
    try {
      Object.assign(ENV, {
        ALLWAIN_PUBLICATION_CARD_REQUIRED: false,
        ALLWAIN_PAYMENTS_ENABLED: false,
        ALLWAIN_STRIPE_LIVEMODE: false,
      });
      const noCardAction = {
        ...requestAction,
        id: `e2e-guide-no-card-${Date.now()}`,
        fields: {
          ...requestAction.fields,
          productName: "Petición publicada sin tarjeta en TEST",
        },
      };
      const publishedWithoutCard = await client.post(
        "/allwain/guide/actions",
        {
          idempotencyKey: `guide-pg-no-card-${Date.now()}`,
          action: noCardAction,
        },
        buyer.headers,
      );
      assert.equal(publishedWithoutCard.status, 201);
      assert.equal(publishedWithoutCard.body.type, "request");
      assert.equal(publishedWithoutCard.body.status, "submitted");
      const storedWithoutCard = await prisma.allwainScanRequest.findUnique({
        where: { id: publishedWithoutCard.body.id },
      });
      assert.equal(storedWithoutCard?.paymentGuaranteeStatus, "not_started");

      ENV.ALLWAIN_PUBLICATION_CARD_REQUIRED = true;
      const requestCountBeforeGate = await prisma.allwainScanRequest.count({
        where: { userId: buyer.userId },
      });
      const requestKey = `guide-pg-request-${Date.now()}`;
      const gatedRequest = await client.post(
        "/allwain/guide/actions",
        { idempotencyKey: requestKey, action: requestAction },
        buyer.headers,
      );
      assert.equal(gatedRequest.status, 409);
      assert.equal(gatedRequest.body.error, "BUYER_PAYMENT_METHOD_REQUIRED");
      assert.equal(
        await prisma.allwainScanRequest.count({
          where: { userId: buyer.userId },
        }),
        requestCountBeforeGate,
      );
      await prisma.allwainBuyerPaymentProfile.create({
        data: {
          userId: buyer.userId,
          stripeCustomerId: `cus_e2e_${Date.now()}`,
          paymentMethodStatus: "ready",
          defaultPaymentMethodId: `pm_e2e_${Date.now()}`,
          defaultCardBrand: "visa",
          defaultCardLast4: "4242",
          defaultCardExpMonth: 12,
          defaultCardExpYear: 2035,
          setupConsentVersion: "allwain-buyer-payment-v1",
          setupConsentAcceptedAt: new Date(),
          setupConsentEvidenceHash: "a".repeat(64),
          lastSyncedAt: new Date(),
        },
      });
      const publishedRequest = await client.post(
        "/allwain/guide/actions",
        { idempotencyKey: requestKey, action: requestAction },
        buyer.headers,
      );
      assert.equal(publishedRequest.status, 201);
      assert.equal(publishedRequest.body.type, "request");
      assert.equal(publishedRequest.body.status, "submitted");
      const storedRequest = await prisma.allwainScanRequest.findUnique({
        where: { id: publishedRequest.body.id },
      });
      assert.equal(storedRequest?.userId, buyer.userId);
      assert.equal(storedRequest?.status, "submitted");
      assert.equal(
        (storedRequest?.extracted as any)?.productName,
        requestAction.fields.productName,
      );

      const guideEvents = await prisma.allwainAuditEvent.findMany({
        where: {
          eventType: "ai_guide.action_executed",
          aggregateId: {
            in: [publishedOffer.body.id, publishedRequest.body.id],
          },
        },
      });
      assert.equal(guideEvents.length, 2);
      assert.ok(
        guideEvents.every((event) =>
          /^[a-f0-9]{64}$/.test(String((event.payload as any)?.actionHash)),
        ),
      );
    } finally {
      Object.assign(ENV, {
        ALLWAIN_PUBLICATION_CARD_REQUIRED: previousPublicationPolicy.required,
        ALLWAIN_PAYMENTS_ENABLED: previousPublicationPolicy.paymentsEnabled,
        ALLWAIN_STRIPE_LIVEMODE: previousPublicationPolicy.stripeLivemode,
      });
    }
  });

  it("keeps fiscal decisions manual and reconstructs an auditable food order", async () => {
    const missingApprovalEvidence = await client.post(
      "/allwain/compliance/admin/tax-rules",
      {
        code: "E2E_REAGP_CONSUMER",
        version: 1,
        status: "active",
        advisorApprovedAt: new Date().toISOString(),
        conditions: {
          sellerVatRegime: "reagp",
          sellerOwnProduction: true,
          buyerCapacity: "consumer",
          productKind: "food",
        },
        outcome: {
          treatmentCode: "E2E_REAGP_B2C_REVIEW",
          taxRateBps: 0,
          agriculturalCompensationRateBps: 0,
        },
        requiresProfessionalReview: false,
      },
      admin.headers,
    );
    assert.equal(missingApprovalEvidence.status, 409);

    const taxRule = await client.post(
      "/allwain/compliance/admin/tax-rules",
      {
        code: "E2E_REAGP_CONSUMER",
        version: 1,
        status: "active",
        advisorApprovedAt: new Date().toISOString(),
        advisorReference: "E2E only - not a production tax opinion",
        conditions: {
          sellerVatRegime: "reagp",
          sellerOwnProduction: true,
          buyerCapacity: "consumer",
          productKind: "food",
        },
        outcome: {
          treatmentCode: "E2E_REAGP_B2C_REVIEW",
          taxMode: "none",
          compensationMode: "none",
          taxRateBps: 0,
          agriculturalCompensationRateBps: 0,
          taxBaseSources: [],
          compensationBaseSources: [],
          legalBasis:
            "Escenario aislado E2E pendiente de validación profesional.",
          requiredDocuments: [
            {
              documentType: "purchase_receipt",
              issuer: "seller",
              recipient: "buyer",
              amountSource: "order_total",
              signatureBy: "seller",
              taxMode: "none",
              taxRateBps: 0,
              legalBasis:
                "Escenario aislado E2E pendiente de validación profesional.",
            },
          ],
          explanation: "Regla aislada para comprobar revisión manual.",
        },
        requiresProfessionalReview: false,
      },
      admin.headers,
    );
    assert.equal(taxRule.status, 201);

    const fiscalProfile = await client.patch(
      "/allwain/compliance/fiscal-profile",
      {
        kind: "business",
        legalForm: "individual",
        legalName: "Agricultor E2E",
        tradeName: "Huerta E2E",
        taxIdType: "NIF",
        taxId: "12345678Z",
        countryCode: "ES",
        taxTerritory: "Península",
        vatRegime: "reagp",
        reagpActivity: "agricultural_forestry",
        ownProduction: true,
        invoiceEmail: "facturacion-e2e@test.local",
        documentMandateAccepted: true,
        attest: true,
      },
      seller.headers,
    );
    assert.equal(fiscalProfile.status, 200);
    assert.equal(fiscalProfile.body.status, "attested");

    const offer = await client.post(
      "/allwain/offers",
      {
        title: "Naranjas trazables E2E",
        description: "Producción propia con lote obligatorio.",
        price: 1,
        meta: {
          unit: "kg",
          availableQuantity: 20,
          minQuantity: 5,
          quantityStep: 1,
          currency: "EUR",
          category: "alimentacion",
        },
        productCompliance: {
          productKind: "food",
          foodCategory: "fresh_fruit",
          ownProduction: true,
          producerName: "Agricultor E2E",
          originCountry: "ES",
          originRegion: "Valencia",
          responsibleOperator: "Agricultor E2E",
          onlineInfoComplete: true,
          lotTrackingRequired: true,
        },
      },
      seller.headers,
    );
    assert.equal(offer.status, 201);

    const accepted = await client.post(
      `/allwain/offers/${offer.body.id}/accept`,
      {
        quantity: 5,
        deliveryMethod: "pickup",
        purchaseKey: `allwain:e2e:fiscal:${Date.now()}`,
      },
      buyer.headers,
    );
    assert.equal(accepted.status, 201);
    const order = await prisma.allwainOrder.findUnique({
      where: { contractId: accepted.body.id },
    });
    assert.ok(order);

    const compliance = await client.get(
      `/allwain/compliance/orders/${order.id}`,
      buyer.headers,
    );
    assert.equal(compliance.status, 200);
    assert.equal(compliance.body.legalSellerUserId, seller.userId);
    assert.equal(compliance.body.lines.length, 1);
    assert.equal(compliance.body.parties.length, 2);
    assert.ok(
      compliance.body.parties.every((party: any) =>
        /^[a-f0-9]{64}$/.test(party.snapshotHash),
      ),
    );
    assert.equal(compliance.body.tax.ruleVersionId, taxRule.body.id);
    assert.equal(compliance.body.tax.treatmentCode, "E2E_REAGP_B2C_REVIEW");
    assert.equal(compliance.body.tax.status, "manual_review");
    assert.equal(compliance.body.statuses.traceability, "lot_required");
    assert.equal(compliance.body.settlements.length, 1);
    assert.equal(compliance.body.settlements[0].grossAmount, 500);
    assert.equal(compliance.body.settlements[0].platformFeeAmount, 50);
    assert.equal(compliance.body.settlements[0].sellerAmount, 450);
    assert.equal(compliance.body.documents.length, 0);

    const lot = await client.post(
      "/allwain/compliance/lots",
      {
        offerId: offer.body.id,
        code: `E2E-LOT-${Date.now()}`,
        originCountry: "ES",
        originRegion: "Foios, Valencia",
        availableQuantity: 20,
        unit: "kg",
      },
      seller.headers,
    );
    assert.equal(lot.status, 201);
    const allocation = await client.post(
      `/allwain/compliance/orders/${order.id}/lots`,
      { lotId: lot.body.id, quantity: 5 },
      seller.headers,
    );
    assert.equal(allocation.status, 200);

    const incident = await client.post(
      `/allwain/compliance/orders/${order.id}/incidents`,
      {
        type: "quality",
        reason: "Incidencia E2E para comprobar trazabilidad.",
      },
      buyer.headers,
    );
    assert.equal(incident.status, 201);
    const adminIncidents = await client.get(
      "/allwain/compliance/admin/incidents?limit=1&status=open",
      admin.headers,
    );
    assert.equal(adminIncidents.status, 200);
    assert.equal(adminIncidents.body.items.length, 1);
    assert.equal(adminIncidents.body.items[0].id, incident.body.id);

    const audit = await client.get(
      `/allwain/payments/orders/${order.id}/audit`,
      buyer.headers,
    );
    assert.equal(audit.status, 200);
    assert.equal(audit.body.verification.valid, true);
    assert.ok(audit.body.verification.count >= 3);
    assert.match(audit.body.verification.headHash, /^[a-f0-9]{64}$/);
    assert.ok(
      audit.body.events.some(
        (event: any) => event.eventType === "order.created",
      ),
    );
    assert.ok(
      audit.body.events.some(
        (event: any) => event.eventType === "traceability.lot_assigned",
      ),
    );
    assert.ok(
      audit.body.events.some(
        (event: any) => event.eventType === "incident.opened",
      ),
    );

    const auditPdf = await client.getRaw(
      `/allwain/payments/orders/${order.id}/audit/pdf`,
      buyer.headers,
    );
    assert.equal(auditPdf.status, 200);
    assert.match(auditPdf.headers["content-type"] || "", /application\/pdf/);
    assert.equal(auditPdf.body.subarray(0, 4).toString("ascii"), "%PDF");
  });

  it("deduplicates a simultaneous purchase retry with one stable key", async () => {
    const created = await client.post(
      "/allwain/offers",
      {
        title: "Idempotency oranges",
        description: "Offer reserved exactly once.",
        price: 1,
        meta: {
          unit: "kg",
          availableQuantity: 10,
          minQuantity: 2,
          quantityStep: 1,
        },
      },
      seller.headers,
    );
    assert.equal(created.status, 201);
    const body = {
      quantity: 2,
      deliveryMethod: "pickup",
      purchaseKey: `allwain:e2e:${Date.now()}:same-attempt`,
    };
    const results = await Promise.all([
      client.post(
        `/allwain/offers/${created.body.id}/accept`,
        body,
        buyer.headers,
      ),
      client.post(
        `/allwain/offers/${created.body.id}/accept`,
        body,
        buyer.headers,
      ),
    ]);
    assert.deepEqual(
      results.map((item) => item.status),
      [201, 201],
    );
    assert.equal(results[0].body.id, results[1].body.id);
    const offer = await prisma.offer.findUnique({
      where: { id: created.body.id },
    });
    assert.equal((offer?.meta as any).reservedQuantity, 2);
    assert.equal(
      await prisma.contract.count({ where: { purchaseKey: body.purchaseKey } }),
      1,
    );

    const order = await prisma.allwainOrder.findUnique({
      where: { contractId: results[0].body.id },
    });
    assert.ok(order);
    const canceled = await client.post(
      `/allwain/payments/orders/${order.id}/cancel`,
      {},
      buyer.headers,
    );
    assert.equal(canceled.status, 200);
    assert.equal(canceled.body.status, "canceled");
    assert.equal(canceled.body.inventoryStatus, "released");
    const canceledAgain = await client.post(
      `/allwain/payments/orders/${order.id}/cancel`,
      {},
      buyer.headers,
    );
    assert.equal(canceledAgain.status, 200);
    const releasedOffer = await prisma.offer.findUnique({
      where: { id: created.body.id },
    });
    assert.equal((releasedOffer?.meta as any).availableQuantity, 10);
    assert.equal((releasedOffer?.meta as any).reservedQuantity, 0);
    assert.equal(
      await prisma.allwainOrderStatusEvent.count({
        where: { orderId: order.id, toStatus: "canceled" },
      }),
      1,
    );
  });

  it("allows one buyer only to reserve the last unit under concurrency", async () => {
    const created = await client.post(
      "/allwain/offers",
      {
        title: "Last television",
        description: "One unit remains.",
        price: 450,
        meta: {
          unit: "unidad",
          availableQuantity: 1,
          minQuantity: 1,
          quantityStep: 1,
        },
      },
      seller.headers,
    );
    const results = await Promise.all([
      client.post(
        `/allwain/offers/${created.body.id}/accept`,
        {
          quantity: 1,
          deliveryMethod: "pickup",
          purchaseKey: `allwain:e2e:${Date.now()}:buyer-one`,
        },
        buyer.headers,
      ),
      client.post(
        `/allwain/offers/${created.body.id}/accept`,
        {
          quantity: 1,
          deliveryMethod: "pickup",
          purchaseKey: `allwain:e2e:${Date.now()}:buyer-two`,
        },
        secondBuyer.headers,
      ),
    ]);
    assert.deepEqual(results.map((item) => item.status).sort(), [201, 409]);
    const offer = await prisma.offer.findUnique({
      where: { id: created.body.id },
    });
    assert.equal((offer?.meta as any).availableQuantity, 0);
    assert.equal((offer?.meta as any).reservedQuantity, 1);
    assert.equal(offer?.allwainStatus, "sold_out");
  });

  it("groups three proposals and atomically records the selected one", async () => {
    const requestId = `e2e-competitive-${Date.now()}`;
    await prisma.allwainScanRequest.create({
      data: {
        id: requestId,
        userId: secondBuyer.userId,
        sourceType: "text",
        status: "submitted",
        title: "Necesito 20 kg de mandarinas",
        description: "Petición competitiva E2E.",
        extracted: {
          productName: "Mandarinas",
          quantity: 20,
          unit: "kg",
          category: "alimentacion",
          productKind: "produce_weight",
          currency: "EUR",
          deliveryWindow: "Esta semana",
          deliveryMethod: "pickup",
          deliveryAddress: "Foios, Valencia",
          confidence: 1,
        },
        offers: [],
        ai: {
          provider: "mock",
          confidence: 1,
          summary: "E2E",
          warnings: [],
        },
        category: "alimentacion",
        productKind: "produce_weight",
        unit: "kg",
        currency: "EUR",
      },
    });
    const proposals: any[] = [];
    for (let index = 0; index < proposalSellers.length; index += 1) {
      const response = await client.post(
        `/allwain/market/requests/${requestId}/offers`,
        {
          price: 1 + index * 0.1,
          availableQuantity: 20,
          deliveryEstimate: `${index + 1} días`,
          description: `Propuesta E2E número ${index + 1}.`,
        },
        proposalSellers[index].headers,
      );
      assert.equal(response.status, 201);
      proposals.push(response.body);
    }
    const grouped = await client.get(
      `/allwain/scan-requests/${requestId}`,
      secondBuyer.headers,
    );
    assert.equal(grouped.status, 200);
    assert.equal(grouped.body.offers.length, 3);

    const notifications = await client.get(
      "/allwain/notifications?limit=100",
      secondBuyer.headers,
    );
    assert.equal(notifications.status, 200);
    const proposalNotifications = notifications.body.items.filter(
      (item: any) =>
        item.type === "request.offer_received" &&
        item.route === "request" &&
        item.routeParams?.requestId === requestId,
    );
    assert.equal(proposalNotifications.length, 3);
    assert.ok(
      proposalNotifications.every(
        (item: any) =>
          item.routeParams?.mode === "buy" &&
          proposals.some(
            (proposal: any) => proposal.id === item.routeParams?.offerId,
          ),
      ),
    );
    const readNotification = await client.post(
      `/allwain/notifications/${proposalNotifications[0].id}/read`,
      {},
      secondBuyer.headers,
    );
    assert.equal(readNotification.status, 200);
    assert.ok(readNotification.body.readAt);

    const selected = proposals[1];
    const accepted = await client.post(
      `/allwain/offers/${selected.id}/accept`,
      {
        quantity: 20,
        deliveryMethod: "pickup",
        purchaseKey: `allwain:e2e:${requestId}:selection`,
      },
      secondBuyer.headers,
    );
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.status, "accepted");
    assert.equal(accepted.body.requestId, requestId);
    const request = await prisma.allwainScanRequest.findUnique({
      where: { id: requestId },
    });
    assert.equal(request?.status, "awarded");
    assert.equal(request?.selectedOfferId, selected.id);
    const savedProposals = await prisma.offer.findMany({
      where: { requestId },
      orderBy: { price: "asc" },
    });
    assert.equal(
      savedProposals.filter((item) => item.allwainStatus === "selected").length,
      1,
    );
    assert.equal(
      savedProposals.filter((item) => item.allwainStatus === "not_selected")
        .length,
      2,
    );
    const secondSelection = await client.post(
      `/allwain/offers/${proposals[0].id}/accept`,
      {
        quantity: 20,
        deliveryMethod: "pickup",
        purchaseKey: `allwain:e2e:${requestId}:second-selection`,
      },
      secondBuyer.headers,
    );
    assert.ok([404, 409].includes(secondSelection.status));
  });
});
