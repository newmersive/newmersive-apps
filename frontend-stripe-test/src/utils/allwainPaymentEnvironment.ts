import type { AllwainPaymentConfig } from "../config/api";

export function isAllwainStripeTestMarketplace(
  config?: AllwainPaymentConfig | null,
) {
  return Boolean(
    config?.enabled === true &&
      config.stripeLivemode === false &&
      config.paymentEnvironment !== "live" &&
      config.stripeTestCheckoutEnabled === true &&
      config.stripeTestCheckoutScope === "all_real_user_offers" &&
      config.stripeTestFundsFlow === "platform_charge_only_no_transfers" &&
      config.stripeTestFiscalDocumentsIssued === false &&
      config.stripeTestSellerTransfersEnabled === false &&
      config.legalRequirementsBypassedForTest === true,
  );
}

export function isAllwainLivePaymentEnvironment(
  config?: AllwainPaymentConfig | null,
) {
  return Boolean(
    config?.enabled === true &&
      config.stripeLivemode === true &&
      config.paymentEnvironment === "live" &&
      config.legalRequirementsBypassedForTest !== true,
  );
}

export function isAllwainPaymentEnvironmentReady(
  config?: AllwainPaymentConfig | null,
) {
  return (
    isAllwainStripeTestMarketplace(config) ||
    isAllwainLivePaymentEnvironment(config)
  );
}
