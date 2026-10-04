import AsyncStorage from "@react-native-async-storage/async-storage";

export const JOURNEY_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
const prefix = "allwain:journey:v1:";
let storageTail: Promise<unknown> = Promise.resolve();

function key(accountId: string, operation: string) {
  if (!accountId || !operation) throw new Error("A draft needs an account and operation");
  return `${prefix}${encodeURIComponent(accountId)}:${encodeURIComponent(operation)}`;
}

// Callers persist explicit editable fields only. Credentials, consent and captured
// evidence must never be retained here, even if a caller accidentally adds them.
function safeValue(value: unknown): boolean {
  if (typeof value === "string") return !/^(?:data:|file:|blob:)/i.test(value);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value).every(([name, entry]) =>
    !/(token|password|secret|image|base64|consent|latitude|longitude|phone|address|capture)/i.test(name) && safeValue(entry),
  );
}

export async function writeJourneyDraft<T>(accountId: string, operation: string, value: T): Promise<boolean> {
  if (!accountId || !safeValue(value)) return false;
  const serialized = JSON.stringify({ accountId, expiresAt: Date.now() + JOURNEY_DRAFT_TTL, value });
  if (serialized.length > 100_000) return false;
  const task = storageTail.catch(() => undefined).then(() => AsyncStorage.setItem(key(accountId, operation), serialized));
  storageTail = task;
  return task.then(() => true, () => false);
}

export async function readJourneyDraft<T>(accountId: string, operation: string): Promise<T | null> {
  if (!accountId) return null;
  await storageTail.catch(() => undefined);
  try {
    const raw = await AsyncStorage.getItem(key(accountId, operation));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.accountId !== accountId || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now() || !safeValue(entry.value)) {
      await clearJourneyDraft(accountId, operation);
      return null;
    }
    return entry.value as T;
  } catch { return null; }
}

export async function clearJourneyDraft(accountId: string, operation: string): Promise<void> {
  if (!accountId) return;
  const task = storageTail.catch(() => undefined).then(() => AsyncStorage.removeItem(key(accountId, operation)));
  storageTail = task;
  await task.catch(() => undefined);
}
