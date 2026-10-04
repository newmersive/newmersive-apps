import assert from "node:assert";
import { describe, it } from "node:test";

import {
  allwainRecurringConfigFromContract,
  nextAllwainRecurringRunAt,
  selectAllwainRecurringCarrierQuote,
} from "../src/services/allwain-recurring.service";

describe("Allwain recurring order calendar", () => {
  it("keeps weekly and fortnightly deliveries on a stable cadence", () => {
    const start = new Date("2028-01-05T09:30:00.000Z");
    assert.equal(
      nextAllwainRecurringRunAt(start, "weekly").toISOString(),
      "2028-01-12T09:30:00.000Z",
    );
    assert.equal(
      nextAllwainRecurringRunAt(start, "biweekly").toISOString(),
      "2028-01-19T09:30:00.000Z",
    );
  });

  it("preserves the intended monthly day after a short month", () => {
    const january = new Date("2028-01-31T10:00:00.000Z");
    const february = nextAllwainRecurringRunAt(january, "monthly", 31);
    const march = nextAllwainRecurringRunAt(february, "monthly", 31);
    assert.equal(february.toISOString(), "2028-02-29T10:00:00.000Z");
    assert.equal(march.toISOString(), "2028-03-31T10:00:00.000Z");
  });

  it("reads recurrence only from an explicitly enabled structured order", () => {
    assert.equal(allwainRecurringConfigFromContract({ deliveryAddress: {} }), null);
    assert.deepEqual(
      allwainRecurringConfigFromContract({
        deliveryAddress: {
          recurringOrder: { enabled: true, interval: "weekly" },
          deliveryWindow: { sourceText: "Los viernes por la tarde" },
        },
      }),
      {
        interval: "weekly",
        label: "Cada semana",
        deliveryWindow: { sourceText: "Los viernes por la tarde" },
      },
    );
    assert.throws(
      () =>
        allwainRecurringConfigFromContract({
          deliveryAddress: {
            recurringOrder: { enabled: true, interval: "sometimes" },
          },
        }),
      /INVALID_RECURRING_ORDER/,
    );
  });

  it("selects a fresh carrier quote only inside the authorized maximum", () => {
    const selected = selectAllwainRecurringCarrierQuote({
      quotes: [
        {
          id: "cheap",
          shippingOptionCode: "carrier:economy",
          amount: 450,
          currency: "EUR",
        },
        {
          id: "preferred",
          shippingOptionCode: "carrier:standard",
          amount: 500,
          currency: "eur",
        },
        {
          id: "too-expensive",
          shippingOptionCode: "carrier:express",
          amount: 701,
          currency: "eur",
        },
      ],
      preferredShippingOptionCode: "carrier:standard",
      nonShippingAmount: 1_500,
      maximumChargeAmount: 2_000,
      currency: "EUR",
    });
    assert.equal(selected.id, "preferred");
  });

  it("requires renewed approval when every fresh quote exceeds the mandate", () => {
    assert.throws(
      () =>
        selectAllwainRecurringCarrierQuote({
          quotes: [
            {
              id: "higher",
              shippingOptionCode: "carrier:standard",
              amount: 501,
              currency: "eur",
            },
          ],
          preferredShippingOptionCode: "carrier:standard",
          nonShippingAmount: 1_500,
          maximumChargeAmount: 2_000,
          currency: "eur",
        }),
      /RECURRING_CARRIER_PRICE_REAPPROVAL_REQUIRED/,
    );
  });
});
