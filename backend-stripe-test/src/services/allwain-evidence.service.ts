import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { Prisma } from "@prisma/client";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import type { ValidatedImageDataUrl } from "../security/image-data-url";
import type { AllwainScanDocument } from "../shared/types";
import { appendAllwainAuditEventTx, canonicalAllwainAuditJson } from "./allwain-audit";
import { allwainPrivateImageBuffer } from "./allwain-card-images.service";
import { applyAllwainProductIntelligence } from "./allwain-product-intelligence";
import { getAllwainShoppingListForUser } from "./allwain-shopping-lists.service";
import type { ScanResult } from "./scan.service";

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function evidencePath(storageKey: string) {
  const root = path.resolve(ENV.ALLWAIN_EVIDENCE_DIR);
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("INVALID_EVIDENCE_PATH");
  }
  return { root, resolved };
}

function normalizedEvidenceItems(document: AllwainScanDocument) {
  return document.items.map((item, position) => {
    const intelligence = applyAllwainProductIntelligence(
      {
        productName: item.productName,
        description: item.description || undefined,
        quantity: item.quantity,
        unit: item.unit,
        targetPrice: item.lineTotal,
        currency: item.currency,
        rawText: item.rawText,
        confidence: item.confidence,
        notes: [],
      } as any,
      { rawText: item.rawText, unitSource: "model" },
    );
    const unitPriceAmount = Math.round(item.unitPrice * 100);
    const lineTotalAmount = Math.round(item.lineTotal * 100);
    if (
      !Number.isSafeInteger(unitPriceAmount) ||
      unitPriceAmount < 1 ||
      !Number.isSafeInteger(lineTotalAmount) ||
      lineTotalAmount < 1
    ) {
      throw new Error("INVALID_OCR_LINE_PRICE");
    }
    return {
      id: randomUUID(),
      position,
      rawText: item.rawText.slice(0, 1_000),
      productName: item.productName.trim().slice(0, 160),
      description: item.description?.trim().slice(0, 1_000) || null,
      quantity: item.quantity,
      unit: intelligence.unit || item.unit || "ud",
      unitPriceAmount,
      lineTotalAmount,
      currency: item.currency.toUpperCase(),
      confidence: Math.max(0, Math.min(1, item.confidence)),
      taxIncluded: item.taxIncluded ?? null,
      discountAmount:
        typeof item.discountAmount === "number"
          ? Math.max(0, Math.round(item.discountAmount * 100))
          : null,
      category: intelligence.category || null,
      subcategory: intelligence.subcategory || null,
      productKind: intelligence.productKind || "general",
    };
  });
}

export async function createAllwainOcrShoppingListDraft(input: {
  userId: string;
  sourceType: string;
  image: ValidatedImageDataUrl;
  scan: ScanResult;
}) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    throw new Error("OCR_EVIDENCE_REQUIRES_POSTGRES");
  }
  if (!input.scan.document || input.scan.document.items.length < 1) {
    throw new Error("OCR_DOCUMENT_ITEMS_MISSING");
  }
  const document = input.scan.document;
  const items = normalizedEvidenceItems(document);
  const outputBuffer = allwainPrivateImageBuffer(input.image);
  const contentHash = sha256(outputBuffer);
  const rawText = input.scan.extracted.rawText || "";
  const rawTextHash = rawText ? sha256(rawText) : null;
  const documentId = randomUUID();
  const extractionId = randomUUID();
  const shoppingListId = randomUUID();
  const extension = input.image.mimeType === "image/png" ? "png" : "jpg";
  const storageKey = `${documentId}.${extension}`;
  const { root, resolved: finalPath } = evidencePath(storageKey);
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
  const temporaryPath = `${finalPath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryPath, outputBuffer, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.rename(temporaryPath, finalPath);

  const prisma = getPrisma() as any;
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`ocr_evidence:${input.userId}:${contentHash}`}))`,
      );
      const user = await tx.user.findFirst({
        where: { id: input.userId, deletedAt: null, status: "active" },
        select: { id: true },
      });
      if (!user) throw new Error("USER_NOT_FOUND");
      const duplicate = await tx.allwainEvidenceDocument.findFirst({
        where: {
          ownerUserId: input.userId,
          contentHash,
          status: "active",
        },
        select: { id: true },
      });
      if (duplicate) throw new Error("DUPLICATE_EVIDENCE_DOCUMENT");

      await tx.allwainEvidenceDocument.create({
        data: {
          id: documentId,
          ownerUserId: input.userId,
          sourceType: input.sourceType,
          documentType: document.kind,
          status: "active",
          mimeType: input.image.mimeType,
          storageKey,
          byteSize: outputBuffer.length,
          contentHash,
          rawTextHash,
        },
      });
      const extractionPayload = {
        version: 1,
        provider: input.scan.provider,
        model:
          typeof input.scan.rawData.model === "string"
            ? input.scan.rawData.model
            : null,
        document,
        rawData: input.scan.rawData,
      };
      await tx.allwainOcrExtraction.create({
        data: {
          id: extractionId,
          evidenceDocumentId: documentId,
          version: 1,
          provider: input.scan.provider,
          model:
            typeof input.scan.rawData.model === "string"
              ? input.scan.rawData.model
              : "allwain-document-extractor-v1",
          status: "captured",
          rawText: rawText || null,
          rawData: extractionPayload,
          confidence: document.confidence,
          extractionHash: sha256(canonicalAllwainAuditJson(extractionPayload)),
        },
      });
      await tx.allwainOcrLineItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          extractionId,
          position: item.position,
          rawText: item.rawText,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceAmount: item.unitPriceAmount,
          lineTotalAmount: item.lineTotalAmount,
          currency: item.currency,
          confidence: item.confidence,
          taxIncluded: item.taxIncluded,
          discountAmount: item.discountAmount,
          reviewStatus: "selected",
        })),
      });
      const title = document.merchant
        ? `Precios de ${document.merchant}`
        : `Compra capturada (${items.length} artículos)`;
      await tx.allwainShoppingList.create({
        data: {
          id: shoppingListId,
          buyerUserId: input.userId,
          sourceEvidenceDocumentId: documentId,
          sourceOcrExtractionId: extractionId,
          sourceKind: "ocr_document",
          title: title.slice(0, 140),
          description:
            "Lista creada desde un documento. Revisa y elige qué artículos quieres mejorar.",
          status: "draft",
          visibility: "private",
          currency: document.currency,
          proposalDeadlineAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000),
        },
      });
      const capturedAt = new Date();
      await tx.allwainShoppingListItem.createMany({
        data: items.map((item) => ({
          id: randomUUID(),
          shoppingListId,
          position: item.position,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          targetUnitPriceAmount: item.unitPriceAmount,
          reviewStatus: "selected",
          referencePriceSource: "ocr_document",
          referencePriceLocked: true,
          referenceCapturedAt: capturedAt,
          referenceDocumentId: documentId,
          ocrLineItemId: item.id,
          category: item.category,
          subcategory: item.subcategory,
          productKind: item.productKind,
        })),
      });
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "shopping_list",
        aggregateId: shoppingListId,
        eventType: "shopping_list.created_from_ocr_evidence",
        actorUserId: input.userId,
        actorRole: "buyer",
        source: "allwain_scan_capture",
        payload: {
          evidenceDocumentId: documentId,
          ocrExtractionId: extractionId,
          documentType: document.kind,
          contentHash,
          extractionHash: sha256(canonicalAllwainAuditJson(extractionPayload)),
          itemCount: items.length,
          capturedReferenceAmount: items.reduce(
            (sum, item) => sum + item.lineTotalAmount,
            0,
          ),
          currency: document.currency,
        },
      });
    });
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    await fs.promises.rm(finalPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    evidenceDocumentId: documentId,
    ocrExtractionId: extractionId,
    shoppingList: await getAllwainShoppingListForUser(
      input.userId,
      shoppingListId,
    ),
  };
}

export async function annulAllwainOcrEvidence(input: {
  userId: string;
  evidenceDocumentId: string;
  reason?: string;
}) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    throw new Error("OCR_EVIDENCE_REQUIRES_POSTGRES");
  }
  const prisma = getPrisma() as any;
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`ocr_evidence:${input.evidenceDocumentId}`}))`,
    );
    const evidence = await tx.allwainEvidenceDocument.findUnique({
      where: { id: input.evidenceDocumentId },
      include: {
        shoppingLists: true,
        scanRequests: true,
        extractions: { select: { id: true } },
      },
    });
    if (!evidence || evidence.ownerUserId !== input.userId) {
      throw new Error("EVIDENCE_DOCUMENT_NOT_FOUND");
    }
    if (evidence.status === "annulled") {
      return { evidenceDocumentId: evidence.id, status: "annulled" };
    }
    if (
      evidence.shoppingLists.some((list: any) =>
        ["awarded", "partially_awarded", "closed"].includes(list.status),
      ) ||
      evidence.scanRequests.some((request: any) =>
        ["awarded", "closed"].includes(request.status),
      )
    ) {
      throw new Error("EVIDENCE_ALREADY_USED");
    }
    const now = new Date();
    const reason = String(input.reason || "ocr_incorrect_restart")
      .trim()
      .slice(0, 240);
    const proposalOffers = await tx.offer.findMany({
      where: {
        OR: [
          {
            shoppingListId: {
              in: evidence.shoppingLists.map((list: any) => list.id),
            },
          },
          {
            requestId: {
              in: evidence.scanRequests.map((request: any) => request.id),
            },
          },
        ],
      },
      select: { id: true },
    });
    await tx.offer.updateMany({
      where: {
        id: { in: proposalOffers.map((offer: any) => offer.id) },
      },
      data: { allwainStatus: "withdrawn" },
    });
    await tx.allwainProposalRevision.updateMany({
      where: {
        offerId: { in: proposalOffers.map((offer: any) => offer.id) },
        status: "current",
      },
      data: { status: "withdrawn" },
    });
    await tx.allwainShoppingList.updateMany({
      where: { sourceEvidenceDocumentId: evidence.id },
      data: {
        status: "canceled",
        visibility: "private",
        closedAt: now,
      },
    });
    await tx.allwainScanRequest.updateMany({
      where: { referenceDocumentId: evidence.id },
      data: { status: "canceled", visibility: "internal_test", closedAt: now },
    });
    await tx.allwainOcrExtraction.updateMany({
      where: { evidenceDocumentId: evidence.id },
      data: { status: "annulled" },
    });
    await tx.allwainOcrLineItem.updateMany({
      where: {
        extractionId: {
          in: evidence.extractions.map((extraction: any) => extraction.id),
        },
      },
      data: { reviewStatus: "discarded" },
    });
    await tx.allwainEvidenceDocument.update({
      where: { id: evidence.id },
      data: {
        status: "annulled",
        annulledAt: now,
        annulmentReason: reason,
      },
    });
    for (const list of evidence.shoppingLists) {
      await appendAllwainAuditEventTx(tx, {
        aggregateType: "shopping_list",
        aggregateId: list.id,
        eventType: "shopping_list.ocr_evidence_annulled",
        actorUserId: input.userId,
        actorRole: "buyer",
        source: "allwain_scan_capture",
        payload: {
          evidenceDocumentId: evidence.id,
          previousStatus: list.status,
          nextStatus: "canceled",
          reason,
        },
      });
    }
    return { evidenceDocumentId: evidence.id, status: "annulled" };
  });
}
