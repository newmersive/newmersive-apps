import assert from "node:assert";
import { describe, it } from "node:test";

import { ENV } from "../src/config/env";
import {
  allwainPreorderMaximumDays,
  allwainPreorderReminderStage,
  isAllwainSavedPreorderPastDeadline,
  normalizeAllwainPreorderChargeDeadline,
  shouldAdvanceAllwainPreorderReminder,
} from "../src/services/allwain-preorders";

describe("Allwain preorder mandate dates", () => {
  it("normalizes a date-only deadline to an immutable ISO instant", () => {
    const deadline = normalizeAllwainPreorderChargeDeadline(
      "2026-10-15",
      new Date("2026-09-03T12:00:00.000Z"),
    );
    assert.equal(deadline.toISOString(), "2026-10-15T23:59:59.999Z");
  });

  it("rejects missing, invalid and expired deadlines", () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    assert.throws(
      () => normalizeAllwainPreorderChargeDeadline(null, now),
      /PREORDER_CHARGE_DEADLINE_REQUIRED/,
    );
    assert.throws(
      () => normalizeAllwainPreorderChargeDeadline("not-a-date", now),
      /INVALID_PREORDER_CHARGE_DEADLINE/,
    );
    assert.throws(
      () => normalizeAllwainPreorderChargeDeadline("2026-09-02", now),
      /PREORDER_CHARGE_DEADLINE_PASSED/,
    );
  });

  it("enforces the configured platform safety horizon", () => {
    const previous = ENV.ALLWAIN_PREORDER_MAX_DAYS;
    ENV.ALLWAIN_PREORDER_MAX_DAYS = 30;
    try {
      assert.equal(allwainPreorderMaximumDays(), 30);
      assert.throws(
        () =>
          normalizeAllwainPreorderChargeDeadline(
            "2026-11-01",
            new Date("2026-09-03T12:00:00.000Z"),
          ),
        /PREORDER_CHARGE_DEADLINE_TOO_FAR/,
      );
    } finally {
      ENV.ALLWAIN_PREORDER_MAX_DAYS = previous;
    }
  });

  it("selects progressive 30, 7 and 1 day reminder stages", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    assert.equal(
      allwainPreorderReminderStage("2026-10-03T12:00:00.000Z", now),
      "30_days",
    );
    assert.equal(
      allwainPreorderReminderStage("2026-09-10T12:00:00.000Z", now),
      "7_days",
    );
    assert.equal(
      allwainPreorderReminderStage("2026-09-05T11:59:59.000Z", now),
      "1_day",
    );
    assert.equal(
      allwainPreorderReminderStage("2026-10-05T12:00:00.000Z", now),
      null,
    );
    assert.equal(
      allwainPreorderReminderStage("2026-09-04T11:59:59.000Z", now),
      null,
    );
  });

  it("never moves a reminder stage backwards", () => {
    assert.equal(shouldAdvanceAllwainPreorderReminder(null, "30_days"), true);
    assert.equal(
      shouldAdvanceAllwainPreorderReminder("30_days", "7_days"),
      true,
    );
    assert.equal(
      shouldAdvanceAllwainPreorderReminder("7_days", "30_days"),
      false,
    );
    assert.equal(
      shouldAdvanceAllwainPreorderReminder("1_day", "1_day"),
      false,
    );
  });

  it("releases only saved preorders whose charge deadline has passed", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    assert.equal(
      isAllwainSavedPreorderPastDeadline(
        {
          paymentMode: "preorder",
          paymentStatus: "payment_method_saved",
          preorderChargeDeadlineAt: "2026-09-04T11:59:59.000Z",
        },
        now,
      ),
      true,
    );
    assert.equal(
      isAllwainSavedPreorderPastDeadline(
        {
          paymentMode: "preorder",
          paymentStatus: "payment_method_saved",
          preorderChargeDeadlineAt: "2026-09-05T12:00:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isAllwainSavedPreorderPastDeadline(
        {
          paymentMode: "immediate",
          paymentStatus: "payment_method_saved",
          preorderChargeDeadlineAt: "2026-09-04T11:59:59.000Z",
        },
        now,
      ),
      false,
    );
  });
});
