import assert from "node:assert";
import { after, before, describe, it } from "node:test";

import { app } from "../src/server";
import { TestClient } from "./helpers/test-client";
import {
  isAllwainSellerPaymentStateReady,
  isAllwainSellerProfileActivatedStatus,
  isAllwainSellerWorkspaceStatusEnabled,
  resolveAllwainSellerWorkspaceStatus,
} from "../src/services/allwain-participation.service";

const client = new TestClient(app);

describe("Allwain participation profiles", () => {
  let headers: Record<string, string>;
  let newmersiveId = "";
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  before(async () => {
    await client.start();
    const registration = await client.post("/auth/register", {
      name: "Conector Principal",
      email: `allwain-participation+${suffix}@test.local`,
      password: "Participation123!",
      role: "company",
      sourceApp: "allwain",
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.role, "buyer");
    headers = { Authorization: `Bearer ${registration.body.token}` };
  });

  after(async () => {
    await client.stop();
  });

  it("keeps restricted sellers eligible to resume payment onboarding", () => {
    assert.equal(isAllwainSellerProfileActivatedStatus("restricted"), true);
    assert.equal(isAllwainSellerProfileActivatedStatus("not_activated"), false);
  });

  it("keeps marketplace access separate from Stripe payout readiness", () => {
    assert.equal(isAllwainSellerWorkspaceStatusEnabled("onboarding"), true);
    assert.equal(
      resolveAllwainSellerWorkspaceStatus("restricted", "restricted"),
      "onboarding",
    );
    assert.equal(
      isAllwainSellerWorkspaceStatusEnabled("restricted", "restricted"),
      true,
    );
    assert.equal(isAllwainSellerWorkspaceStatusEnabled("restricted", "enabled"), false);
    assert.equal(
      isAllwainSellerPaymentStateReady({
        profileStatus: "onboarding",
        paymentStatus: "pending",
        fiscalReady: false,
        chargesEnabled: false,
        transfersEnabled: false,
        payoutsEnabled: false,
      }),
      false,
    );
  });

  it("starts as buyer without creating another identity", async () => {
    const response = await client.get("/allwain/participation", headers);
    assert.equal(response.status, 200);
    assert.equal(response.body.buyer.enabled, true);
    assert.equal(response.body.buyer.status, "active");
    assert.equal(response.body.experience.onboardingVersion, 0);
    assert.equal(response.body.experience.guidanceEnabled, true);
    assert.equal(response.body.seller.status, "not_activated");
    assert.equal(response.body.connector.status, "not_activated");
  });

  it("persists the first-use choice on the account", async () => {
    const update = await client.patch(
      "/allwain/participation/experience",
      {
        onboardingVersion: 4,
        primaryIntent: "sell",
        guidanceEnabled: true,
        lastContext: "sell",
      },
      headers,
    );
    assert.equal(update.status, 200);
    assert.equal(update.body.onboardingVersion, 4);
    assert.equal(update.body.primaryIntent, "sell");
    assert.ok(update.body.onboardingCompletedAt);

    const reopened = await client.get("/allwain/participation", headers);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.experience.onboardingVersion, 4);
    assert.equal(reopened.body.experience.primaryIntent, "sell");

    const invalid = await client.patch(
      "/allwain/participation/experience",
      { onboardingVersion: 99, primaryIntent: "observer" },
      headers,
    );
    assert.equal(invalid.status, 400);
  });

  it("activates seller on the same account", async () => {
    const response = await client.post(
      "/allwain/participation/seller/activate",
      {
        sellerType: "producer",
        displayName: "Huerta de Prueba",
        locationLabel: "Foios",
        pickupAddress: "Camí de la Creu 4, 46134 Foios",
        latitude: 39.533421,
        longitude: -0.356712,
      },
      headers,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.seller.enabled, true);
    assert.equal(response.body.seller.status, "onboarding");
    assert.equal(response.body.seller.sellerReady, false);
    assert.equal(response.body.seller.sellerType, "producer");
    assert.equal(response.body.seller.locationReady, true);
    assert.equal(response.body.seller.locationLabel, "Foios");
  });

  it("persists seller changes when the profile is reopened", async () => {
    const update = await client.patch(
      "/allwain/participation/seller",
      {
        displayName: "Huerta Actualizada",
        locationLabel: "Meliana",
        pickupAddress: "Carrer de la Font 8, 46133 Meliana",
      },
      headers,
    );
    assert.equal(update.status, 200);
    assert.equal(update.body.seller.displayName, "Huerta Actualizada");
    assert.equal(update.body.seller.locationLabel, "Meliana");
    assert.equal(
      update.body.seller.pickupAddress,
      "Carrer de la Font 8, 46133 Meliana",
    );

    const reopened = await client.get("/allwain/participation", headers);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.seller.displayName, "Huerta Actualizada");
    assert.equal(reopened.body.seller.locationLabel, "Meliana");
    assert.equal(
      reopened.body.seller.pickupAddress,
      "Carrer de la Font 8, 46133 Meliana",
    );
  });

  it("activates connector with one Newmersive ID and private network attribution", async () => {
    const activation = await client.post(
      "/allwain/participation/connector/activate",
      {
        locationLabel: "Foios",
        latitude: 39.533421,
        longitude: -0.356712,
        radiusKm: 10,
        available: true,
      },
      headers,
    );
    assert.equal(activation.status, 200);
    assert.equal(activation.body.connector.enabled, true);
    assert.equal(activation.body.connector.radiusKm, 10);
    assert.equal(activation.body.connector.available, true);
    assert.match(activation.body.connector.referralUrl, /[?&]ref=/);
    newmersiveId = activation.body.connector.newmersiveId;
    assert.ok(newmersiveId);

    const invited = await client.post("/auth/register", {
      name: "Persona Invitada Completa",
      email: `allwain-invited+${suffix}@test.local`,
      password: "Participation123!",
      sponsorCode: newmersiveId,
      sourceApp: "allwain",
    });
    assert.equal(invited.status, 201);

    const network = await client.get(
      "/allwain/participation/connector/network",
      headers,
    );
    assert.equal(network.status, 200);
    assert.equal(network.body.totals.users, 1);
    assert.equal(network.body.items[0].displayName, "Persona I.");
    assert.equal(network.body.items[0].kind, "buyer");
  });

  it("persists connector availability and radius when the profile is reopened", async () => {
    const update = await client.patch(
      "/allwain/participation/connector",
      {
        available: false,
        radiusKm: 20,
        locationLabel: "L'Horta Nord",
      },
      headers,
    );
    assert.equal(update.status, 200);
    assert.equal(update.body.connector.available, false);
    assert.equal(update.body.connector.radiusKm, 20);
    assert.equal(update.body.connector.locationLabel, "L'Horta Nord");

    const reopened = await client.get("/allwain/participation", headers);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.connector.available, false);
    assert.equal(reopened.body.connector.radiusKm, 20);
    assert.equal(reopened.body.connector.locationLabel, "L'Horta Nord");
  });
});
