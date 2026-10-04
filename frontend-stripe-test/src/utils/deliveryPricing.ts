import type {
  AllwainDeliveryPricingConfig,
  AllwainOffer,
} from "../config/api";

export type AllwainDeliveryChannel =
  | "carrier"
  | "local_connector"
  | "seller"
  | "pickup";

const fallbackPricing: AllwainDeliveryPricingConfig = {
  currency: "eur",
  localConnector: {
    available: true,
    amount: 200,
    pricingMode: "fixed_per_delivery",
  },
  pickup: { available: true, amount: 0, pricingMode: "free" },
  seller: { available: true, amount: 0, pricingMode: "free" },
  carrier: {
    available: false,
    amount: null,
    pricingMode: "provider_quote_required",
  },
};

export function getAllwainDeliveryPricing(
  offer?: AllwainOffer | null,
): AllwainDeliveryPricingConfig {
  const pricing = offer?.meta?.deliveryPricing;
  return pricing && typeof pricing === "object"
    ? pricing
    : fallbackPricing;
}

export function getAllwainDeliveryOption(
  offer: AllwainOffer | null | undefined,
  channel: AllwainDeliveryChannel,
) {
  const pricing = getAllwainDeliveryPricing(offer);
  if (channel === "local_connector") return pricing.localConnector;
  return pricing[channel];
}

export function getAllwainDeliveryAmount(
  offer: AllwainOffer | null | undefined,
  channel: AllwainDeliveryChannel,
) {
  const option = getAllwainDeliveryOption(offer, channel);
  return option.available && typeof option.amount === "number"
    ? option.amount
    : null;
}

export function calculateAllwainCheckoutPreview(input: {
  offer: AllwainOffer | null | undefined;
  quantity: number;
  deliveryChannel: AllwainDeliveryChannel;
  carrierShippingAmount?: number | null;
}) {
  const productAmount =
    typeof input.offer?.price === "number" && Number.isFinite(input.quantity)
      ? input.offer.price * input.quantity
      : null;
  const shippingAmountMinor =
    input.deliveryChannel === "carrier"
      ? typeof input.carrierShippingAmount === "number"
        ? input.carrierShippingAmount
        : null
      : getAllwainDeliveryAmount(input.offer, input.deliveryChannel);
  return {
    productAmount,
    shippingAmountMinor,
    totalAmount:
      productAmount !== null && shippingAmountMinor !== null
        ? productAmount + shippingAmountMinor / 100
        : null,
  };
}
