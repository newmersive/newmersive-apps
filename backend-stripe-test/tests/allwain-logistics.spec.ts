import assert from "node:assert";
import { describe, it } from "node:test";

import {
  allwainConnectorAssignmentMatch,
  calculateApproximateDistanceKm,
  updateAllwainConnectorLogistics,
} from "../src/services/allwain-participation.service";
import { normalizeAllwainDeliveryCheckpointProof } from "../src/services/allwain-delivery-checkpoints.service";

describe("Allwain local logistics matching", () => {
  const connector = {
    locationLabel: "Foios",
    locationLatApprox: 39.533,
    locationLngApprox: -0.357,
    radiusKm: 10,
  };

  it("matches a delivery only when both endpoints fit the connector radius", () => {
    const nearby = allwainConnectorAssignmentMatch(
      {
        pickupLatApprox: 39.533,
        pickupLngApprox: -0.357,
        deliveryLatApprox: 39.57,
        deliveryLngApprox: -0.333,
      },
      connector,
    );
    assert.equal(nearby.compatible, true);

    const distant = allwainConnectorAssignmentMatch(
      {
        pickupLatApprox: 39.533,
        pickupLngApprox: -0.357,
        deliveryLatApprox: 39.47,
        deliveryLngApprox: -0.376,
      },
      { ...connector, radiusKm: 5 },
    );
    assert.equal(distant.compatible, false);
  });

  it("falls back to municipality matching without exposing exact coordinates", () => {
    const match = allwainConnectorAssignmentMatch(
      { pickupZone: "Foios", deliveryZone: "46134 Foios" },
      { locationLabel: "Foios", radiusKm: 5 },
    );
    assert.equal(match.compatible, true);
  });

  it("calculates a stable approximate route distance", () => {
    const distance = calculateApproximateDistanceKm(
      { latitude: 39.533, longitude: -0.357 },
      { latitude: 39.57, longitude: -0.333 },
    );
    assert.ok(distance > 4 && distance < 5);
  });

  it("normalizes QR payloads and human fallback codes", () => {
    assert.equal(
      normalizeAllwainDeliveryCheckpointProof("allwain-checkpoint:awcp1.payload.signature"),
      "awcp1.payload.signature",
    );
    assert.equal(normalizeAllwainDeliveryCheckpointProof("12 34-56 78"), "12345678");
  });

  it("does not allow the legacy manual delivery transition", async () => {
    await assert.rejects(
      updateAllwainConnectorLogistics("connector", "assignment", "pickup"),
      /LOGISTICS_QR_REQUIRED/,
    );
  });
});
