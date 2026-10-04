import {getAllwainPaymentConfig} from "./allwain-payments.service";
import {getAllwainShippingConfig} from "./allwain-shipping.service";

/** Reuse ecosystem providers, without enabling or modifying Allwain's transactions. */
export function getNoaSupporterReadiness(){
 const stripe=getAllwainPaymentConfig(),shipping=getAllwainShippingConfig();
 return {
  product:"noa-pioneer-nid-v2", amount:12000, currency:"eur",shippingIncluded:false,
  includes:["physical_nid"],
  optionalExtras:[{product:"member_tshirt",amount:2500,currency:"eur",requiresSize:true}],
  paymentProvider:stripe.provider,paymentMode:stripe.stripeLivemode?"live":"test",
  shippingProvider:shipping.provider,shippingConfigured:shipping.configured,
  // This is a new physical reward, not an Allwain marketplace order.
  // Worldwide fulfillment needs its own origin, parcel, customs and commercial release.
  checkoutEnabled:false,
  blockers:[
   ...(!stripe.stripeLivemode?["STRIPE_TEST_MODE"]:[]),
   ...(!shipping.configured?["SENDCLOUD_NOT_CONFIGURED"]:[]),
   "NOA_PACK_SHIPPING_PROFILE_REQUIRED",
   "NOA_INTERNATIONAL_FULFILLMENT_REQUIRED",
   "NOA_COMMERCIAL_TERMS_REQUIRED",
  ],
 };
}
