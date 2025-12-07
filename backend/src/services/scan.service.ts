import { ENV } from "../config/env";
import { Product } from "../shared/types";
import { buildAllwainScanDemo } from "./allwain-demo.service";

type ScanProvider = "google" | "mock";

interface ScanInput {
  imageBase64?: string;
  barcode?: string;
  provider?: ScanProvider;
}

interface ScanResult {
  product?: Product;
  rawData: any;
}

async function scanWithGoogleVision(_input: ScanInput): Promise<ScanResult> {
  // TODO: Integrate Google Cloud Vision SDK or HTTP API here.
  // This stub keeps the shape consistent while the implementation is in progress.
  return {
    product: undefined,
    rawData: {
      provider: "google",
      message: "Google Cloud Vision integration pending",
    },
  };
}

async function scanWithMockProvider(): Promise<ScanResult> {
  const demo = buildAllwainScanDemo();
  return {
    product: demo.product,
    rawData: {
      ...demo,
      provider: "mock",
    },
  };
}

function resolveProvider(override?: ScanProvider): ScanProvider {
  if (override) return override;
  if (ENV.SCAN_PROVIDER === "google") return "google";
  return "mock";
}

export async function scanProductImage(input: ScanInput): Promise<ScanResult> {
  const provider = resolveProvider(input.provider);

  if (provider === "google") {
    return scanWithGoogleVision(input);
  }

  return scanWithMockProvider();
}

export async function evaluateObjectState(
  input: ScanInput
): Promise<{ status: string; rawData: any }> {
  const provider = resolveProvider(input.provider);

  if (provider === "google") {
    // Placeholder for a future quality/condition evaluation using Google Vision or custom model.
    return {
      status: "pending-assessment",
      rawData: {
        provider: "google",
        message: "Quality assessment pending integration",
      },
    };
  }

  return {
    status: "ok",
    rawData: {
      provider: "mock",
      message: "Estado evaluado con proveedor mock",
    },
  };
}
