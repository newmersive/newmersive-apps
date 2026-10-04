import AsyncStorage from "@react-native-async-storage/async-storage";

export const JOURNEY_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
const prefix = "allwain:journey:v1:";
let storageTail: Promise<unknown> = Promise.resolve();
const deletedAccounts = new Set<string>();
const deletedKey = (accountId: string) => `allwain:journey:deleted:v1:${encodeURIComponent(accountId)}`;

async function accountWasDeleted(accountId: string) {
  if (deletedAccounts.has(accountId)) return true;
  if (await AsyncStorage.getItem(deletedKey(accountId))) {
    deletedAccounts.add(accountId);
    return true;
  }
  return deletedAccounts.has(accountId);
}

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
  if (!accountId || deletedAccounts.has(accountId) || !safeValue(value)) return false;
  const serialized = JSON.stringify({ accountId, expiresAt: Date.now() + JOURNEY_DRAFT_TTL, value });
  if (serialized.length > 100_000) return false;
  const task = storageTail.catch(() => undefined).then(async () => {
    if (await accountWasDeleted(accountId)) return false;
    await AsyncStorage.setItem(key(accountId, operation), serialized);
    return !deletedAccounts.has(accountId);
  });
  storageTail = task;
  return task.then(saved => saved, () => false);
}

export type JourneyDraftRead<T> = { status: "saved" | "missing" | "failed" | "blocked"; value: T | null };

export async function readJourneyDraftChecked<T>(accountId: string, operation: string): Promise<JourneyDraftRead<T>> {
  if (!accountId || deletedAccounts.has(accountId)) return { status: "blocked", value: null };
  await storageTail.catch(() => undefined);
  try {
    if (await accountWasDeleted(accountId)) return { status: "blocked", value: null };
    const raw = await AsyncStorage.getItem(key(accountId, operation));
    if (deletedAccounts.has(accountId)) return { status: "blocked", value: null };
    if (!raw) return { status: "missing", value: null };
    const entry = JSON.parse(raw);
    if (entry.accountId !== accountId || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now() || !safeValue(entry.value)) {
      const cleared = await clearJourneyDraftChecked(accountId, operation);
      return { status: cleared ? "missing" : "failed", value: null };
    }
    return { status: "saved", value: entry.value as T };
  } catch { return { status: "failed", value: null }; }
}

export async function readJourneyDraft<T>(accountId: string, operation: string): Promise<T | null> {
  return (await readJourneyDraftChecked<T>(accountId, operation)).value;
}

export async function clearJourneyDraftChecked(accountId: string, operation: string): Promise<boolean> {
  if (!accountId) return false;
  const task = storageTail.catch(() => undefined).then(() => AsyncStorage.removeItem(key(accountId, operation)));
  storageTail = task;
  return task.then(() => true, () => false);
}

export async function clearJourneyDraft(accountId: string, operation: string): Promise<void> {
  await clearJourneyDraftChecked(accountId, operation);
}

// Deletion is a permanent barrier for this account, not an ordinary logout.
// Queue after every pending write, then enumerate only this account's namespace.
export async function purgeJourneyDrafts(accountId: string): Promise<boolean> {
  if (!accountId) return true;
  deletedAccounts.add(accountId);
  const task = storageTail.catch(() => undefined).then(async () => {
    let cleared = true;
    try { await AsyncStorage.setItem(deletedKey(accountId), "deleted"); } catch { cleared = false; }
    const accountPrefix = `${prefix}${encodeURIComponent(accountId)}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter(item => item.startsWith(accountPrefix));
    const results = await Promise.allSettled(keys.map(item => AsyncStorage.removeItem(item)));
    return cleared && results.every(result => result.status === "fulfilled");
  });
  storageTail = task;
  return task.then(cleared => cleared, () => false);
}
