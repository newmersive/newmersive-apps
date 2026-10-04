import type { AllwainOffer } from "../config/api";

export const ORANGES_DEMO_OFFER_ID = "allwain-demo-naranjas-valencianas";
export const ORANGES_PILOT_OFFER_ID = "allwain-pilot-naranjas-foios";

export const ORANGES_ILLUSTRATIVE_IMAGE = require("../../assets/campaigns/naranjas-foios-offer-card-v1.png");
/** @deprecated Use ORANGES_ILLUSTRATIVE_IMAGE. Kept for old imports/deep links. */
export const ORANGES_DEMO_IMAGE = ORANGES_ILLUSTRATIVE_IMAGE;

export function isPinnedOrangesOffer(offer: AllwainOffer) {
  const campaign = String(offer.meta?.campaign || "").toLowerCase();
  return (
    offer.id === ORANGES_DEMO_OFFER_ID ||
    offer.id === ORANGES_PILOT_OFFER_ID ||
    campaign === "naranjas-valencianas-piloto"
  );
}

/**
 * Pin only the real, actionable API-backed offer. The illustrative image is
 * presentation metadata and must never turn the offer into a demo card.
 */
export function preferredOrangesOffer(
  offers: readonly AllwainOffer[],
): AllwainOffer | undefined {
  const actionable = (offer: AllwainOffer) =>
    offer.id !== ORANGES_DEMO_OFFER_ID &&
    offer.meta?.demo !== true &&
    offer.meta?.synthetic !== true &&
    offer.meta?.checkoutEnabled !== false &&
    offer.allwainStatus === "active" &&
    Boolean(offer.ownerUserId || offer.provider?.id);

  return offers.find(
    (offer) => offer.id === ORANGES_PILOT_OFFER_ID && actionable(offer),
  ) || offers.find(
    (offer) =>
      actionable(offer) &&
      String(offer.meta?.campaign || "").toLowerCase() ===
        "naranjas-valencianas-piloto",
  );
}

export function resolveOfferDeepLink(
  offers: readonly AllwainOffer[],
  offerId: string,
): AllwainOffer | undefined {
  return offerId === ORANGES_DEMO_OFFER_ID
    ? preferredOrangesOffer(offers)
    : offers.find((offer) => offer.id === offerId);
}
