import assert from "node:assert";
import { afterEach, describe, it } from "node:test";

import {
  ExternalHttpError,
  fetchBoundedJson,
} from "../src/security/external-http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("bounded external HTTP responses", () => {
  it("parses a bounded JSON response", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const result = await fetchBoundedJson<{ ok: boolean }>(
      "https://provider.test/resource",
      { method: "GET" },
      { service: "provider", timeoutMs: 5_000, maxResponseBytes: 1_024 },
    );
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, { ok: true });
  });

  it("rejects a streamed response once it exceeds the byte ceiling", async () => {
    globalThis.fetch = (async () =>
      new Response("x".repeat(2_048), { status: 200 })) as typeof fetch;

    await assert.rejects(
      fetchBoundedJson(
        "https://provider.test/oversized",
        { method: "GET" },
        { service: "provider", timeoutMs: 5_000, maxResponseBytes: 1_024 },
      ),
      (error: unknown) =>
        error instanceof ExternalHttpError &&
        error.code === "PROVIDER_RESPONSE_TOO_LARGE",
    );
  });

  it("rejects malformed provider JSON without exposing its body", async () => {
    globalThis.fetch = (async () =>
      new Response("<html>unexpected</html>", { status: 502 })) as typeof fetch;

    await assert.rejects(
      fetchBoundedJson(
        "https://provider.test/malformed",
        { method: "GET" },
        { service: "provider", timeoutMs: 5_000, maxResponseBytes: 4_096 },
      ),
      (error: unknown) =>
        error instanceof ExternalHttpError && error.code === "PROVIDER_INVALID_JSON",
    );
  });
});
