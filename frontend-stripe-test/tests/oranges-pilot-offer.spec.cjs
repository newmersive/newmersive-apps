const assert = require("node:assert/strict");
const { it } = require("node:test");
const load = require("./helpers/load-typescript.cjs");

const {
  ORANGES_DEMO_OFFER_ID,
  ORANGES_PILOT_OFFER_ID,
  preferredOrangesOffer,
  resolveOfferDeepLink,
} = load("src/data/demoOffers.ts", {
  "../../assets/campaigns/naranjas-foios-offer-card-v1.png": {
    uri: "oranges-test-asset",
  },
});

const ordinaryOffer = {
  id: "ordinary-offer",
  title: "Otra oferta",
  meta: {},
};
const pilotOffer = {
  id: ORANGES_PILOT_OFFER_ID,
  title: "Oferta real de naranjas",
  ownerUserId: "seller-real",
  allwainStatus: "active",
  meta: {
    campaign: "naranjas-valencianas-piloto",
    demo: false,
    checkoutEnabled: true,
  },
};

it("prefers the seeded checkout offer over the static demo", () => {
  assert.equal(
    preferredOrangesOffer([ordinaryOffer, pilotOffer]),
    pilotOffer,
  );
});

it("never invents a demo replacement when no real orange offer arrived", () => {
  assert.equal(preferredOrangesOffer([ordinaryOffer]), undefined);
});

it("recognizes a non-demo API campaign if the seed id changes", () => {
  const migratedPilot = {
    id: "migrated-pilot",
    title: "Piloto migrado",
    ownerUserId: "seller-real",
    allwainStatus: "active",
    meta: { campaign: "NARANJAS-VALENCIANAS-PILOTO", demo: false },
  };
  assert.equal(preferredOrangesOffer([migratedPilot]), migratedPilot);
});

it("keeps an illustrative image independent from checkout eligibility", () => {
  const illustrativeRealOffer = {
    ...pilotOffer,
    meta: { ...pilotOffer.meta, imageIllustrative: true },
  };
  assert.equal(preferredOrangesOffer([illustrativeRealOffer]), illustrativeRealOffer);
});

it("does not pin demo, synthetic, disabled or inactive orange cards", () => {
  for (const candidate of [
    { ...pilotOffer, meta: { ...pilotOffer.meta, demo: true } },
    { ...pilotOffer, meta: { ...pilotOffer.meta, synthetic: true } },
    { ...pilotOffer, meta: { ...pilotOffer.meta, checkoutEnabled: false } },
    { ...pilotOffer, allwainStatus: "paused" },
  ]) {
    assert.equal(preferredOrangesOffer([candidate]), undefined);
  }
});

it("maps the legacy demo deep-link to the real offer when available", () => {
  assert.equal(
    resolveOfferDeepLink([ordinaryOffer, pilotOffer], ORANGES_DEMO_OFFER_ID),
    pilotOffer,
  );
  assert.equal(
    resolveOfferDeepLink([ordinaryOffer, pilotOffer], ordinaryOffer.id),
    ordinaryOffer,
  );
});
