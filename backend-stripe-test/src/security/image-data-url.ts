import { ENV } from "../config/env";

export class ImageDataUrlError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ImageDataUrlError";
  }
}

export type ValidatedImageDataUrl = {
  dataUrl: string;
  mimeType: "image/jpeg" | "image/png";
  bytes: number;
  width: number;
  height: number;
};

function assertDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > ENV.ALLWAIN_IMAGE_MAX_DIMENSION ||
    height > ENV.ALLWAIN_IMAGE_MAX_DIMENSION ||
    width * height > ENV.ALLWAIN_IMAGE_MAX_PIXELS
  ) {
    throw new ImageDataUrlError("IMAGE_DIMENSIONS_BLOCKED");
  }
}

function inspectPng(buffer: Buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    buffer.length < 45 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR" ||
    buffer.subarray(buffer.length - 8, buffer.length - 4).toString("ascii") !== "IEND"
  ) {
    throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assertDimensions(width, height);
  return { width, height };
}

function inspectJpeg(buffer: Buffer) {
  if (
    buffer.length < 16 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
  }
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  let foundScan = false;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
    }
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
      dimensions = {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    if (marker === 0xda) {
      foundScan = true;
      break;
    }
    offset += segmentLength;
  }
  if (!dimensions || !foundScan) throw new ImageDataUrlError("INVALID_IMAGE_CONTENT");
  assertDimensions(dimensions.width, dimensions.height);
  return dimensions;
}

export function validateImageDataUrl(value: unknown): ValidatedImageDataUrl {
  if (typeof value !== "string") throw new ImageDataUrlError("INVALID_IMAGE_DATA_URL");
  const match = value.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new ImageDataUrlError("INVALID_IMAGE_DATA_URL");
  const mimeType = match[1] as ValidatedImageDataUrl["mimeType"];
  const encoded = match[2];
  if (encoded.length % 4 === 1) throw new ImageDataUrlError("INVALID_IMAGE_DATA_URL");
  const estimatedBytes = Math.floor((encoded.length * 3) / 4);
  if (estimatedBytes > ENV.ALLWAIN_IMAGE_MAX_BYTES) {
    throw new ImageDataUrlError("IMAGE_TOO_LARGE");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > ENV.ALLWAIN_IMAGE_MAX_BYTES) {
    throw new ImageDataUrlError(buffer.length ? "IMAGE_TOO_LARGE" : "INVALID_IMAGE_CONTENT");
  }
  const dimensions = mimeType === "image/png" ? inspectPng(buffer) : inspectJpeg(buffer);
  return {
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    mimeType,
    bytes: buffer.length,
    ...dimensions,
  };
}
