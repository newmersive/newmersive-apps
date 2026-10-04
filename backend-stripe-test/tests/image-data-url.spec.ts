import assert from "node:assert";
import { describe, it } from "node:test";
import {
  ImageDataUrlError,
  validateImageDataUrl,
} from "../src/security/image-data-url";

const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function expectImageError(value: string, code: string) {
  assert.throws(
    () => validateImageDataUrl(value),
    (error: unknown) => error instanceof ImageDataUrlError && error.code === code,
  );
}

describe("image data URL security", () => {
  it("accepts a bounded PNG and reports its real dimensions", () => {
    const result = validateImageDataUrl(`data:image/png;base64,${VALID_PNG_BASE64}`);
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.width, 1);
    assert.equal(result.height, 1);
    assert.ok(result.bytes > 40);
  });

  it("does not trust a declared MIME type that disagrees with the bytes", () => {
    expectImageError(
      `data:image/jpeg;base64,${VALID_PNG_BASE64}`,
      "INVALID_IMAGE_CONTENT",
    );
  });

  it("rejects malformed base64 and unsupported active formats", () => {
    expectImageError("data:image/png;base64,%%%", "INVALID_IMAGE_DATA_URL");
    expectImageError(
      `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      "INVALID_IMAGE_DATA_URL",
    );
  });

  it("blocks decompression-sized PNG dimensions before calling an AI provider", () => {
    const buffer = Buffer.from(VALID_PNG_BASE64, "base64");
    buffer.writeUInt32BE(10_000, 16);
    buffer.writeUInt32BE(10_000, 20);
    expectImageError(
      `data:image/png;base64,${buffer.toString("base64")}`,
      "IMAGE_DIMENSIONS_BLOCKED",
    );
  });
});
