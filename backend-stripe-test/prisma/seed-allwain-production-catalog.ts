import "dotenv/config";

import fs from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { appendAllwainAuditEventTx } from "../src/services/allwain-audit";
import {
  ensureAllwainImageMeta,
  ensureAllwainRequestImageMeta,
} from "../src/services/allwain-card-images.service";

const CONFIRMATION = "RESET_ALLWAIN_OPERATIONAL_DATA";
const BATCH_ID = "allwain-production-catalog-v1";
const PRODUCT_PREFIX = "allwain-catalog-product-";
const OFFER_PREFIX = "allwain-catalog-offer-";
const REQUEST_PREFIX = "allwain-catalog-request-";
const PROPOSAL_PREFIX = "allwain-catalog-proposal-";
const PUBLIC_CATALOG_COUNT = 12;
const PUBLIC_REQUEST_COUNT = 8;

type CatalogTemplate = {
  name: string;
  category: string;
  subcategory: string;
  productKind: string;
  unit: string;
  price: number;
  minimum: number;
};

const templates: CatalogTemplate[] = [
  { name: "Naranjas Navelina", category: "alimentacion", subcategory: "fruta", productKind: "produce_weight", unit: "kg", price: 1, minimum: 5 },
  { name: "Tomate valenciano", category: "alimentacion", subcategory: "verdura", productKind: "produce_weight", unit: "kg", price: 2.4, minimum: 2 },
  { name: "Miel de azahar", category: "alimentacion", subcategory: "despensa", productKind: "packaged_food", unit: "unidad", price: 8.5, minimum: 1 },
  { name: "Aceite de oliva virgen extra", category: "alimentacion", subcategory: "despensa", productKind: "packaged_food", unit: "litro", price: 9.9, minimum: 1 },
  { name: "Arroz de Valencia", category: "alimentacion", subcategory: "despensa", productKind: "packaged_food", unit: "kg", price: 3.2, minimum: 1 },
  { name: "Lavadora de bajo consumo", category: "hogar", subcategory: "electrodomesticos", productKind: "appliance", unit: "unidad", price: 389, minimum: 1 },
  { name: "Televisor 4K", category: "tecnologia", subcategory: "television", productKind: "electronics", unit: "unidad", price: 449, minimum: 1 },
  { name: "Ordenador portátil profesional", category: "tecnologia", subcategory: "informatica", productKind: "electronics", unit: "unidad", price: 829, minimum: 1 },
  { name: "Bicicleta urbana", category: "movilidad", subcategory: "bicicletas", productKind: "vehicle", unit: "unidad", price: 295, minimum: 1 },
  { name: "Revisión de vehículo", category: "servicios", subcategory: "taller", productKind: "service", unit: "servicio", price: 65, minimum: 1 },
  { name: "Reparación de fontanería", category: "servicios", subcategory: "hogar", productKind: "service", unit: "servicio", price: 55, minimum: 1 },
  { name: "Diseño de identidad comercial", category: "servicios", subcategory: "diseno", productKind: "service", unit: "servicio", price: 320, minimum: 1 },
];

const locations = [
  { label: "Foios, Valencia", lat: 39.534, lng: -0.356 },
  { label: "Meliana, Valencia", lat: 39.528, lng: -0.349 },
  { label: "Alboraya, Valencia", lat: 39.5, lng: -0.349 },
  { label: "Valencia", lat: 39.47, lng: -0.376 },
  { label: "Moncada, Valencia", lat: 39.545, lng: -0.395 },
  { label: "Massamagrell, Valencia", lat: 39.57, lng: -0.335 },
];

function createClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

function requireSafetyConfirmation() {
  if (process.env.ALLWAIN_OPERATIONAL_RESET_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set ALLWAIN_OPERATIONAL_RESET_CONFIRM=${CONFIRMATION}`);
  }
  if (process.env.ALLWAIN_ALLOW_PRODUCTION_RESET !== "YES") {
    throw new Error("Set ALLWAIN_ALLOW_PRODUCTION_RESET=YES");
  }
  const backupReference = process.env.ALLWAIN_BACKUP_REFERENCE;
  if (!backupReference || !fs.existsSync(backupReference)) {
    throw new Error("ALLWAIN_BACKUP_REFERENCE must point to an existing backup");
  }
  if (String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")) {
    throw new Error("LIVE_STRIPE_RESET_FORBIDDEN");
  }
  return backupReference;
}

function pad(value: number, size = 4) {
  return value.toString().padStart(size, "0");
}

async function createManyInBatches(
  model: { createMany(input: { data: any[]; skipDuplicates?: boolean }): Promise<unknown> },
  rows: any[],
) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await model.createMany({
      data: rows.slice(offset, offset + 250),
      skipDuplicates: true,
    });
  }
}

async function main() {
  const backupReference = requireSafetyConfirmation();
  const { prisma, pool } = createClient();
  const isIsolatedTestDatabase = /(?:^|[_-])e2e(?:[_-]|$)/i.test(
    String(process.env.DATABASE_URL || ""),
  );
  try {
    const [
      usersBefore,
      trueqiaOffersBefore,
      trueqiaContractsBefore,
      allwainOrdersBefore,
      allwainPaymentsBefore,
      allwainContractsBefore,
      sellerProfiles,
      buyers,
    ] =
      await Promise.all([
        prisma.user.count(),
        prisma.offer.count({ where: { owner: "trueqia" } }),
        prisma.contract.count({ where: { app: "trueqia" } }),
        prisma.allwainOrder.count(),
        prisma.allwainPayment.count(),
        prisma.contract.count({ where: { app: "allwain" } }),
        prisma.allwainSellerProfile.findMany({
          where: { status: "active" },
          select: { userId: true },
        }),
        prisma.user.findMany({
          where: {
            deletedAt: null,
            ...(isIsolatedTestDatabase
              ? {}
              : { email: { endsWith: "@newmersive.local" } }),
          },
          select: { id: true, email: true, name: true },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    const sellers = await prisma.user.findMany({
      where: {
        id: { in: sellerProfiles.map((profile) => profile.userId) },
        deletedAt: null,
      },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if (!sellers.length || !buyers.length) {
      throw new Error("INTERNAL_SEED_USERS_REQUIRED");
    }
    const pilotSeller =
      sellers.find((seller) => seller.email === "allwain41@gmail.com") ||
      sellers[0];
    const existingBatchCount = await prisma.product.count({
      where: { id: { startsWith: PRODUCT_PREFIX } },
    });
    const existingBatchOffers = await prisma.offer.count({
      where: {
        OR: [
          { id: "allwain-pilot-naranjas-foios" },
          { id: { startsWith: OFFER_PREFIX } },
          { id: { startsWith: PROPOSAL_PREFIX } },
        ],
      },
    });
    const existingBatchRequests = await prisma.allwainScanRequest.count({
      where: { id: { startsWith: REQUEST_PREFIX } },
    });
    if (existingBatchCount || existingBatchOffers || existingBatchRequests) {
      throw new Error("PRODUCTION_CATALOG_BATCH_ALREADY_PRESENT");
    }
    const backgroundSellers = sellers.filter((seller) =>
      seller.email.endsWith("@newmersive.local"),
    );
    const usableSellers = backgroundSellers.length ? backgroundSellers : sellers;

    const products = Array.from({ length: 1_000 }, (_, index) => {
      const template = templates[index % templates.length];
      const location = locations[index % locations.length];
      const isPublicDemo = index > 0 && index < PUBLIC_CATALOG_COUNT;
      return {
        id: `${PRODUCT_PREFIX}${pad(index)}`,
        name:
          index === 0
            ? "Naranjas valencianas de primera calidad"
            : isPublicDemo
              ? `${template.name} · ${location.label.split(",")[0]}`
              : `${template.name} · ${location.label.split(",")[0]} ${pad(index)}`,
        ean: `290${index.toString().padStart(10, "0")}`,
        category: template.category,
        brand:
          index === 0
            ? "Allwain · Foios"
            : isPublicDemo
              ? "Catálogo de demostración Allwain"
              : `Proveedor local ${index % 24 + 1}`,
        visibility: index < PUBLIC_CATALOG_COUNT ? "public" : "internal_test",
        description:
          index === 0
            ? "Naranjas valencianas recién recogidas, directas del agricultor y con reparto local."
            : isPublicDemo
              ? `${template.name} en ${location.label}. Oferta de demostración para explorar Allwain sin generar pedidos ni cobros.`
              : `${template.name} con disponibilidad registrada en ${location.label}.`,
      };
    });

    const offers = products.map((product, index) => {
      const template = templates[index % templates.length];
      const location = locations[index % locations.length];
      const seller = index === 0 ? pilotSeller : usableSellers[index % usableSellers.length];
      const stock = index === 0 ? 100_000 : 20 + (index % 180);
      const isPublicDemo = index > 0 && index < PUBLIC_CATALOG_COUNT;
      return {
        id: index === 0 ? "allwain-pilot-naranjas-foios" : `${OFFER_PREFIX}${pad(index)}`,
        title: product.name,
        description: product.description || template.name,
        owner: "allwain",
        ownerUserId: seller.id,
        price: index === 0 ? 1 : Number((template.price + (index % 7) * 0.15).toFixed(2)),
        productId: product.id,
        meta: ensureAllwainImageMeta({
          source: BATCH_ID,
          synthetic: index !== 0,
          demo: isPublicDemo,
          demoLabel: isPublicDemo ? "Oferta de demostración" : undefined,
          checkoutEnabled: !isPublicDemo,
          featured: index === 0,
          inventoryManaged: true,
          stockQuantity: stock,
          availableQuantity: stock,
          reservedQuantity: 0,
          soldQuantity: 0,
          minQuantity: index === 0 ? 5 : template.minimum,
          quantityStep: 1,
          unit: template.unit,
          category: template.category,
          subcategory: template.subcategory,
          productKind: template.productKind,
          currency: "EUR",
          deliveryChannel: index === 0 ? "local_connector" : "carrier",
          origin: location.label,
        }, {
          title: product.name,
          description: product.description,
          category: template.category,
          subcategory: template.subcategory,
          productKind: template.productKind,
        }),
        allwainType: "catalog",
        allwainStatus: index < PUBLIC_CATALOG_COUNT ? "active" : "paused",
        currency: "EUR",
        unit: template.unit,
        category: template.category,
        subcategory: template.subcategory,
        productKind: template.productKind,
        locationLabel: location.label,
      };
    });

    const requests = Array.from({ length: 1_000 }, (_, index) => {
      const template = templates[(index + 3) % templates.length];
      const location = locations[(index + 2) % locations.length];
      const buyer = buyers[index % buyers.length];
      const status =
        index < 30
          ? "submitted"
          : index < 100
            ? "ready"
            : index < 300
              ? "draft"
              : index < 500
                ? "awarded"
                : index < 700
                  ? "closed"
                  : index < 850
                    ? "canceled"
                    : "archived";
      const quantity = template.unit === "kg" ? 10 + (index % 10) * 5 : 1 + (index % 3);
      const selectedOfferId =
        status === "awarded" ? `${PROPOSAL_PREFIX}${pad(index)}-00` : null;
      return {
        id: `${REQUEST_PREFIX}${pad(index)}`,
        userId: buyer.id,
        sourceType: index % 3 === 0 ? "camera" : "text",
        status,
        visibility: index < PUBLIC_REQUEST_COUNT ? "public" : "internal_test",
        title: `Busco ${template.name.toLowerCase()} en ${location.label.split(",")[0]}`,
        description: `Necesito ${quantity} ${template.unit} con entrega acordada y condiciones claras.`,
        extracted: {
          productName: template.name,
          quantity,
          unit: template.unit,
          category: template.category,
          subcategory: template.subcategory,
          productKind: template.productKind,
          currency: "EUR",
          deliveryWindow: "Durante los próximos 7 días",
          deliveryMethod: "shipping",
          deliveryChannel: "local_connector",
          locationLabel: location.label,
          confidence: 0.98,
        },
        product: null,
        offers: [],
        imageMeta: ensureAllwainRequestImageMeta(
          null,
          {
            productName: template.name,
            quantity,
            unit: template.unit,
            category: template.category,
            subcategory: template.subcategory,
            productKind: template.productKind,
            currency: "EUR",
            confidence: 0.98,
          },
          `Busco ${template.name.toLowerCase()} en ${location.label.split(",")[0]}`,
        ),
        ai: {
          provider: "catalog-seed",
          model: BATCH_ID,
          demo: index < PUBLIC_REQUEST_COUNT,
          demoLabel:
            index < PUBLIC_REQUEST_COUNT
              ? "Petición de demostración"
              : undefined,
          confidence: 0.98,
          summary: "Ficha estructurada para validar volumen, filtros y comparación.",
          warnings: [],
        },
        selectedOfferId,
        selectedAt: selectedOfferId ? new Date() : null,
        closedAt: ["closed", "canceled"].includes(status) ? new Date() : null,
        qualityDecision: "approve",
        qualityScore: 92,
        qualityReviewedAt: new Date(),
        paymentGuaranteeStatus: ["submitted", "awarded"].includes(status)
          ? "ready"
          : "not_started",
        category: template.category,
        subcategory: template.subcategory,
        productKind: template.productKind,
        unit: template.unit,
        currency: "EUR",
        locationLabel: location.label,
        locationLatApprox: location.lat,
        locationLngApprox: location.lng,
      };
    });

    const proposals: any[] = [];
    requests.forEach((request, requestIndex) => {
      if (!["submitted", "awarded"].includes(request.status)) return;
      const proposalCount = requestIndex === 2 ? 12 : 3;
      for (let proposalIndex = 0; proposalIndex < proposalCount; proposalIndex += 1) {
        const template = templates[(requestIndex + 3) % templates.length];
        const seller = usableSellers[proposalIndex % usableSellers.length];
        const selected = request.status === "awarded" && proposalIndex === 0;
        const quantity = Number((request.extracted as any).quantity);
        proposals.push({
          id: `${PROPOSAL_PREFIX}${pad(requestIndex)}-${proposalIndex.toString().padStart(2, "0")}`,
          title: `Propuesta para ${request.title}`,
          description: `Entrega en ${proposalIndex + 1} día${proposalIndex ? "s" : ""} con disponibilidad confirmada.`,
          owner: "allwain",
          ownerUserId: seller.id,
          price: Number((template.price + proposalIndex * 0.35).toFixed(2)),
          meta: ensureAllwainImageMeta({
            requestId: request.id,
            source: BATCH_ID,
            synthetic: true,
            inventoryManaged: true,
            stockQuantity: quantity,
            availableQuantity: quantity,
            reservedQuantity: 0,
            soldQuantity: 0,
            minQuantity: quantity,
            quantityStep: 1,
            unit: template.unit,
            currency: "EUR",
            deliveryEstimate: `${proposalIndex + 1} día${proposalIndex ? "s" : ""}`,
          }, {
            title: request.title,
            description: request.description,
            category: template.category,
            subcategory: template.subcategory,
            productKind: template.productKind,
          }),
          allwainType: "proposal",
          allwainStatus: selected
            ? "selected"
            : request.status === "awarded"
              ? "not_selected"
              : "active",
          requestId: request.id,
          currency: "EUR",
          unit: template.unit,
          category: template.category,
          subcategory: template.subcategory,
          productKind: template.productKind,
          locationLabel: request.locationLabel,
        });
      }
    });

    let archivedOrderCount = 0;
    let archivedContractCount = 0;
    let archivedOfferCount = 0;
    let archivedRequestCount = 0;
    const archiveReason = "preproduction_test_data_cleanup";

    await prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const nowIso = now.toISOString();
        const ordersToArchive = await tx.allwainOrder.findMany({
          where: { operationalArchivedAt: null },
          select: {
            id: true,
            contractId: true,
            offerId: true,
            status: true,
            paymentStatus: true,
            fulfillmentStatus: true,
          },
        });
        const orderIds = ordersToArchive.map((order) => order.id);

        const processingOccurrences = await tx.allwainRecurringOccurrence.count({
          where: { status: "processing" },
        });
        if (processingOccurrences) {
          throw new Error("RECURRING_CHARGE_IN_PROGRESS");
        }

        const plansToCancel = orderIds.length
          ? await tx.allwainRecurringPlan.findMany({
              where: {
                sourceOrderId: { in: orderIds },
                status: { notIn: ["canceled", "completed"] },
              },
              select: { id: true, sourceOrderId: true, status: true },
            })
          : [];
        for (const plan of plansToCancel) {
          await tx.allwainRecurringPlan.update({
            where: { id: plan.id },
            data: { status: "canceled", canceledAt: now, nextRunAt: null },
          });
          await appendAllwainAuditEventTx(tx, {
            aggregateType: "recurring_plan",
            aggregateId: plan.id,
            orderId: plan.sourceOrderId,
            eventType: "recurring_plan.canceled_by_operational_archive",
            actorRole: "system",
            source: "controlled_preproduction_cleanup",
            payload: {
              previousStatus: plan.status,
              archiveBatch: BATCH_ID,
              reason: archiveReason,
            },
          });
        }

        if (orderIds.length) {
          await tx.allwainDeliveryAssignment.updateMany({
            where: {
              orderId: { in: orderIds },
              status: { notIn: ["delivered", "canceled"] },
            },
            data: { status: "canceled", canceledAt: now },
          });
        }

        for (const order of ordersToArchive) {
          await tx.allwainOrder.update({
            where: { id: order.id },
            data: {
              operationalArchivedAt: now,
              operationalArchiveReason: archiveReason,
              operationalArchiveBatch: BATCH_ID,
            },
          });
          await appendAllwainAuditEventTx(tx, {
            aggregateId: order.id,
            orderId: order.id,
            eventType: "order.operational_archived",
            actorRole: "system",
            source: "controlled_preproduction_cleanup",
            payload: {
              contractId: order.contractId,
              offerId: order.offerId,
              status: order.status,
              paymentStatus: order.paymentStatus,
              fulfillmentStatus: order.fulfillmentStatus,
              archiveBatch: BATCH_ID,
              reason: archiveReason,
              evidencePreserved: true,
            },
          });
        }
        archivedOrderCount = ordersToArchive.length;

        archivedContractCount = (
          await tx.contract.updateMany({
            where: { app: "allwain", operationalArchivedAt: null },
            data: {
              operationalArchivedAt: now,
              operationalArchiveReason: archiveReason,
              operationalArchiveBatch: BATCH_ID,
            },
          })
        ).count;

        archivedOfferCount = Number(
          await tx.$executeRaw(Prisma.sql`
            UPDATE "Offer"
               SET "allwainStatus" = 'archived',
                   "meta" = COALESCE("meta", '{}'::jsonb) || jsonb_build_object(
                     'archived', true,
                     'status', 'archived',
                     'availableQuantity', 0,
                     'previousAllwainStatus', COALESCE("allwainStatus", 'active'),
                     'operationalArchiveBatch', CAST(${BATCH_ID} AS text),
                     'operationalArchivedAt', CAST(${nowIso} AS text)
                   ),
                   "updatedAt" = ${now}
             WHERE "owner" = 'allwain'
          `),
        );

        archivedRequestCount = Number(
          await tx.$executeRaw(Prisma.sql`
            UPDATE "AllwainScanRequest"
               SET "status" = 'archived',
                   "visibility" = 'operational_archive',
                   "ai" = COALESCE("ai", '{}'::jsonb) || jsonb_build_object(
                     'operationalArchive', jsonb_build_object(
                       'previousStatus', "status",
                       'archiveBatch', CAST(${BATCH_ID} AS text),
                       'archivedAt', CAST(${nowIso} AS text),
                       'reason', CAST(${archiveReason} AS text)
                     )
                   ),
                   "closedAt" = COALESCE("closedAt", ${now}),
                   "updatedAt" = ${now}
          `),
        );

        await tx.$executeRaw(Prisma.sql`
          UPDATE "ChatParticipant"
             SET "archivedAt" = COALESCE("archivedAt", ${now})
           WHERE "threadId" IN (
             SELECT "id" FROM "ChatThread" WHERE "app" = 'allwain'
           )
        `);
        await tx.allwainNotification.updateMany({
          where: { archivedAt: null },
          data: { readAt: now, archivedAt: now },
        });

        await createManyInBatches(tx.product as any, products);
        await createManyInBatches(tx.allwainScanRequest as any, requests);
        await createManyInBatches(tx.offer as any, offers);
        await createManyInBatches(tx.offer as any, proposals);
      },
      { maxWait: 20_000, timeout: 180_000 },
    );

    const [
      usersAfter,
      trueqiaOffersAfter,
      trueqiaContractsAfter,
      allwainOrdersAfter,
      allwainPaymentsAfter,
      allwainContractsAfter,
      productCount,
      offerCount,
      requestCount,
      proposalCount,
      publicCatalogOffers,
      publicCatalogProducts,
      publicSyntheticRequests,
      visibleLegacyOrders,
      visibleLegacyContracts,
      pilotPaymentAccount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.offer.count({ where: { owner: "trueqia" } }),
      prisma.contract.count({ where: { app: "trueqia" } }),
      prisma.allwainOrder.count(),
      prisma.allwainPayment.count(),
      prisma.contract.count({ where: { app: "allwain" } }),
      prisma.product.count({ where: { id: { startsWith: PRODUCT_PREFIX } } }),
      prisma.offer.count({
        where: {
          allwainType: "catalog",
          OR: [
            { id: "allwain-pilot-naranjas-foios" },
            { id: { startsWith: OFFER_PREFIX } },
          ],
        },
      }),
      prisma.allwainScanRequest.count({
        where: { id: { startsWith: REQUEST_PREFIX } },
      }),
      prisma.offer.count({ where: { id: { startsWith: PROPOSAL_PREFIX } } }),
      prisma.offer.count({
        where: {
          allwainType: "catalog",
          allwainStatus: "active",
          OR: [
            { id: "allwain-pilot-naranjas-foios" },
            { id: { startsWith: OFFER_PREFIX } },
          ],
        },
      }),
      prisma.product.count({
        where: {
          id: { startsWith: PRODUCT_PREFIX },
          visibility: "public",
        },
      }),
      prisma.allwainScanRequest.count({
        where: {
          id: { startsWith: REQUEST_PREFIX },
          visibility: "public",
        },
      }),
      prisma.allwainOrder.count({ where: { operationalArchivedAt: null } }),
      prisma.contract.count({
        where: { app: "allwain", operationalArchivedAt: null },
      }),
      prisma.allwainSellerPaymentAccount.findUnique({
        where: { userId: pilotSeller.id },
        select: {
          status: true,
          chargesEnabled: true,
          transfersEnabled: true,
          payoutsEnabled: true,
        },
      }),
    ]);

    if (
      usersAfter !== usersBefore ||
      trueqiaOffersAfter !== trueqiaOffersBefore ||
      trueqiaContractsAfter !== trueqiaContractsBefore ||
      allwainOrdersAfter !== allwainOrdersBefore ||
      allwainPaymentsAfter !== allwainPaymentsBefore ||
      allwainContractsAfter !== allwainContractsBefore
    ) {
      throw new Error("DATA_SCOPE_ASSERTION_FAILED_RESTORE_BACKUP");
    }
    if (
      productCount !== 1_000 ||
      offerCount !== 1_000 ||
      requestCount !== 1_000 ||
      publicCatalogOffers !== PUBLIC_CATALOG_COUNT ||
      publicCatalogProducts !== PUBLIC_CATALOG_COUNT ||
      publicSyntheticRequests !== PUBLIC_REQUEST_COUNT ||
      visibleLegacyOrders !== 0 ||
      visibleLegacyContracts !== 0
    ) {
      throw new Error("SEED_COUNT_ASSERTION_FAILED");
    }

    console.log(
      JSON.stringify(
        {
          backupReference,
          usersPreserved: usersAfter,
          trueqiaOffersPreserved: trueqiaOffersAfter,
          trueqiaContractsPreserved: trueqiaContractsAfter,
          allwainOrdersPreserved: allwainOrdersAfter,
          allwainPaymentsPreserved: allwainPaymentsAfter,
          allwainContractsPreserved: allwainContractsAfter,
          archivedOrders: archivedOrderCount,
          archivedContracts: archivedContractCount,
          archivedOffers: archivedOfferCount,
          archivedRequests: archivedRequestCount,
          allwainProducts: productCount,
          allwainCatalogOffers: offerCount,
          allwainRequests: requestCount,
          allwainProposals: proposalCount,
          publicCatalogOffers,
          publicCatalogProducts,
          publicSyntheticRequests,
          pilotSeller: pilotSeller.email,
          pilotCheckoutReady: Boolean(
            pilotPaymentAccount?.status === "enabled" &&
              pilotPaymentAccount.chargesEnabled &&
              pilotPaymentAccount.transfersEnabled &&
              pilotPaymentAccount.payoutsEnabled,
          ),
          batchId: BATCH_ID,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
