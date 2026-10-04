import { Request, Response, Router } from "express";
import { ENV } from "../config/env";
import { authRequired } from "../middleware/auth.middleware";
import { appendAllwainAuditEvent } from "../services/allwain-audit";
import {
  activateAllwainConnector,
  activateAllwainSeller,
  getAllwainConnectorNetwork,
  getAllwainConnectorLogistics,
  getAllwainConnectorLogisticsDelivery,
  getAllwainParticipationSnapshot,
  acceptAllwainConnectorLogistics,
  updateAllwainConnector,
  updateAllwainExperienceProfile,
  updateAllwainSeller,
} from "../services/allwain-participation.service";
import {
  getAllwainDeliveryCheckpointForUser,
  verifyAllwainDeliveryCheckpoint,
  type AllwainDeliveryCheckpointType,
} from "../services/allwain-delivery-checkpoints.service";
import { syncAllwainOrderTransfers } from "../services/allwain-payments.service";
import { notifyAllwainOrderParticipants } from "../services/allwain-notifications.service";

const router = Router();

function currentUser(req: Request) {
  return (req as any).user as
    | { id: string; email: string; role: string }
    | undefined;
}

async function auditParticipation(
  req: Request,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const user = currentUser(req);
  if (!user || ENV.STORAGE_DRIVER !== "postgres") return;
  await appendAllwainAuditEvent({
    aggregateType: "user_participation",
    aggregateId: user.id,
    eventType,
    actorUserId: user.id,
    actorRole: user.role,
    source: "allwain_api",
    requestId: (req as any).requestId || null,
    payload,
  });
}

function sendParticipationError(error: unknown, res: Response) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === "USER_NOT_FOUND") {
    res.status(404).json({ error: code });
    return;
  }
  if (code === "INVALID_NETWORK_CURSOR" || code === "INVALID_DISCOVERY_CURSOR" || code === "INVALID_LOGISTICS_SCOPE") {
    res.status(400).json({ error: code });
    return;
  }
  if (code === "CONNECTOR_NOT_ACTIVE" || code === "SELLER_NOT_ACTIVE") {
    res.status(403).json({ error: code });
    return;
  }
  if (code === "FORBIDDEN") {
    res.status(403).json({ error: code });
    return;
  }
  if (code === "CONNECTOR_PAYOUTS_NOT_READY") {
    res.status(409).json({ error: code });
    return;
  }
  if (code === "LOGISTICS_ASSIGNMENT_NOT_FOUND") {
    res.status(404).json({ error: code });
    return;
  }
  if (
    code === "LOGISTICS_ASSIGNMENT_UNAVAILABLE" ||
    code === "LOGISTICS_OUTSIDE_RADIUS" ||
    code === "ORDER_NOT_READY_FOR_PICKUP" ||
    code === "ORDER_NOT_IN_TRANSIT" ||
    code === "ORDER_NOT_PAID" ||
    code === "LOGISTICS_CONNECTOR_NOT_ASSIGNED" ||
    code === "LOGISTICS_CHECKPOINT_NOT_AVAILABLE" ||
    code === "LOGISTICS_CHECKPOINT_EXPIRED" ||
    code === "INVALID_LOGISTICS_CHECKPOINT_STATE" ||
    code === "LOGISTICS_NOT_LOCAL_CONNECTOR" ||
    code === "LOGISTICS_QR_REQUIRED"
  ) {
    res.status(409).json({ error: code });
    return;
  }
  if (
    code === "INVALID_SELLER_TYPE" ||
    code === "SELLER_DISPLAY_NAME_REQUIRED" ||
    code === "SELLER_UPDATE_REQUIRED" ||
     code === "INVALID_SELLER_LOCATION" ||
     code === "INVALID_SELLER_SHIPPING_COUNTRY" ||
     code === "INVALID_SELLER_SHIPPING_PHONE" ||
    code === "SELLER_LOCATION_REQUIRED" ||
    code === "INVALID_CONNECTOR_LOCATION" ||
    code === "INVALID_ONBOARDING_VERSION" ||
    code === "INVALID_PRIMARY_INTENT" ||
    code === "INVALID_GUIDANCE_SETTING" ||
    code === "INVALID_EXPERIENCE_CONTEXT" ||
    code === "EXPERIENCE_UPDATE_REQUIRED" ||
    code === "LOGISTICS_CHECKPOINT_PROOF_REQUIRED" ||
    code === "INVALID_LOGISTICS_CHECKPOINT"
  ) {
    res.status(400).json({ error: code });
    return;
  }
  console.error("ALLWAIN_PARTICIPATION_ERROR", error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainParticipationSnapshot(user.id));
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.patch("/experience", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const experience = await updateAllwainExperienceProfile(user.id, req.body || {});
    await auditParticipation(req, "experience.updated", {
      onboardingVersion: experience.onboardingVersion,
      primaryIntent: experience.primaryIntent,
      guidanceEnabled: experience.guidanceEnabled,
      lastContext: experience.lastContext,
    });
    res.json(experience);
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.post("/seller/activate", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await activateAllwainSeller(user.id, {
      sellerType: req.body?.sellerType,
      displayName: req.body?.displayName,
      locationLabel: req.body?.locationLabel,
      pickupAddress: req.body?.pickupAddress,
      shippingPostalCode: req.body?.shippingPostalCode,
      shippingCity: req.body?.shippingCity,
      shippingCountryCode: req.body?.shippingCountryCode,
      shippingPhone: req.body?.shippingPhone,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
    });
    await auditParticipation(req, "seller.activation_started", {
      sellerType: result.seller.sellerType || null,
      status: result.seller.status,
    });
    res.json(result);
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.patch("/seller", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await updateAllwainSeller(user.id, {
      sellerType: req.body?.sellerType,
      displayName: req.body?.displayName,
      locationLabel: req.body?.locationLabel,
      pickupAddress: req.body?.pickupAddress,
      shippingPostalCode: req.body?.shippingPostalCode,
      shippingCity: req.body?.shippingCity,
      shippingCountryCode: req.body?.shippingCountryCode,
      shippingPhone: req.body?.shippingPhone,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
    });
    await auditParticipation(req, "seller.profile_updated", {
      sellerType: result.seller.sellerType || null,
      displayName: result.seller.displayName || null,
      locationLabel: result.seller.locationLabel || null,
      locationReady: result.seller.locationReady,
    });
    res.json(result);
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.post("/connector/activate", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await activateAllwainConnector(user.id, {
      available: req.body?.available,
      radiusKm: req.body?.radiusKm,
      locationLabel: req.body?.locationLabel,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      clearCoordinates: req.body?.clearCoordinates === true,
    });
    await auditParticipation(req, "connector.activated", {
      available: result.connector.available,
      radiusKm: result.connector.radiusKm,
      locationLabel: result.connector.locationLabel || null,
    });
    res.json(result);
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.patch("/connector", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const result = await updateAllwainConnector(user.id, {
      available: req.body?.available,
      radiusKm: req.body?.radiusKm,
      locationLabel: req.body?.locationLabel,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      clearCoordinates: req.body?.clearCoordinates === true,
    });
    await auditParticipation(req, "connector.settings_updated", {
      available: result.connector.available,
      radiusKm: result.connector.radiusKm,
      locationLabel: result.connector.locationLabel || null,
    });
    res.json(result);
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.get("/connector/network", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainConnectorNetwork(user.id, {
      limit: Number(req.query.limit),
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
    }));
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.get("/connector/logistics", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getAllwainConnectorLogistics(user.id, { limit: Number(req.query.limit), cursor: typeof req.query.cursor === "string" ? req.query.cursor : null, scope: typeof req.query.scope === "string" ? req.query.scope as "all" | "mine" | "available" : "all" }));
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.get("/connector/logistics/:id", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getAllwainConnectorLogisticsDelivery(user.id, req.params.id));
  } catch (error) { sendParticipationError(error, res); }
});

router.get("/logistics/orders/:orderId/checkpoint", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const checkpointType = String(req.query.type || "") as AllwainDeliveryCheckpointType;
    if (checkpointType !== "seller_handoff" && checkpointType !== "buyer_delivery") {
      return void res.status(400).json({ error: "INVALID_LOGISTICS_CHECKPOINT" });
    }
    res.json(
      await getAllwainDeliveryCheckpointForUser(
        user.id,
        req.params.orderId,
        checkpointType,
      ),
    );
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.post("/connector/logistics/:id/accept", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const assignment = await acceptAllwainConnectorLogistics(user.id, req.params.id);
    await auditParticipation(req, "connector.logistics_accepted", {
      assignmentId: assignment.id,
      orderId: assignment.orderId,
      feeAmount: assignment.feeAmount,
      currency: assignment.currency,
    });
    await notifyAllwainOrderParticipants(assignment.orderId, {
      excludeUserId: user.id,
      targets: ["buyer", "seller"],
      type: "logistics.accepted",
      title: "Entrega local asignada",
      body: "Un conector de Allwain se encargará de esta entrega.",
      dedupeSuffix: assignment.id,
    });
    res.json({ ...assignment, mine: true });
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.post("/connector/logistics/:id/verify", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const assignment = await verifyAllwainDeliveryCheckpoint(
      user.id,
      req.params.id,
      req.body?.proof,
      {
        requestId: String((req as any).requestId || "") || null,
        ipAddress: req.ip || null,
        userAgent:
          typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null,
      },
    );
    const delivered = assignment.checkpointType === "buyer_delivery";
    if (delivered) {
      try {
        await syncAllwainOrderTransfers(assignment.orderId);
      } catch (error) {
        console.error("ALLWAIN_CONNECTOR_PAYOUT_PENDING", assignment.orderId, error);
      }
    }
    await auditParticipation(
      req,
      delivered
        ? "connector.logistics_delivery_verified"
        : "connector.logistics_pickup_verified",
      {
        assignmentId: assignment.id,
        orderId: assignment.orderId,
        status: assignment.status,
      },
    );
    await notifyAllwainOrderParticipants(assignment.orderId, {
      excludeUserId: user.id,
      targets: ["buyer", "seller"],
      type: delivered ? "logistics.delivery_verified" : "logistics.pickup_verified",
      title: delivered ? "Pedido entregado" : "Pedido recogido",
      body: delivered
        ? "La entrega local se ha verificado con el comprador."
        : "La recogida se ha verificado con el vendedor y el pedido va en camino.",
      dedupeSuffix: `${assignment.id}:${assignment.checkpointType}`,
    });
    res.json(assignment);
  } catch (error) {
    sendParticipationError(error, res);
  }
});

router.post("/connector/logistics/:id/:action", authRequired, async (req, res) => {
  try {
    const user = currentUser(req);
    if (!user) return void res.status(401).json({ error: "UNAUTHORIZED" });
    const action = req.params.action;
    if (action !== "pickup" && action !== "deliver") {
      return void res.status(400).json({ error: "INVALID_LOGISTICS_ACTION" });
    }
    res.status(409).json({
      error: "LOGISTICS_QR_REQUIRED",
      message:
        action === "pickup"
          ? "Escanea el QR del vendedor para confirmar la recogida."
          : "Escanea el QR del comprador para confirmar la entrega.",
    });
  } catch (error) {
    sendParticipationError(error, res);
  }
});

export default router;
