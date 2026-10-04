export type ScanCaptureInput = {
  rawText?: string;
  barcode?: string;
  imageBase64?: string;
  sourceType?: "camera" | "image" | "barcode" | "text";
};

const captures = new Map<string, { value: ScanCaptureInput; expiresAt: number }>();
let sequence = 0;
const lifetime = 10 * 60 * 1000;

// Capture contents must never become URL parameters or persistent browser storage.
export function rememberScanCapture(value: ScanCaptureInput): { captureId: string } {
  const now = Date.now();
  for (const [id, entry] of captures) {
    if (entry.expiresAt <= now) captures.delete(id);
  }
  while (captures.size >= 4) captures.delete(captures.keys().next().value!);
  const captureId = `capture-${now}-${++sequence}`;
  captures.set(captureId, { value: { ...value }, expiresAt: now + lifetime });
  return { captureId };
}

export function readScanCapture(captureId?: string): ScanCaptureInput | undefined {
  if (!captureId) return undefined;
  const entry = captures.get(captureId);
  if (!entry || entry.expiresAt <= Date.now()) {
    captures.delete(captureId);
    return undefined;
  }
  return { ...entry.value };
}

export function forgetScanCapture(captureId?: string) {
  if (captureId) captures.delete(captureId);
}
