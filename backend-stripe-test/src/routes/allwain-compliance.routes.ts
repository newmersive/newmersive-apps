import { Response, Router } from "express";
import { AuthRequest, adminOnly, authRequired } from "../middleware/auth.middleware";
import {
  allocateAllwainOrderLot,
  createAllwainIncident,
  createAllwainProductLot,
  createAllwainTaxRule,
  exportAllwainDocumentPdf,
  getAllwainComplianceProfile,
  getAllwainOrderCompliance,
  listAllwainAdminIncidents,
  listAllwainOrderDocuments,
  listAllwainTaxRules,
  recallAllwainProductLot,
  reviewAllwainTaxDetermination,
  saveAllwainFiscalProfile,
  saveAllwainProductCompliance,
  signAllwainFiscalDocument,
  updateAllwainIncident,
} from "../services/allwain-compliance.service";
import { appendAllwainAuditEvent } from "../services/allwain-audit";

const router = Router();

function userIdFrom(req: AuthRequest) {
  const userId = req.user?.id;
  if (!userId) throw new Error("UNAUTHORIZED");
  return userId;
}

function requestIdFrom(req: AuthRequest) {
  return String((req as any).requestId || "") || undefined;
}

function signatureContext(req: AuthRequest) {
  return {
    requestId: requestIdFrom(req),
    clientAddress: req.ip || req.socket.remoteAddress || null,
    userAgent:
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : null,
  };
}

function sendComplianceError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "UNAUTHORIZED") return void res.status(401).json({ error: code });
  if (code === "FORBIDDEN") return void res.status(403).json({ error: code });
  if (["USER_NOT_FOUND", "ORDER_NOT_FOUND", "OFFER_NOT_FOUND", "LOT_NOT_FOUND", "DOCUMENT_NOT_FOUND", "INCIDENT_NOT_FOUND"].includes(code)) {
    return void res.status(404).json({ error: code });
  }
  if (
    [
      "TAX_RULE_REQUIRES_ADVISOR_APPROVAL",
      "TAX_REVIEW_LOCKED",
      "DOCUMENT_SIGNATURE_NOT_REQUIRED",
    ].includes(code)
  ) {
    return void res.status(409).json({ error: code });
  }
  if (
    code.startsWith("INVALID_") ||
    code.endsWith("_REQUIRED") ||
    code === "INCOMPLETE_FISCAL_PROFILE"
  ) {
    return void res.status(400).json({ error: code });
  }
  console.error("ALLWAIN_COMPLIANCE_ERROR", error);
  return void res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/profile", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAllwainComplianceProfile(userIdFrom(req)));
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.patch("/fiscal-profile", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await saveAllwainFiscalProfile(
        userIdFrom(req),
        req.body || {},
        requestIdFrom(req),
        signatureContext(req),
      ),
    );
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.patch("/offers/:id/product", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await saveAllwainProductCompliance(
        userIdFrom(req),
        req.params.id,
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.get("/orders/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAllwainOrderCompliance(userIdFrom(req), req.params.id));
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.get("/orders/:id/documents", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json({ items: await listAllwainOrderDocuments(userIdFrom(req), req.params.id) });
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.get("/documents/:id/pdf", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = userIdFrom(req);
    const pdf = await exportAllwainDocumentPdf(actorUserId, req.params.id);
    await appendAllwainAuditEvent({
      aggregateId: pdf.orderId,
      eventType: "privacy.fiscal_document_exported",
      actorUserId,
      source: "allwain_document_access",
      requestId: requestIdFrom(req),
      payload: { documentId: req.params.id, format: "pdf" },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
    res.send(pdf.buffer);
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.post(
  "/documents/:id/sign",
  authRequired,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await signAllwainFiscalDocument(
          userIdFrom(req),
          req.params.id,
          req.body || {},
          signatureContext(req),
        ),
      );
    } catch (error) {
      sendComplianceError(error, res);
    }
  },
);

router.post("/lots", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(
      await createAllwainProductLot(userIdFrom(req), req.body || {}, requestIdFrom(req)),
    );
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.post("/orders/:id/lots", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await allocateAllwainOrderLot(
        userIdFrom(req),
        req.params.id,
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.post("/lots/:id/recall", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const result = await recallAllwainProductLot(
      userIdFrom(req),
      req.params.id,
      req.body || {},
      requestIdFrom(req),
    );
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.post("/orders/:id/incidents", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(
      await createAllwainIncident(
        userIdFrom(req),
        req.params.id,
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.get("/admin/incidents", authRequired, adminOnly, async (req, res) => {
  try {
    const actorUserId = userIdFrom(req as AuthRequest);
    const result = await listAllwainAdminIncidents({
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        limit: Number(req.query.limit),
        cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
      });
    await appendAllwainAuditEvent({
      aggregateType: "admin_access",
      aggregateId: actorUserId,
      eventType: "privacy.admin_incidents_accessed",
      actorUserId,
      actorRole: "admin",
      source: "allwain_admin",
      requestId: requestIdFrom(req as AuthRequest),
      payload: {
        resource: "allwain_incidents",
        statusFilter:
          typeof req.query.status === "string" ? req.query.status : null,
      },
    });
    res.json(result);
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.patch(
  "/admin/incidents/:id",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await updateAllwainIncident(
          userIdFrom(req),
          req.params.id,
          req.body || {},
          requestIdFrom(req),
        ),
      );
    } catch (error) {
      sendComplianceError(error, res);
    }
  },
);

router.get("/admin/tax-rules", authRequired, adminOnly, async (_req, res) => {
  try {
    res.json({ items: await listAllwainTaxRules() });
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.post("/admin/tax-rules", authRequired, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(
      await createAllwainTaxRule(
        userIdFrom(req),
        req.body || {},
        requestIdFrom(req),
      ),
    );
  } catch (error) {
    sendComplianceError(error, res);
  }
});

router.post(
  "/admin/orders/:id/tax-review",
  authRequired,
  adminOnly,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json(
        await reviewAllwainTaxDetermination(
          userIdFrom(req),
          req.params.id,
          req.body || {},
          requestIdFrom(req),
        ),
      );
    } catch (error) {
      sendComplianceError(error, res);
    }
  },
);

export default router;
