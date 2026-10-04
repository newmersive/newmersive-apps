import assert from "node:assert";
import { describe, it } from "node:test";
import {
  archiveAllwainOfferMeta,
  isAllwainOfferArchived,
  releaseAllwainOfferStock,
} from "../src/services/allwain-inventory";

describe("Allwain offer lifecycle", () => {
  it("archives a deleted seller's offer without discarding its historical metadata", () => {
    const archivedAt = new Date("2026-09-01T10:00:00.000Z");
    const meta = archiveAllwainOfferMeta(
      { stockQuantity: 100, availableQuantity: 85, unit: "kg" },
      archivedAt,
    );

    assert.equal(meta.stockQuantity, 100);
    assert.equal(meta.availableQuantity, 0);
    assert.equal(meta.archivedAt, archivedAt.toISOString());
    assert.equal(isAllwainOfferArchived({ meta }), true);
  });

  it("reactivates a sold-out offer when a reservation returns stock", () => {
    const released = releaseAllwainOfferStock(
      {
        allwainStatus: "sold_out",
        meta: {
          inventoryManaged: true,
          stockQuantity: 5,
          availableQuantity: 0,
          reservedQuantity: 5,
          soldQuantity: 0,
          minQuantity: 5,
          quantityStep: 1,
          unit: "ud",
        },
      } as any,
      5,
    );

    assert.equal(released.allwainStatus, "active");
    assert.equal(released.meta.availableQuantity, 5);
    assert.equal(released.meta.reservedQuantity, 0);
  });
});
