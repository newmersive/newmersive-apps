import assert from "node:assert";
import { describe, it } from "node:test";
import {
  calculateAllwainConnectorFee,
  calculateAllwainDeliveryAllocation,
  calculateAllwainMoney,
  calculateAllwainSavingsMoney,
  calculateAllwainRefundAllocation,
  initialAllwainOrderSettlement,
  allwainLegalReleaseMatchesStripeMode,
  allwainPaymentsConfigured,
  allwainOfferCheckoutDisabled,
  allwainStripeOnBehalfOfAccount,
  allwainStripeCheckoutCollectionConfig,
  allwainStripeTestCheckoutEnabled,
  allwainStripeTestOfferEnabled,
  allwainTransferStateAfterSuccessfulCharge,
  allwainStripeModeMatchesConfiguration,
  isAllwainStripeTestDetermination,
} from "../src/services/allwain-money";
import { ENV, allwainPublicationCardRequired } from "../src/config/env";
import { getAllwainPaymentConfig } from "../src/services/allwain-payments.service";
import { allwainPaymentErrorStatus } from "../src/routes/allwain-payments.routes";
import {
  assertAllwainProposalActive,
  normalizeAllwainProposalExpiry,
} from "../src/services/allwain-proposals";

describe("Allwain marketplace money", () => {
  it("charges the buyer 10% of verified savings without reducing the seller price", () => {
    const result = calculateAllwainSavingsMoney({
      referenceAmount: 100_000,
      acceptedOfferAmount: 90_000,
      platformFeeBps: 1_000,
      currency: "EUR",
    });

    assert.equal(result.grossSavingsAmount, 10_000);
    assert.equal(result.platformFeeAmount, 1_000);
    assert.equal(result.buyerSubtotalAmount, 91_000);
    assert.equal(result.sellerAmount, 90_000);
    assert.equal(result.netSavingsAmount, 9_000);
    assert.equal(result.platformFeePayer, "buyer");
    assert.equal(result.feeBasis, "verified_savings");
  });

  it("allows a proposal equal to the reference with no savings fee", () => {
    const result = calculateAllwainSavingsMoney({
      referenceAmount: 100_000,
      acceptedOfferAmount: 100_000,
    });
    assert.equal(result.platformFeeAmount, 0);
    assert.equal(result.buyerSubtotalAmount, 100_000);
    assert.equal(result.netSavingsAmount, 0);
  });

  it("rejects proposals above the verified reference", () => {
    assert.throws(
      () =>
        calculateAllwainSavingsMoney({
          referenceAmount: 100_000,
          acceptedOfferAmount: 100_001,
        }),
      /OFFER_ABOVE_REFERENCE_PRICE/,
    );
  });

  it("normalizes seller-controlled proposal duration and rejects invalid windows", () => {
    const now = new Date("2026-09-07T10:00:00.000Z");
    assert.equal(
      normalizeAllwainProposalExpiry({ validForMinutes: 1_440, now }).toISOString(),
      "2026-09-08T10:00:00.000Z",
    );
    assert.throws(
      () => normalizeAllwainProposalExpiry({ validForMinutes: 59, now }),
      /INVALID_PROPOSAL_DURATION/,
    );
    assert.throws(
      () => normalizeAllwainProposalExpiry({ validForMinutes: 43_201, now }),
      /INVALID_PROPOSAL_DURATION/,
    );
    assert.throws(
      () => assertAllwainProposalActive("2026-09-07T09:59:59.000Z", now),
      /PROPOSAL_EXPIRED/,
    );
  });

  it("splits 15 EUR into a 10% Allwain fee and 90% seller amount", () => {
    const result = calculateAllwainMoney({
      unitPrice: 1,
      quantity: 15,
      platformFeeBps: 1_000,
      currency: "eur",
    });

    assert.deepEqual(result, {
      currency: "eur",
      commercialModel: "marketplace",
      businessOfRecord: "seller",
      unitPriceAmount: 100,
      subtotalAmount: 1_500,
      platformFeeBps: 1_000,
      platformFeeAmount: 150,
      platformRetainedAmount: 150,
      sellerAmount: 1_350,
    });
  });

  it("keeps a direct Allwain service in the platform account without inventing a marketplace commission", () => {
    const result = calculateAllwainMoney({
      unitPrice: 75,
      quantity: 2,
      platformFeeBps: 1_000,
      currency: "eur",
      commercialModel: "platform_direct",
    });

    assert.deepEqual(result, {
      currency: "eur",
      commercialModel: "platform_direct",
      businessOfRecord: "platform",
      unitPriceAmount: 7_500,
      subtotalAmount: 15_000,
      platformFeeBps: 0,
      platformFeeAmount: 0,
      platformRetainedAmount: 15_000,
      sellerAmount: 0,
    });
  });

  it("keeps local delivery separate from a direct Allwain service", () => {
    const delivery = calculateAllwainDeliveryAllocation({
      deliveryChannel: "local_connector",
      subtotalAmount: 15_000,
      platformFeeAmount: 0,
      localDeliveryFeeAmount: 200,
    });

    assert.deepEqual(delivery, {
      shippingAmount: 200,
      carrierDeliveryAmount: 0,
      connectorPlatformShareAmount: 0,
      connectorDeliveryAmount: 200,
      connectorFeeAmount: 200,
      platformNetFeeAmount: 0,
    });
  });

  it("allocates 2% of the 10% marketplace fee to the connector", () => {
    const sale = calculateAllwainMoney({
      unitPrice: 1,
      quantity: 15,
      platformFeeBps: 1_000,
      currency: "eur",
    });
    const allocation = calculateAllwainConnectorFee({
      subtotalAmount: sale.subtotalAmount,
      platformFeeAmount: sale.platformFeeAmount,
      connectorFeeBps: 200,
    });

    assert.equal(sale.sellerAmount, 1_350);
    assert.equal(allocation.connectorFeeAmount, 3);
    assert.equal(allocation.platformNetFeeAmount, 147);
    assert.equal(
      sale.sellerAmount + allocation.connectorFeeAmount + allocation.platformNetFeeAmount,
      sale.subtotalAmount,
    );
  });

  it("reports the connector share without presenting it as 2% of the sale", () => {
    const config = getAllwainPaymentConfig();

    assert.equal(config.platformFeePercent, 10);
    assert.equal(config.connectorShareOfPlatformFeePercent, 2);
    assert.equal(config.connectorFeePercent, 0.2);
    assert.equal(config.platformNetFeePercentWithConnector, 9.8);
    assert.equal(config.deliveryPricing.localConnector.amount, 200);
    assert.equal(config.deliveryPricing.pickup.amount, 0);
    assert.equal(config.deliveryPricing.carrier.available, false);
    assert.equal(
      config.publicationCardRequired,
      allwainPublicationCardRequired(),
    );
  });

  it("keeps publication card optional in TEST and requires it for live payments", () => {
    const previous = {
      enabled: ENV.ALLWAIN_PAYMENTS_ENABLED,
      livemode: ENV.ALLWAIN_STRIPE_LIVEMODE,
      explicit: ENV.ALLWAIN_PUBLICATION_CARD_REQUIRED,
    };
    try {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: false,
        ALLWAIN_STRIPE_LIVEMODE: false,
        ALLWAIN_PUBLICATION_CARD_REQUIRED: false,
      });
      assert.equal(allwainPublicationCardRequired(), false);

      ENV.ALLWAIN_PUBLICATION_CARD_REQUIRED = true;
      assert.equal(allwainPublicationCardRequired(), true);

      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: true,
        ALLWAIN_STRIPE_LIVEMODE: true,
        ALLWAIN_PUBLICATION_CARD_REQUIRED: false,
      });
      assert.equal(allwainPublicationCardRequired(), true);
    } finally {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: previous.enabled,
        ALLWAIN_STRIPE_LIVEMODE: previous.livemode,
        ALLWAIN_PUBLICATION_CARD_REQUIRED: previous.explicit,
      });
    }
  });

  it("adds a fixed 2 EUR Km0 delivery without reducing the seller amount", () => {
    const sale = calculateAllwainMoney({
      unitPrice: 1,
      quantity: 15,
      platformFeeBps: 1_000,
      currency: "eur",
    });
    const allocation = calculateAllwainDeliveryAllocation({
      deliveryChannel: "local_connector",
      subtotalAmount: sale.subtotalAmount,
      platformFeeAmount: sale.platformFeeAmount,
      localDeliveryFeeAmount: 200,
    });

    assert.deepEqual(allocation, {
      shippingAmount: 200,
      carrierDeliveryAmount: 0,
      connectorPlatformShareAmount: 3,
      connectorDeliveryAmount: 200,
      connectorFeeAmount: 203,
      platformNetFeeAmount: 147,
    });
    assert.equal(
      sale.sellerAmount +
        allocation.platformNetFeeAmount +
        allocation.connectorFeeAmount,
      1_700,
    );
  });

  it("keeps pickup free and requires a real carrier quote", () => {
    const pickup = calculateAllwainDeliveryAllocation({
      deliveryChannel: "pickup",
      subtotalAmount: 1_500,
      platformFeeAmount: 150,
    });
    assert.deepEqual(pickup, {
      shippingAmount: 0,
      carrierDeliveryAmount: 0,
      connectorPlatformShareAmount: 0,
      connectorDeliveryAmount: 0,
      connectorFeeAmount: 0,
      platformNetFeeAmount: 150,
    });
    assert.throws(
      () =>
        calculateAllwainDeliveryAllocation({
          deliveryChannel: "carrier",
          subtotalAmount: 1_500,
          platformFeeAmount: 150,
        }),
      /CARRIER_RATE_REQUIRED/,
    );
  });

  it("adds a carrier quote as a separate payable without reducing seller proceeds", () => {
    const carrier = calculateAllwainDeliveryAllocation({
      deliveryChannel: "carrier",
      subtotalAmount: 1_500,
      platformFeeAmount: 150,
      carrierShippingAmount: 475,
    });

    assert.deepEqual(carrier, {
      shippingAmount: 475,
      carrierDeliveryAmount: 475,
      connectorPlatformShareAmount: 0,
      connectorDeliveryAmount: 0,
      connectorFeeAmount: 0,
      platformNetFeeAmount: 150,
    });
    assert.equal(1_350 + carrier.platformNetFeeAmount + carrier.carrierDeliveryAmount, 1_975);
  });

  it("blocks activation until legal release and Stripe mode agree", () => {
    const previous = {
      enabled: ENV.ALLWAIN_PAYMENTS_ENABLED,
      testCheckout: ENV.ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED,
      approved: ENV.ALLWAIN_LEGAL_RELEASE_APPROVED,
      approvalReference: ENV.ALLWAIN_LEGAL_APPROVAL_REFERENCE,
      approvalScope: ENV.ALLWAIN_LEGAL_RELEASE_SCOPE,
      key: ENV.STRIPE_SECRET_KEY,
      livemode: ENV.ALLWAIN_STRIPE_LIVEMODE,
      platformWebhook: ENV.STRIPE_CONNECT_WEBHOOK_SECRET,
      thinWebhook: ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET,
      connectedWebhook: ENV.STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET,
      legalName: ENV.ALLWAIN_LEGAL_NAME,
      legalTaxId: ENV.ALLWAIN_LEGAL_TAX_ID,
      legalAddress: ENV.ALLWAIN_LEGAL_ADDRESS,
    };
    try {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: true,
        ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: false,
        ALLWAIN_LEGAL_RELEASE_APPROVED: true,
        ALLWAIN_LEGAL_APPROVAL_REFERENCE: "advisor-case-test",
        ALLWAIN_LEGAL_RELEASE_SCOPE: "test",
        STRIPE_SECRET_KEY: "sk_test_example",
        ALLWAIN_STRIPE_LIVEMODE: false,
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_platform",
        STRIPE_CONNECT_THIN_WEBHOOK_SECRET: "whsec_thin",
        STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET: "whsec_connected",
        ALLWAIN_LEGAL_NAME: "Test Platform",
        ALLWAIN_LEGAL_TAX_ID: "TEST12345",
        ALLWAIN_LEGAL_ADDRESS: "Test address",
      });
      assert.equal(allwainStripeModeMatchesConfiguration(), true);
      assert.equal(allwainPaymentsConfigured(), true);
      ENV.ALLWAIN_STRIPE_LIVEMODE = true;
      assert.equal(allwainStripeModeMatchesConfiguration(), false);
      assert.equal(allwainLegalReleaseMatchesStripeMode(), false);
      assert.equal(allwainPaymentsConfigured(), false);
      ENV.ALLWAIN_LEGAL_RELEASE_SCOPE = "live";
      assert.equal(allwainLegalReleaseMatchesStripeMode(), true);
      ENV.ALLWAIN_STRIPE_LIVEMODE = false;
      ENV.ALLWAIN_LEGAL_RELEASE_APPROVED = false;
      assert.equal(allwainPaymentsConfigured(), false);
    } finally {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: previous.enabled,
        ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: previous.testCheckout,
        ALLWAIN_LEGAL_RELEASE_APPROVED: previous.approved,
        ALLWAIN_LEGAL_APPROVAL_REFERENCE: previous.approvalReference,
        ALLWAIN_LEGAL_RELEASE_SCOPE: previous.approvalScope,
        STRIPE_SECRET_KEY: previous.key,
        ALLWAIN_STRIPE_LIVEMODE: previous.livemode,
        STRIPE_CONNECT_WEBHOOK_SECRET: previous.platformWebhook,
        STRIPE_CONNECT_THIN_WEBHOOK_SECRET: previous.thinWebhook,
        STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET: previous.connectedWebhook,
        ALLWAIN_LEGAL_NAME: previous.legalName,
        ALLWAIN_LEGAL_TAX_ID: previous.legalTaxId,
        ALLWAIN_LEGAL_ADDRESS: previous.legalAddress,
      });
    }
  });

  it("enables the hosted TEST marketplace without legal identity and keeps every Stripe readiness gate", () => {
    const previous = { ...ENV };
    try {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: false,
        ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: true,
        ALLWAIN_STRIPE_LIVEMODE: false,
        ALLWAIN_LEGAL_RELEASE_APPROVED: false,
        ALLWAIN_LEGAL_APPROVAL_REFERENCE: undefined,
        ALLWAIN_LEGAL_RELEASE_SCOPE: "none",
        ALLWAIN_LEGAL_NAME: undefined,
        ALLWAIN_LEGAL_TAX_ID: undefined,
        ALLWAIN_LEGAL_ADDRESS: undefined,
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_platform",
        STRIPE_CONNECT_THIN_WEBHOOK_SECRET: "whsec_thin",
        STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET: "whsec_connected",
      });
      assert.equal(allwainStripeTestCheckoutEnabled(), true);
      const realUserOffer = {
        owner: "allwain" as const,
        ownerUserId: "seller-user-1",
        meta: { checkoutEnabled: true },
      };
      assert.equal(
        allwainStripeTestOfferEnabled(realUserOffer),
        true,
      );
      assert.equal(
        allwainStripeTestOfferEnabled({
          owner: "allwain",
          ownerUserId: "another-seller",
          meta: {},
        }),
        true,
      );
      assert.equal(allwainOfferCheckoutDisabled(realUserOffer), false);
      for (const blocked of [
        { owner: "allwain" as const, ownerUserId: "seller", meta: { demo: true } },
        { owner: "allwain" as const, ownerUserId: "seller", meta: { synthetic: true } },
        {
          owner: "allwain" as const,
          ownerUserId: "seller",
          meta: { checkoutEnabled: false },
        },
        { owner: "trueqia" as const, ownerUserId: "seller", meta: {} },
        { owner: "allwain" as const, ownerUserId: "", meta: {} },
      ]) {
        assert.equal(allwainOfferCheckoutDisabled(blocked), true);
        assert.equal(allwainStripeTestOfferEnabled(blocked), false);
      }
      assert.equal(
        isAllwainStripeTestDetermination({
          treatmentCode: "stripe_test_non_fiscal",
        }),
        true,
      );
      assert.equal(
        isAllwainStripeTestDetermination({ treatmentCode: "standard_vat" }),
        false,
      );
      assert.equal(
        allwainStripeOnBehalfOfAccount(
          "marketplace",
          "acct_seller_test",
          true,
        ),
        null,
      );
      assert.deepEqual(
        allwainTransferStateAfterSuccessfulCharge({
          testOnlyNonFiscal: true,
          platformDirect: false,
          separateTransfers: true,
          connectorAllocated: true,
        }),
        {
          sellerTransferId: null,
          sellerTransferStatus: "not_required",
          connectorTransferStatus: "not_required",
          transferStatus: "not_required",
        },
      );
      assert.equal(
        allwainStripeOnBehalfOfAccount(
          "marketplace",
          "acct_seller_test",
          false,
        ),
        "acct_seller_test",
      );
      assert.equal(
        allwainStripeOnBehalfOfAccount(
          "platform_direct",
          "acct_seller_test",
          false,
        ),
        null,
      );
      assert.equal(allwainPaymentsConfigured(), true);
      const config = getAllwainPaymentConfig();
      assert.equal(config.enabled, true);
      assert.equal(config.paymentEnvironment, "test");
      assert.equal(config.stripeLivemode, false);
      assert.equal(config.legalIdentityConfigured, false);
      assert.equal(config.legalIdentityRequired, false);
      assert.equal(config.legalRequirementsBypassedForTest, true);
      assert.equal(config.stripeTestCheckoutScope, "all_real_user_offers");
      assert.deepEqual(config.stripeTestExcludedOfferKinds, [
        "demo",
        "synthetic",
        "checkout_disabled",
      ]);
      assert.equal(
        config.stripeTestFundsFlow,
        "platform_charge_only_no_transfers",
      );
      assert.equal(config.stripeTestFiscalDocumentsIssued, false);
      assert.equal(config.stripeTestSellerTransfersEnabled, false);
      assert.equal("stripeTestCheckoutOfferIds" in config, false);
      assert.deepEqual(config.activationBlockers, []);

      ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET = undefined;
      assert.equal(allwainPaymentsConfigured(), false);
      ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET = "whsec_thin";
      ENV.STRIPE_SECRET_KEY = "sk_live_wrong_mode";
      assert.equal(allwainStripeTestCheckoutEnabled(), false);
      assert.equal(allwainPaymentsConfigured(), false);
    } finally {
      Object.assign(ENV, previous);
    }
  });

  it("maps TEST-lane state conflicts to HTTP 409 instead of leaking an internal error", () => {
    for (const code of [
      "STRIPE_TEST_OFFER_NOT_ELIGIBLE",
      "STRIPE_TEST_ORDER_REQUIRES_TEST_MODE",
      "STRIPE_TEST_ORDER_MARKER_MISMATCH",
      "STRIPE_TEST_TRANSFERS_DISABLED",
      "DEMO_OFFER_READ_ONLY",
    ]) {
      assert.equal(allwainPaymentErrorStatus(code), 409, code);
    }
    assert.equal(allwainPaymentErrorStatus("STRIPE_NOT_CONFIGURED"), 503);
    assert.equal(allwainPaymentErrorStatus("UNEXPECTED_PROVIDER_FAILURE"), null);
  });

  it("keeps TEST checkout card-only without requesting identity or address data", () => {
    assert.deepEqual(
      allwainStripeCheckoutCollectionConfig({
        testOnlyNonFiscal: true,
        deliveryMethod: "shipping",
        mode: "payment",
      }),
      { payment_method_types: ["card"] },
    );
    assert.deepEqual(
      allwainStripeCheckoutCollectionConfig({
        testOnlyNonFiscal: true,
        deliveryMethod: "pickup",
        mode: "setup",
      }),
      { payment_method_types: ["card"] },
    );

    assert.deepEqual(
      allwainStripeCheckoutCollectionConfig({
        testOnlyNonFiscal: false,
        deliveryMethod: "shipping",
        mode: "payment",
      }),
      {
        shipping_address_collection: { allowed_countries: ["ES"] },
        billing_address_collection: "required",
        phone_number_collection: { enabled: true },
      },
    );
    assert.deepEqual(
      allwainStripeCheckoutCollectionConfig({
        testOnlyNonFiscal: false,
        deliveryMethod: "pickup",
        mode: "setup",
      }),
      {},
    );
  });

  it("keeps TEST disabled without its override or complete legal release", () => {
    const previous = { ...ENV };
    try {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: true,
        ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: false,
        ALLWAIN_STRIPE_LIVEMODE: false,
        ALLWAIN_LEGAL_RELEASE_APPROVED: false,
        ALLWAIN_LEGAL_APPROVAL_REFERENCE: undefined,
        ALLWAIN_LEGAL_RELEASE_SCOPE: "none",
        ALLWAIN_LEGAL_NAME: undefined,
        ALLWAIN_LEGAL_TAX_ID: undefined,
        ALLWAIN_LEGAL_ADDRESS: undefined,
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_platform",
        STRIPE_CONNECT_THIN_WEBHOOK_SECRET: "whsec_thin",
        STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET: "whsec_connected",
      });
      assert.equal(allwainStripeTestCheckoutEnabled(), false);
      assert.equal(allwainPaymentsConfigured(), false);
    } finally {
      Object.assign(ENV, previous);
    }
  });

  it("fails closed when a TEST override is left on in LIVE", () => {
    const previous = { ...ENV };
    try {
      Object.assign(ENV, {
        ALLWAIN_PAYMENTS_ENABLED: true,
        ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: true,
        ALLWAIN_STRIPE_LIVEMODE: true,
        ALLWAIN_LEGAL_RELEASE_APPROVED: true,
        ALLWAIN_LEGAL_APPROVAL_REFERENCE: "live-approval",
        ALLWAIN_LEGAL_RELEASE_SCOPE: "live",
        ALLWAIN_LEGAL_NAME: "Legal Platform",
        ALLWAIN_LEGAL_TAX_ID: "LEGAL123",
        ALLWAIN_LEGAL_ADDRESS: "Legal address",
        STRIPE_SECRET_KEY: "sk_live_example",
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_platform",
        STRIPE_CONNECT_THIN_WEBHOOK_SECRET: "whsec_thin",
        STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET: "whsec_connected",
      });
      assert.equal(allwainStripeTestCheckoutEnabled(), false);
      assert.equal(allwainPaymentsConfigured(), false);
    } finally {
      Object.assign(ENV, previous);
    }
  });

  it("starts orders without connector amounts when delivery does not require one", () => {
    assert.deepEqual(initialAllwainOrderSettlement(150), {
      carrierDeliveryAmount: 0,
      platformNetFeeAmount: 150,
      connectorFeeAmount: 0,
      connectorPlatformShareAmount: 0,
      connectorDeliveryAmount: 0,
      paymentArchitecture: "separate_charges_and_transfers",
      sellerTransferStatus: "not_started",
      connectorTransferStatus: "not_required",
    });
  });

  it("marks the external seller transfer as unnecessary for a direct service", () => {
    assert.equal(
      initialAllwainOrderSettlement(0, {}, "platform_direct").sellerTransferStatus,
      "not_required",
    );
  });

  it("rounds the order once in cents and preserves the accounting identity", () => {
    const result = calculateAllwainMoney({
      unitPrice: 1.35,
      quantity: 7,
      platformFeeBps: 1_000,
    });

    assert.equal(result.subtotalAmount, 945);
    assert.equal(result.platformFeeAmount, 95);
    assert.equal(result.sellerAmount, 850);
    assert.equal(result.platformFeeAmount + result.sellerAmount, result.subtotalAmount);
  });

  it("rejects invalid fee rates", () => {
    assert.throws(
      () =>
        calculateAllwainMoney({
          unitPrice: 1,
          quantity: 1,
          platformFeeBps: 10_001,
        }),
      /INVALID_ALLWAIN_PLATFORM_FEE_BPS/,
    );
  });

  it("allocates partial refunds cumulatively without losing cents", () => {
    const first = calculateAllwainRefundAllocation({
      grossAmount: 1_500,
      sellerAmount: 1_350,
      connectorAmount: 3,
      cumulativeBefore: 0,
      refundAmount: 501,
    });
    const second = calculateAllwainRefundAllocation({
      grossAmount: 1_500,
      sellerAmount: 1_350,
      connectorAmount: 3,
      cumulativeBefore: first.cumulativeAfter,
      refundAmount: 999,
    });

    assert.equal(first.sellerAmount + first.connectorAmount + first.platformAmount, 501);
    assert.equal(second.sellerAmount + second.connectorAmount + second.platformAmount, 999);
    assert.equal(first.sellerAmount + second.sellerAmount, 1_350);
    assert.equal(first.connectorAmount + second.connectorAmount, 3);
    assert.equal(first.platformAmount + second.platformAmount, 147);
  });

  it("rejects cumulative refunds beyond the original payment", () => {
    assert.throws(
      () =>
        calculateAllwainRefundAllocation({
          grossAmount: 1_500,
          sellerAmount: 1_350,
          connectorAmount: 30,
          cumulativeBefore: 1_000,
          refundAmount: 501,
        }),
      /REFUND_AMOUNT_EXCEEDS_PAYMENT/,
    );
  });

  it("returns a direct-service refund entirely to platform proceeds", () => {
    const refund = calculateAllwainRefundAllocation({
      grossAmount: 15_000,
      sellerAmount: 0,
      connectorAmount: 0,
      cumulativeBefore: 0,
      refundAmount: 4_500,
    });

    assert.equal(refund.sellerAmount, 0);
    assert.equal(refund.connectorAmount, 0);
    assert.equal(refund.platformAmount, 4_500);
  });
});
