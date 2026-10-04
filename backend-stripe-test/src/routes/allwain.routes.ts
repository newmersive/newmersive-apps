import { Router, Request, Response } from "express";
import { allwainDiscoveryOptions, readDiscoveryQuery, isDiscoveryError } from "../services/allwain-discovery";
import fs from "node:fs";
import path from "node:path";
import {
  scanDemoProduct,
  analyzeAllwainScanPreview,
  createAllwainScanCapture,
  createAllwainScanRequest,
  listAllwainScanRequests,
  listAllwainScanRequestPage,
  getAllwainScanRequestForUser,
  getAllwainBuyerRequestPendingSummary,
  listAllwainRequestProposalPage,
  canReadAllwainRequestImage,
  updateAllwainScanRequest,
  confirmAllwainScanRequest,
  launchAllwainScanRequest,
  listAllwainMarketRequests,
  listAllwainMarketRequestPage,
  getAllwainMarketRequestForSeller,
  createAllwainOfferForRequest,
  listAllwainOffers,
  listAllwainOfferPage,
  createAllwainOffer,
  updateAllwainOfferInventory,
  updateAllwainOffer,
  withdrawAllwainProposal,
  registerAllwainOfferInterest,
  createAllwainAgreement,
  listAllwainContractPage,
  getAllwainContractForUser,
  getAllwainOfferForUser,
  acceptAllwainContract,
  rejectAllwainContract,
  exportAllwainContractPdf,
  listOrderGroups,
  createOrderGroup,
  joinOrderGroup,
  getSponsorSummary,
} from "../services/allwain.service";
import { annulAllwainOcrEvidence } from "../services/allwain-evidence.service";
import { authRequired } from "../middleware/auth.middleware";
import {
  allwainAiRateLimit,
  allwainOcrRateLimit,
} from "../middleware/operation-rate-limit.middleware";
import { AllwainScanSourceType, type AllwainScanRequest } from "../shared/types";
import { notifyAllwainUser } from "../services/allwain-notifications.service";
import { searchAllwain } from "../services/allwain-search.service";
import {
  reviewAllwainPublication,
  type AllwainPublicationDraft,
} from "../services/allwain-publication-quality.service";
import {
  allwainImageInputBytes,
  recordAllwainAiUsage,
  safeAllwainAiErrorCode,
} from "../services/allwain-ai-usage.service";
import { ENV } from "../config/env";
import { getAllwainPurchaseDetails } from "../services/allwain-purchase-details.service";

const router = Router();
router.get("/discovery-options", authRequired, (_req: Request, res: Response) => { res.json(allwainDiscoveryOptions); });

router.get("/purchase-details", authRequired, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getAllwainPurchaseDetails(userId));
  } catch (error) {
    console.error("Error in GET /allwain/purchase-details:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get(
  "/media/uploads/:filename",
  authRequired,
  async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    const userId = (req as any).user?.id as string | undefined;
    const filename = String(req.params.filename || "");
    const match = filename.match(/^([0-9a-f-]{36})\.(?:jpg|png)$/i);
    if (!userId || !match) return void res.status(404).json({ error: "IMAGE_NOT_FOUND" });

    try {
      if (!(await canReadAllwainRequestImage(userId, match[1]))) {
        return void res.status(404).json({ error: "IMAGE_NOT_FOUND" });
      }
      const uploadRoot = path.resolve(ENV.ALLWAIN_PUBLICATION_IMAGE_DIR);
      const filePath = path.resolve(uploadRoot, filename);
      if (!filePath.startsWith(`${uploadRoot}${path.sep}`) || !fs.existsSync(filePath)) {
        return void res.status(404).json({ error: "IMAGE_NOT_FOUND" });
      }
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return void res.sendFile(filePath);
    } catch (error) {
      console.error("Error in GET /allwain/media/uploads/:filename:", error);
      return void res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get("/search", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(
      await searchAllwain({
        userId,
        query: req.query.q,
        limit: pageLimit(req.query.limit, 8),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SEARCH_QUERY_TOO_SHORT") {
      return void res.status(400).json({ error: error.message });
    }
    console.error("Error in GET /allwain/search:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

const INVENTORY_INPUT_ERRORS = new Set([
  "MISSING_STOCK_QUANTITY",
  "INVALID_MIN_QUANTITY",
  "INVALID_MAX_QUANTITY",
  "INVALID_QUANTITY_STEP",
  "INVALID_ORDER_QUANTITY",
  "MINIMUM_ORDER_NOT_MET",
  "MAXIMUM_ORDER_EXCEEDED",
]);

function sendInventoryError(err: unknown, res: Response) {
  if (!(err instanceof Error)) return false;
  if (INVENTORY_INPUT_ERRORS.has(err.message)) {
    res.status(400).json({ error: err.message });
    return true;
  }
  if (
    err.message === "INSUFFICIENT_STOCK" ||
    err.message === "STOCK_BELOW_COMMITTED"
  ) {
    res.status(409).json({ error: err.message });
    return true;
  }
  return false;
}

function sendScanFlowError(err: unknown, res: Response) {
  if (!(err instanceof Error)) return false;
  if (err.message === "IMAGE_TOO_LARGE" || err.message === "SCAN_TEXT_TOO_LONG") {
    res.status(413).json({ error: err.message });
    return true;
  }
  if (
    [
      "INVALID_IMAGE_DATA_URL",
      "INVALID_IMAGE_CONTENT",
      "IMAGE_DIMENSIONS_BLOCKED",
      "INVALID_SCAN_SOURCE",
      "INVALID_BARCODE",
      "INVALID_REQUEST_CREATION_KEY",
    ].includes(err.message)
  ) {
    res.status(400).json({ error: err.message });
    return true;
  }
  if (err.message === "SCAN_REQUEST_NOT_FOUND") {
    res.status(404).json({ error: "SCAN_REQUEST_NOT_FOUND" });
    return true;
  }
  if (err.message === "INVALID_SCAN_STATUS") {
    res.status(400).json({ error: "INVALID_SCAN_STATUS" });
    return true;
  }
  if (err.message === "INVALID_SCAN_TRANSITION") {
    res.status(409).json({ error: "INVALID_SCAN_TRANSITION" });
    return true;
  }
  if (err.message === "SCAN_REQUEST_LOCKED") {
    res.status(409).json({ error: "SCAN_REQUEST_LOCKED" });
    return true;
  }
  if (
    [
      "DUPLICATE_EVIDENCE_DOCUMENT",
      "EVIDENCE_ALREADY_USED",
      "OCR_PRICE_LOCKED_RESTART_REQUIRED",
      "OCR_DOCUMENT_REVIEW_REQUIRED",
      "REQUEST_CREATION_CONFLICT",
    ].includes(err.message)
  ) {
    res.status(409).json({ error: err.message });
    return true;
  }
  if (err.message === "EVIDENCE_DOCUMENT_NOT_FOUND") {
    res.status(404).json({ error: err.message });
    return true;
  }
  if (
    ["OCR_DOCUMENT_ITEMS_MISSING", "INVALID_OCR_LINE_PRICE"].includes(
      err.message,
    )
  ) {
    res.status(422).json({ error: err.message });
    return true;
  }
  if (err.message === "PUBLICATION_BLOCKED") {
    res.status(422).json({
      error: "PUBLICATION_BLOCKED",
      review: (err as any).review || null,
    });
    return true;
  }
  if (err.message === "BUYER_PAYMENT_METHOD_REQUIRED") {
    res.status(409).json({ error: err.message });
    return true;
  }
  if (err.message === "INVALID_CURRENCY" || err.message === "INVALID_LOCATION") {
    res.status(400).json({ error: err.message });
    return true;
  }
  if (err.message.startsWith("INCOMPLETE_PRODUCT_SHEET:")) {
    res.status(422).json({
      error: "INCOMPLETE_PRODUCT_SHEET",
      fields: err.message.split(":")[1]?.split(",").filter(Boolean) || [],
    });
    return true;
  }
  return false;
}

router.post("/publications/review", authRequired, allwainAiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const entityType = String(req.body?.entityType || "") as AllwainPublicationDraft["entityType"];
    if (!["request", "catalog_offer", "proposal"].includes(entityType)) {
      return void res.status(400).json({ error: "INVALID_PUBLICATION_TYPE" });
    }
    const review = await reviewAllwainPublication(userId, {
      entityType,
      title: req.body?.title,
      description: req.body?.description,
      category: req.body?.category,
      productKind: req.body?.productKind,
      quantity: req.body?.quantity,
      unit: req.body?.unit,
      price: req.body?.price,
      currency: req.body?.currency,
      deliveryWindow: req.body?.deliveryWindow,
      locationLabel: req.body?.locationLabel,
      attributes: req.body?.attributes,
    });
    res.json(review);
  } catch (error) {
    console.error("Error in POST /allwain/publications/review:", error);
    res.status(500).json({ error: "PUBLICATION_REVIEW_FAILED" });
  }
});

function pageLimit(value: unknown, fallback = 30) {
  const parsed = Number(value);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? Math.trunc(parsed) : fallback));
}

function queryText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/* =========================
   GET /allwain/scan-demo
========================= */

router.get("/scan-demo", authRequired, async (req: Request, res: Response) => {
  try {
    const { ean } = req.query as { ean?: string };
    const result = await scanDemoProduct(ean);
    res.json(result);
  } catch (err) {
    console.error("Error in GET /allwain/scan-demo:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   POST /allwain/scan-analysis
========================= */

router.post(
  "/scan-analysis",
  authRequired,
  allwainOcrRateLimit,
  async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { sourceType, rawText, imageBase64, barcode, provider } =
        req.body as {
          sourceType?: AllwainScanSourceType;
          rawText?: string;
          imageBase64?: string;
          barcode?: string;
          provider?: "mock" | "google";
        };

      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      if (!rawText && !imageBase64 && !barcode) {
        res.status(400).json({ error: "MISSING_SCAN_INPUT" });
        return;
      }

      const analysis = await analyzeAllwainScanPreview({
        sourceType,
        rawText,
        imageBase64,
        barcode,
        provider,
      });
      await recordAllwainAiUsage({
        userId,
        operation: "preview",
        provider,
        sourceType: sourceType || (imageBase64 ? "camera" : barcode ? "barcode" : "text"),
        status: "succeeded",
        inputBytes: allwainImageInputBytes(imageBase64),
        category: analysis.extracted.category,
        productKind: analysis.extracted.productKind,
        confidence: analysis.confidence / 100,
        detectedFields: analysis.detectedFields.length,
        latencyMs: Date.now() - startedAt,
      });
      res.json(analysis);
    } catch (err) {
      await recordAllwainAiUsage({
        userId: (req as any).user?.id,
        operation: "preview",
        provider: req.body?.provider,
        sourceType: req.body?.sourceType,
        status: "failed",
        inputBytes: allwainImageInputBytes(req.body?.imageBase64),
        latencyMs: Date.now() - startedAt,
        errorCode: safeAllwainAiErrorCode(err),
      });
      if (sendScanFlowError(err, res)) return;
      console.error("Error in POST /allwain/scan-analysis:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   POST /allwain/scan-captures
========================= */

router.post(
  "/scan-captures",
  authRequired,
  allwainOcrRateLimit,
  async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { sourceType, rawText, imageBase64, barcode, provider } =
        req.body as {
          sourceType?: AllwainScanSourceType;
          rawText?: string;
          imageBase64?: string;
          barcode?: string;
          provider?: "mock" | "google";
        };
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      if (!rawText && !imageBase64 && !barcode) {
        return void res.status(400).json({ error: "MISSING_SCAN_INPUT" });
      }

      const capture = await createAllwainScanCapture(userId, {
        sourceType,
        rawText,
        imageBase64,
        barcode,
        provider,
      });
      const request = capture.kind === "request" ? capture.request : null;
      const analysis = capture.kind === "shopping_list" ? capture.analysis : null;
      await recordAllwainAiUsage({
        userId,
        operation:
          capture.kind === "shopping_list"
            ? "document_list_creation"
            : "request_creation",
        provider: request?.ai.provider || analysis?.provider,
        model: request?.ai.model,
        sourceType:
          request?.sourceType ||
          sourceType ||
          (imageBase64 ? "camera" : barcode ? "barcode" : "text"),
        requestRecordId:
          request?.id ||
          (capture.kind === "shopping_list" ? capture.shoppingList?.id : undefined),
        status: "succeeded",
        inputBytes: request?.imageMeta?.bytesApprox || allwainImageInputBytes(imageBase64),
        category: request?.extracted.category,
        productKind: request?.extracted.productKind,
        confidence: request?.ai.confidence || analysis?.confidence,
        detectedFields:
          capture.kind === "shopping_list"
            ? capture.analysis.document.items.length
            : Object.values(request?.extracted || {}).filter(
                (value) => value !== null && value !== undefined && value !== "",
              ).length,
        latencyMs: Date.now() - startedAt,
      });
      res.status(201).json(capture);
    } catch (err) {
      await recordAllwainAiUsage({
        userId: (req as any).user?.id,
        operation: "scan_capture",
        provider: req.body?.provider,
        sourceType: req.body?.sourceType,
        status: "failed",
        inputBytes: allwainImageInputBytes(req.body?.imageBase64),
        latencyMs: Date.now() - startedAt,
        errorCode: safeAllwainAiErrorCode(err),
      });
      if (sendScanFlowError(err, res)) return;
      console.error("Error in POST /allwain/scan-captures:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/scan-captures/:evidenceDocumentId/annul",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(
        await annulAllwainOcrEvidence({
          userId,
          evidenceDocumentId: req.params.evidenceDocumentId,
          reason: req.body?.reason,
        }),
      );
    } catch (err) {
      if (sendScanFlowError(err, res)) return;
      console.error("Error in POST /allwain/scan-captures/:id/annul:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   POST /allwain/scan-requests
========================= */

router.post(
  "/scan-requests",
  authRequired,
  allwainOcrRateLimit,
  async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { sourceType, rawText, imageBase64, barcode, provider, creationKey } =
        req.body as {
          sourceType?: AllwainScanSourceType;
          rawText?: string;
          imageBase64?: string;
          barcode?: string;
          provider?: "mock" | "google";
          creationKey?: string;
        };

      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      if (!rawText && !imageBase64 && !barcode) {
        res.status(400).json({ error: "MISSING_SCAN_INPUT" });
        return;
      }

      const request = await createAllwainScanRequest(userId, {
        sourceType,
        rawText,
        imageBase64,
        barcode,
        provider,
        creationKey,
      });

      if (!(request as AllwainScanRequest & { creationReplayed?: boolean }).creationReplayed) await recordAllwainAiUsage({
        userId,
        operation: "request_creation",
        provider: request.ai.provider,
        model: request.ai.model,
        sourceType: request.sourceType,
        requestRecordId: request.id,
        status: "succeeded",
        inputBytes: request.imageMeta?.bytesApprox,
        category: request.extracted.category,
        productKind: request.extracted.productKind,
        confidence: request.ai.confidence,
        detectedFields: Object.values(request.extracted).filter(
          (value) => value !== null && value !== undefined && value !== "",
        ).length,
        latencyMs: Date.now() - startedAt,
      });

      res.status(201).json(request);
    } catch (err) {
      await recordAllwainAiUsage({
        userId: (req as any).user?.id,
        operation: "request_creation",
        provider: req.body?.provider,
        sourceType: req.body?.sourceType,
        status: "failed",
        inputBytes: allwainImageInputBytes(req.body?.imageBase64),
        latencyMs: Date.now() - startedAt,
        errorCode: safeAllwainAiErrorCode(err),
      });
      if (sendScanFlowError(err, res)) return;
      console.error("Error in POST /allwain/scan-requests:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   GET /allwain/scan-requests
========================= */

router.get(
  "/scan-requests",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;

      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const statuses = queryText(req.query.status)
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      res.json(
        await listAllwainScanRequestPage(userId, {
          limit: pageLimit(req.query.limit),
          cursor: queryText(req.query.cursor),
          statuses,
          query: queryText(req.query.q),
          category: queryText(req.query.category),
          productKind: queryText(req.query.productKind),
          unit: queryText(req.query.unit),
          currency: queryText(req.query.currency),
          ...readDiscoveryQuery(req.query),
        }),
      );
    } catch (err) {
      if (isDiscoveryError(err)) return void res.status(400).json({ error: (err as Error).message });
      console.error("Error in GET /allwain/scan-requests:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get("/scan-requests/summary", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainBuyerRequestPendingSummary(userId, Math.min(10, pageLimit(req.query.limit, 3))));
  } catch (error) { console.error("Error in GET /allwain/scan-requests/summary:", error); res.status(500).json({ error: "INTERNAL_ERROR" }); }
});

router.get("/scan-requests/:id/proposals", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await listAllwainRequestProposalPage(userId, req.params.id, { limit: Math.min(20, pageLimit(req.query.limit, 20)), cursor: queryText(req.query.cursor), sort: queryText(req.query.sort) as any, view: queryText(req.query.view) as any }));
  } catch (error) {
    if (error instanceof Error && error.message === "SCAN_REQUEST_NOT_FOUND") return void res.status(404).json({ error: error.message });
    if (isDiscoveryError(error) || error instanceof Error && ["INVALID_PROPOSAL_SORT", "INVALID_PROPOSAL_VIEW"].includes(error.message)) return void res.status(400).json({ error: (error as Error).message });
    console.error("Error in GET /allwain/scan-requests/:id/proposals:", error); res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get(
  "/scan-requests/:id",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await getAllwainScanRequestForUser(userId, req.params.id, { includeProposals: req.query.includeProposals !== "false" }));
    } catch (err) {
      if (sendScanFlowError(err, res)) return;
      console.error("Error in GET /allwain/scan-requests/:id:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   PATCH /allwain/scan-requests/:id
========================= */

router.patch(
  "/scan-requests/:id",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;

      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const request = await updateAllwainScanRequest(userId, req.params.id, {
        status: req.body?.status,
        extracted: req.body?.extracted,
      });

      res.json(request);
    } catch (err) {
      if (sendScanFlowError(err, res)) return;
      console.error("Error in PATCH /allwain/scan-requests/:id:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/scan-requests/:id/confirm",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await confirmAllwainScanRequest(userId, req.params.id));
    } catch (err) {
      if (sendScanFlowError(err, res)) return;
      console.error("Error in POST /allwain/scan-requests/:id/confirm:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/scan-requests/:id/launch",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await launchAllwainScanRequest(userId, req.params.id));
    } catch (err) {
      if (sendScanFlowError(err, res)) return;
      console.error("Error in POST /allwain/scan-requests/:id/launch:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get(
  "/market/requests",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(
        await listAllwainMarketRequestPage(userId, {
          limit: pageLimit(req.query.limit),
          cursor: queryText(req.query.cursor),
          query: queryText(req.query.q),
          category: queryText(req.query.category),
          productKind: queryText(req.query.productKind),
          unit: queryText(req.query.unit),
          currency: queryText(req.query.currency),
          ...readDiscoveryQuery(req.query),
        }),
      );
    } catch (err) {
      if (err instanceof Error && err.message === "SELLER_ROLE_REQUIRED") {
        return void res.status(403).json({ error: "SELLER_ROLE_REQUIRED" });
      }
      if (isDiscoveryError(err)) return void res.status(400).json({ error: (err as Error).message });
      console.error("Error in GET /allwain/market/requests:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get(
  "/market/requests/:id",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await getAllwainMarketRequestForSeller(userId, req.params.id));
    } catch (err) {
      if (err instanceof Error && err.message === "SELLER_ROLE_REQUIRED") {
        return void res.status(403).json({ error: "SELLER_ROLE_REQUIRED" });
      }
      if (err instanceof Error && err.message === "MARKET_REQUEST_NOT_FOUND") {
        return void res.status(404).json({ error: "MARKET_REQUEST_NOT_FOUND" });
      }
      console.error("Error in GET /allwain/market/requests/:id:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/market/requests/:id/offers",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      const price = Number(req.body?.price);
      const availableQuantity =
        req.body?.availableQuantity === null ||
        req.body?.availableQuantity === undefined
          ? null
          : Number(req.body.availableQuantity);
      const offer = await createAllwainOfferForRequest(userId, req.params.id, {
        price,
        description: String(req.body?.description || ""),
        deliveryEstimate: String(req.body?.deliveryEstimate || ""),
        availableQuantity,
        publicationReviewId:
          typeof req.body?.publicationReviewId === "string"
            ? req.body.publicationReviewId
            : null,
        validForMinutes: req.body?.validForMinutes,
      });
      res.status(201).json(offer);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "SELLER_ROLE_REQUIRED") {
          return void res.status(403).json({ error: "SELLER_ROLE_REQUIRED" });
        }
        if (err.message === "MARKET_REQUEST_NOT_FOUND") {
          return void res
            .status(404)
            .json({ error: "MARKET_REQUEST_NOT_FOUND" });
        }
        if (err.message === "CANNOT_OFFER_OWN_REQUEST") {
          return void res
            .status(409)
            .json({ error: "CANNOT_OFFER_OWN_REQUEST" });
        }
        if (
          err.message === "OFFER_ALREADY_EXISTS" ||
          err.message === "PROPOSAL_NOT_IMPROVED" ||
          err.message === "PROPOSAL_NOT_EDITABLE"
        ) {
          return void res.status(409).json({ error: err.message });
        }
        if (
          err.message === "INVALID_OFFER_PRICE" ||
          err.message === "MISSING_OFFER_FIELDS" ||
          err.message === "OFFER_ABOVE_REFERENCE_PRICE" ||
          err.message === "INVALID_PROPOSAL_DURATION" ||
          err.message === "INVALID_PROPOSAL_VALID_UNTIL" ||
          err.message === "PROPOSAL_WINDOW_TOO_SHORT"
        ) {
          return void res.status(400).json({ error: err.message });
        }
        if (sendScanFlowError(err, res)) return;
      }
      console.error("Error in POST /allwain/market/requests/:id/offers:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   GET /allwain/offers
========================= */

router.get("/offers", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const limit = pageLimit(req.query.limit);
    const numberParam = (value: unknown) => {
      if (typeof value !== "string" || value.trim() === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const page = await listAllwainOfferPage(userId, {
      limit,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
      query: typeof req.query.q === "string" ? req.query.q.trim() : null,
      category:
        typeof req.query.category === "string" ? req.query.category.trim() : null,
      subcategory:
        typeof req.query.subcategory === "string"
          ? req.query.subcategory.trim()
          : null,
      productKind:
        typeof req.query.productKind === "string"
          ? req.query.productKind.trim()
          : null,
      currency:
        typeof req.query.currency === "string" ? req.query.currency.trim() : null,
      unit: typeof req.query.unit === "string" ? req.query.unit.trim() : null,
      status:
        typeof req.query.status === "string" ? req.query.status.trim() : null,
      ownerUserId: req.query.scope === "mine" ? userId : null,
      type: req.query.type === "proposal" || req.query.type === "all" ? req.query.type : "catalog",
      view: req.query.view === "history" ? "history" : req.query.view === "active" ? "active" : undefined,
      excludeOwnerUserId: req.query.scope === "market" ? userId : null,
      minPrice: numberParam(req.query.minPrice),
      maxPrice: numberParam(req.query.maxPrice),
      sort:
        req.query.sort === "price_asc" || req.query.sort === "price_desc"
          ? req.query.sort
          : "newest",
      ...readDiscoveryQuery(req.query),
    });
    res.json(page);
  } catch (err) {
    if (isDiscoveryError(err)) return void res.status(400).json({ error: (err as Error).message });
    console.error("Error in GET /allwain/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/offers/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainOfferForUser(userId, req.params.id));
  } catch (err) {
    if (err instanceof Error && err.message === "OFFER_NOT_FOUND") {
      return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
    }
    console.error("Error in GET /allwain/offers/:id:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* =========================
   POST /allwain/offers
========================= */

router.post("/offers", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const actorRole = String((req as any).user?.role || "").toLowerCase();
    const {
      title,
      description,
      price,
      productId,
      meta,
      productCompliance,
      publicationReviewId,
    } =
      req.body as {
        title?: string;
        description?: string;
        price?: number;
        productId?: string;
        meta?: Record<string, unknown>;
        productCompliance?: Record<string, unknown>;
        publicationReviewId?: string;
      };

    if (!userId || !title || !description || typeof price !== "number") {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    const {
      requestId: _ignoredRequestId,
      featured: requestedFeatured,
      source: _ignoredSource,
      ...publicMeta
    } = meta || {};
    const offer = await createAllwainOffer(
      userId,
      title,
      description,
      price,
      productId,
      {
        ...publicMeta,
        featured: actorRole === "admin" && requestedFeatured === true,
        source: "allwain-published-offer",
      },
      productCompliance,
      publicationReviewId,
    );

    res.status(201).json(offer);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "SELLER_ROLE_REQUIRED") {
        return void res.status(403).json({ error: "SELLER_ROLE_REQUIRED" });
      }
      if (
        [
          "INVALID_OFFER_PRICE",
          "MISSING_OFFER_FIELDS",
          "INVALID_PRODUCT_KIND",
          "INVALID_NOMINAL_QUANTITY",
          "INCOMPLETE_PRODUCT_COMPLIANCE",
          "PREORDER_CHARGE_DEADLINE_REQUIRED",
          "INVALID_PREORDER_CHARGE_DEADLINE",
          "PREORDER_CHARGE_DEADLINE_TOO_FAR",
        ].includes(err.message)
      ) {
        return void res.status(400).json({ error: err.message });
      }
    }
    if (sendScanFlowError(err, res)) return;
    if (sendInventoryError(err, res)) return;
    console.error("Error in POST /allwain/offers:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.patch("/offers/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const price =
      req.body?.price === undefined ? undefined : Number(req.body.price);
    res.json(
      await updateAllwainOffer(userId, req.params.id, {
        title:
          req.body?.title === undefined ? undefined : String(req.body.title),
        description:
          req.body?.description === undefined
            ? undefined
            : String(req.body.description),
        price,
        status: req.body?.status,
        expectedUpdatedAt: req.body?.expectedUpdatedAt,
        unit: req.body?.unit,
        category: req.body?.category,
        subcategory: req.body?.subcategory,
        productKind: req.body?.productKind,
        locationLabel: req.body?.locationLabel,
        deliveryEstimate: req.body?.deliveryEstimate,
        shippingWeightKgPerUnit: req.body?.shippingWeightKgPerUnit,
        saleMode: req.body?.saleMode,
        preorderChargeDeadlineAt: req.body?.preorderChargeDeadlineAt,
      }),
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "OFFER_NOT_FOUND") {
        return void res.status(404).json({ error: err.message });
      }
      if (err.message === "SELLER_ROLE_REQUIRED") {
        return void res.status(403).json({ error: err.message });
      }
      if (
        [
          "MISSING_OFFER_FIELDS",
          "INVALID_OFFER_PRICE",
          "INVALID_OFFER_FIELD", "INVALID_OFFER_VERSION", "PREORDER_CHARGE_DEADLINE_REQUIRED", "INVALID_PREORDER_CHARGE_DEADLINE", "PREORDER_CHARGE_DEADLINE_PASSED", "PREORDER_CHARGE_DEADLINE_TOO_FAR",
        ].includes(err.message)
      ) {
        return void res.status(400).json({ error: err.message });
      }
      if (
        [
          "OFFER_EDIT_NOT_ALLOWED",
          "INVALID_OFFER_TRANSITION",
          "INSUFFICIENT_STOCK",
          "OFFER_VERSION_CONFLICT", "OFFER_TERMS_LOCKED", "PRODUCT_IDENTITY_CHANGE_REQUIRES_NEW_OFFER",
        ].includes(err.message)
      ) {
        return void res.status(409).json({ error: err.message });
      }
    }
    console.error("Error in PATCH /allwain/offers/:id:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/offers/:id/withdraw", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await withdrawAllwainProposal(userId, req.params.id, { expectedUpdatedAt: req.body?.expectedUpdatedAt }));
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "OFFER_NOT_FOUND") return void res.status(404).json({ error: err.message });
      if (err.message === "SELLER_ROLE_REQUIRED") return void res.status(403).json({ error: err.message });
      if (["INVALID_OFFER_VERSION", "PROPOSAL_REQUIRED"].includes(err.message)) return void res.status(400).json({ error: err.message });
      if (["PROPOSAL_LOCKED", "PROPOSAL_NOT_EDITABLE", "OFFER_VERSION_CONFLICT", "OFFER_NOT_AVAILABLE"].includes(err.message)) return void res.status(409).json({ error: err.message });
    }
    console.error("Error in POST /allwain/offers/:id/withdraw:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post(
  "/offers/:id/inventory",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      const offer = await updateAllwainOfferInventory(userId, req.params.id, {
        stockQuantity: Number(req.body?.stockQuantity),
        minQuantity: Number(req.body?.minQuantity),
        quantityStep: Number(req.body?.quantityStep),
      });
      res.json(offer);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "SELLER_ROLE_REQUIRED") {
          return void res.status(403).json({ error: "SELLER_ROLE_REQUIRED" });
        }
        if (err.message === "OFFER_NOT_FOUND") {
          return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
        }
        if (err.message === "INVENTORY_NOT_EDITABLE") {
          return void res.status(409).json({ error: "INVENTORY_NOT_EDITABLE" });
        }
      }
      if (sendInventoryError(err, res)) return;
      console.error("Error in POST /allwain/offers/:id/inventory:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/offers/:id/interest",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });

      const lead = await registerAllwainOfferInterest(userId, req.params.id, {
        source: req.body?.source,
        note: req.body?.note,
      });
      res.status(201).json(lead);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "OFFER_NOT_FOUND") {
          return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
        }
        if (err.message === "CANNOT_ACCEPT_OWN_OFFER") {
          return void res
            .status(409)
            .json({ error: "CANNOT_ACCEPT_OWN_OFFER" });
        }
        if (err.message === "DEMO_OFFER_READ_ONLY") {
          return void res.status(409).json({ error: "DEMO_OFFER_READ_ONLY" });
        }
      }
      console.error("Error in POST /allwain/offers/:id/interest:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/offers/:id/accept",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });

      const quantity =
        req.body?.quantity === undefined || req.body?.quantity === null
          ? undefined
          : Number(req.body.quantity);
      const contract = await createAllwainAgreement(
        userId,
        req.params.id,
        quantity,
        {
          buyerCapacity: req.body?.buyerCapacity,
          deliveryMethod: req.body?.deliveryMethod,
          deliveryChannel: req.body?.deliveryChannel,
          deliveryAddress: req.body?.deliveryAddress,
          deliveryPostalCode: req.body?.deliveryPostalCode,
          deliveryCity: req.body?.deliveryCity,
          deliveryCountryCode: req.body?.deliveryCountryCode,
          deliveryPhone: req.body?.deliveryPhone,
          deliveryRecipientName: req.body?.deliveryRecipientName,
          deliveryEmail: req.body?.deliveryEmail,
          deliveryUnit: req.body?.deliveryUnit,
          deliveryDetailsConfirmed: req.body?.deliveryDetailsConfirmed,
          saveDeliveryDetails: req.body?.saveDeliveryDetails,
          carrierQuoteId: req.body?.carrierQuoteId,
          deliveryNotes: req.body?.deliveryNotes,
          deliveryWindow: req.body?.deliveryWindow,
          recurringOrder: req.body?.recurringOrder,
          deliveryLatitude: req.body?.deliveryLatitude,
          deliveryLongitude: req.body?.deliveryLongitude,
          purchaseKey: req.body?.purchaseKey,
        },
      );
      if (contract.providerUserId) {
        const isShoppingList = Boolean(contract.shoppingListId);
        await notifyAllwainUser({
          userId: contract.providerUserId,
          type: "order.created",
          title: "Tienes un pedido nuevo",
          body: isShoppingList
            ? `${contract.requesterName || "Un comprador"} ha elegido tu propuesta para su lista de compra.`
            : `${contract.requesterName || "Un comprador"} quiere ${contract.quantity || "una cantidad"} ${contract.unit || "unidades"}.`,
          route: "contract",
          routeParams: {
            contractId: contract.id,
            shoppingListId: contract.shoppingListId,
            mode: "sell",
          },
          dedupeKey: `order.created:${contract.id}:${contract.providerUserId}`,
        });
      }
      if (contract.requesterUserId) {
        const isShoppingList = Boolean(contract.shoppingListId);
        await notifyAllwainUser({
          userId: contract.requesterUserId,
          type: "reservation.created",
          title:
            contract.paymentMode === "preorder"
              ? "Reserva preparada para pagar"
              : "Pedido preparado para pagar",
          body: isShoppingList
            ? `Has elegido la propuesta para ${contract.offerTitle || "tu lista"}. Continúa con el pago para confirmarla.`
            : `Has elegido ${contract.quantity || "la cantidad indicada"} ${contract.unit || "unidades"} de ${contract.offerTitle || "este producto"}. Continúa con el pago para confirmarlo.`,
          route: "contract",
          routeParams: {
            contractId: contract.id,
            shoppingListId: contract.shoppingListId,
            mode: "buy",
          },
          dedupeKey: `reservation.created:${contract.id}:${contract.requesterUserId}`,
        });
      }
      res.status(201).json(contract);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "OFFER_NOT_FOUND") {
          return void res.status(404).json({ error: "OFFER_NOT_FOUND" });
        }
        if (err.message === "CANNOT_ACCEPT_OWN_OFFER") {
          return void res
            .status(409)
            .json({ error: "CANNOT_ACCEPT_OWN_OFFER" });
        }
        if (
          [
            "INVALID_DELIVERY_METHOD",
            "DELIVERY_DETAILS_CONFIRMATION_REQUIRED",
            "INVALID_SAVE_DELIVERY_DETAILS",
            "INVALID_DELIVERY_RECIPIENT_NAME",
            "DELIVERY_RECIPIENT_NAME_REQUIRED",
            "INVALID_DELIVERY_EMAIL",
            "INVALID_DELIVERY_PHONE",
            "INVALID_DELIVERY_UNIT",
            "DELIVERY_CITY_REQUIRED",
            "INVALID_DELIVERY_CITY",
            "DELIVERY_POSTAL_CODE_REQUIRED",
            "INVALID_DELIVERY_POSTAL_CODE",
            "INVALID_DELIVERY_COUNTRY",
            "DELIVERY_ADDRESS_REQUIRED",
            "DELIVERY_ADDRESS_TOO_LONG",
            "DELIVERY_NOTES_TOO_LONG",
            "INVALID_DELIVERY_LOCATION",
            "INVALID_BUYER_CAPACITY",
            "INVALID_PURCHASE_KEY",
            "PREORDER_CHARGE_DEADLINE_REQUIRED",
            "INVALID_PREORDER_CHARGE_DEADLINE",
            "PREORDER_CHARGE_DEADLINE_TOO_FAR",
            "CARRIER_RATE_REQUIRED",
            "CARRIER_POSTAL_CODE_REQUIRED",
            "CARRIER_CITY_REQUIRED",
            "INVALID_CARRIER_COUNTRY",
            "INVALID_CARRIER_PHONE",
            "CARRIER_WEIGHT_REQUIRED",
            "SELLER_CARRIER_ADDRESS_REQUIRED",
            "SENDCLOUD_INTERNATIONAL_NOT_READY",
          ].includes(err.message)
        ) {
          return void res.status(400).json({ error: err.message });
        }
        if (
          err.message === "MARKET_REQUEST_NOT_OPEN" ||
          err.message === "SHOPPING_LIST_NOT_OPEN" ||
          err.message === "SHOPPING_LIST_ITEMS_ALREADY_AWARDED" ||
          err.message === "SHOPPING_LIST_PROPOSAL_ITEMS_MISSING" ||
          err.message === "SHOPPING_LIST_ORDER_NOT_CREATED" ||
          err.message === "OFFER_NOT_AVAILABLE" ||
          err.message === "OFFER_VERSION_CONFLICT" ||
          err.message === "DEMO_OFFER_READ_ONLY" ||
          err.message === "PREORDER_CHARGE_DEADLINE_PASSED" ||
          err.message === "IDEMPOTENCY_KEY_REUSED"
          || err.message === "CARRIER_QUOTE_NOT_FOUND"
          || err.message === "CARRIER_QUOTE_ALREADY_USED"
          || err.message === "CARRIER_QUOTE_EXPIRED"
          || err.message === "CARRIER_QUOTE_MISMATCH"
          || err.message === "CARRIER_RECURRING_REQUOTE_REQUIRED"
          || err.message === "PROPOSAL_EXPIRED"
        ) {
          return void res.status(409).json({ error: err.message });
        }
      }
      if (sendInventoryError(err, res)) return;
      console.error("Error in POST /allwain/offers/:id/accept:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.get("/contracts", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const scope =
      req.query.scope === "buyer" || req.query.scope === "seller"
        ? req.query.scope
        : null;
    const statuses = queryText(req.query.status)
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    res.json(
      await listAllwainContractPage(userId, {
        limit: pageLimit(req.query.limit),
        cursor: queryText(req.query.cursor),
        query: queryText(req.query.q),
        scope,
        statuses,
        offerId: queryText(req.query.offerId),
        paymentStatuses: queryText(req.query.paymentStatus)?.split(",").map((value) => value.trim()).filter(Boolean),
        contractStatuses: queryText(req.query.contractStatus)?.split(",").map((value) => value.trim()).filter(Boolean),
        fulfillmentStatuses: queryText(req.query.fulfillmentStatus)?.split(",").map((value) => value.trim()).filter(Boolean),
        ...readDiscoveryQuery(req.query),
      }),
    );
  } catch (err) {
    if (isDiscoveryError(err)) return void res.status(400).json({ error: (err as Error).message });
    console.error("Error in GET /allwain/contracts:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/contracts/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainContractForUser(userId, req.params.id));
  } catch (err) {
    if (err instanceof Error && err.message === "CONTRACT_NOT_FOUND") {
      return void res.status(404).json({ error: "CONTRACT_NOT_FOUND" });
    }
    console.error("Error in GET /allwain/contracts/:id:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get(
  "/contracts/:id/pdf",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      const pdf = await exportAllwainContractPdf(userId, req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${pdf.filename}"`,
      );
      res.send(pdf.buffer);
    } catch (err) {
      if (err instanceof Error && err.message === "CONTRACT_NOT_FOUND") {
        return void res.status(404).json({ error: "CONTRACT_NOT_FOUND" });
      }
      console.error("Error in GET /allwain/contracts/:id/pdf:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/contracts/:id/accept",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      const contract = await acceptAllwainContract(userId, req.params.id);
      const otherUserId =
        contract.requesterUserId === userId
          ? contract.providerUserId
          : contract.requesterUserId;
      if (otherUserId) {
        const recipientIsBuyer = otherUserId === contract.requesterUserId;
        await notifyAllwainUser({
          userId: otherUserId,
          type: `agreement.${contract.status}`,
          title:
            contract.status === "accepted"
              ? recipientIsBuyer
                ? "El vendedor ha aceptado tu pedido"
                : "El comprador ha confirmado el pedido"
              : "Acuerdo actualizado",
          body:
            contract.status === "accepted"
              ? "Las dos partes han aceptado. Ya puedes continuar con el pago o la preparación."
              : "La otra parte ha aceptado el acuerdo. Falta tu confirmación.",
          route: "contract",
          routeParams: {
            contractId: contract.id,
            mode: otherUserId === contract.providerUserId ? "sell" : "buy",
          },
          dedupeKey: `agreement.${contract.status}:${contract.id}:${otherUserId}`,
        });
      }
      res.json(contract);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "CONTRACT_NOT_FOUND") {
          return void res.status(404).json({ error: "CONTRACT_NOT_FOUND" });
        }
        if (err.message === "INVALID_CONTRACT_STATUS") {
          return void res
            .status(409)
            .json({ error: "INVALID_CONTRACT_STATUS" });
        }
      }
      console.error("Error in POST /allwain/contracts/:id/accept:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/contracts/:id/reject",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return void res.status(401).json({ error: "UNAUTHORIZED" });
      const contract = await rejectAllwainContract(userId, req.params.id);
      if (!contract) throw new Error("CONTRACT_NOT_FOUND");
      const otherUserId =
        contract.requesterUserId === userId
          ? contract.providerUserId
          : contract.requesterUserId;
      if (otherUserId) {
        await notifyAllwainUser({
          userId: otherUserId,
          type: "agreement.rejected",
          title: "Pedido no aceptado",
          body: "La otra parte no ha continuado con este pedido. El stock reservado queda liberado.",
          route: "contract",
          routeParams: {
            contractId: contract.id,
            mode: otherUserId === contract.providerUserId ? "sell" : "buy",
          },
          dedupeKey: `agreement.rejected:${contract.id}:${otherUserId}`,
        });
      }
      res.json(contract);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "CONTRACT_NOT_FOUND") {
          return void res.status(404).json({ error: "CONTRACT_NOT_FOUND" });
        }
        if (err.message === "INVALID_CONTRACT_STATUS") {
          return void res
            .status(409)
            .json({ error: "INVALID_CONTRACT_STATUS" });
        }
      }
      console.error("Error in POST /allwain/contracts/:id/reject:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   GET /allwain/order-groups
========================= */

router.get(
  "/order-groups",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const groups = await listOrderGroups();
      res.json({ items: groups });
    } catch (err) {
      console.error("Error in GET /allwain/order-groups:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   POST /allwain/order-groups
========================= */

router.post(
  "/order-groups",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const { productId, minUnitsPerClient } = req.body as {
        productId?: string;
        minUnitsPerClient?: number;
      };

      if (!productId || typeof minUnitsPerClient !== "number") {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const group = await createOrderGroup(productId, minUnitsPerClient);
      res.status(201).json(group);
    } catch (err) {
      console.error("Error in POST /allwain/order-groups:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   POST /allwain/order-groups/:id/join
========================= */

router.post(
  "/order-groups/:id/join",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { units } = req.body as { units?: number };
      const groupId = req.params.id;

      if (!userId || typeof units !== "number") {
        res.status(400).json({ error: "MISSING_FIELDS" });
        return;
      }

      const group = await joinOrderGroup(groupId, userId, units);
      res.json(group);
    } catch (err: any) {
      if (err instanceof Error && err.message === "GROUP_NOT_FOUND") {
        res.status(404).json({ error: "GROUP_NOT_FOUND" });
        return;
      }

      console.error("Error in join order group:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

/* =========================
   POST /allwain/savings
========================= */

router.post("/savings", authRequired, (_req: Request, res: Response) => {
  res.status(410).json({ error: "LEGACY_SAVINGS_DISABLED" });
});

/* =========================
   GET /allwain/sponsors/summary
========================= */

router.get(
  "/sponsors/summary",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      const summary = await getSponsorSummary(userId);
      res.json(summary);
    } catch (err) {
      console.error("Error in GET /allwain/sponsors/summary:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

export default router;
