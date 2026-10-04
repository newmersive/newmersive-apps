import assert from "node:assert";
import { describe, it } from "node:test";
import { buildAllwainRecallImpact } from "../src/services/allwain-compliance.service";

describe("Allwain lot recall impact", () => {
  it("deduplicates affected orders and buyers while preserving each destination", () => {
    const impact = buildAllwainRecallImpact([
      { orderId: "order-1", order: { buyerUserId: "buyer-1" } },
      { orderId: "order-1", order: { buyerUserId: "buyer-1" } },
      { orderId: "order-2", order: { buyerUserId: "buyer-1" } },
      { orderId: "order-3", order: { buyerUserId: "buyer-2" } },
    ]);

    assert.deepEqual(impact.orderIds, ["order-1", "order-2", "order-3"]);
    assert.deepEqual(impact.buyerIds, ["buyer-1", "buyer-2"]);
    assert.deepEqual(impact.recipients, [
      { buyerUserId: "buyer-1", orderId: "order-1" },
      { buyerUserId: "buyer-1", orderId: "order-2" },
      { buyerUserId: "buyer-2", orderId: "order-3" },
    ]);
  });
});
