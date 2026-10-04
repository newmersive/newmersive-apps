export class ExternalHttpError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ExternalHttpError";
  }
}

type BoundedJsonOptions = {
  service: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

function boundedInteger(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function readBoundedBody(response: Response, maxBytes: number, service: string) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ExternalHttpError(`${service}_RESPONSE_TOO_LARGE`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = Buffer.from(part.value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ExternalHttpError(`${service}_RESPONSE_TOO_LARGE`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

export async function fetchBoundedJson<T>(
  input: string | URL,
  init: RequestInit,
  options: BoundedJsonOptions,
): Promise<{ response: Response; data: T | null }> {
  const service = String(options.service || "EXTERNAL")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 48) || "EXTERNAL";
  const timeoutMs = boundedInteger(options.timeoutMs, 20_000, 1_000, 120_000);
  const maxResponseBytes = boundedInteger(
    options.maxResponseBytes,
    1_000_000,
    1_024,
    10_000_000,
  );
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const externalSignal = init.signal;
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(input, { ...init, signal });
    const text = await readBoundedBody(response, maxResponseBytes, service);
    if (!text.trim()) return { response, data: null };
    try {
      return { response, data: JSON.parse(text) as T };
    } catch {
      throw new ExternalHttpError(`${service}_INVALID_JSON`);
    }
  } catch (error) {
    if (
      timeoutController.signal.aborted &&
      !(externalSignal && externalSignal.aborted)
    ) {
      throw new ExternalHttpError(`${service}_TIMEOUT`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
