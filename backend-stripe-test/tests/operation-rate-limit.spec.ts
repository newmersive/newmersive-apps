import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";

import {
  clearOperationRateLimitsForTests,
  consumeOperationQuota,
} from "../src/middleware/operation-rate-limit.middleware";

describe("costly operation rate limits", () => {
  beforeEach(() => clearOperationRateLimitsForTests());

  it("allows only the configured number of calls inside one window", () => {
    const now = 1_000_000;
    assert.equal(consumeOperationQuota("ai:user:1", 2, 60_000, now).allowed, true);
    assert.equal(consumeOperationQuota("ai:user:1", 2, 60_000, now + 1).allowed, true);
    const rejected = consumeOperationQuota("ai:user:1", 2, 60_000, now + 2);
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.remaining, 0);
  });

  it("opens a fresh bucket only after the previous window expires", () => {
    const now = 2_000_000;
    consumeOperationQuota("ocr:user:1", 1, 10_000, now);
    assert.equal(consumeOperationQuota("ocr:user:1", 1, 10_000, now + 9_999).allowed, false);
    const renewed = consumeOperationQuota("ocr:user:1", 1, 10_000, now + 10_000);
    assert.equal(renewed.allowed, true);
    assert.equal(renewed.remaining, 0);
  });

  it("keeps users and costly-operation scopes isolated", () => {
    const now = 3_000_000;
    consumeOperationQuota("ai:user:1", 1, 60_000, now);
    assert.equal(consumeOperationQuota("ai:user:2", 1, 60_000, now).allowed, true);
    assert.equal(consumeOperationQuota("ocr:user:1", 1, 60_000, now).allowed, true);
  });
});
