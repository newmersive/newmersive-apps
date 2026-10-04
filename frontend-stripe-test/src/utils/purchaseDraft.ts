import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { OfferDeliveryDraft } from "../components/OfferOrderForm";

export const PURCHASE_DRAFT_TTL = 4 * 60 * 60 * 1000;
export type PurchaseDraft = { quantity: number; step: number; delivery: OfferDeliveryDraft; purchaseKey: string };
type Envelope = PurchaseDraft & { version: 1; userId: string; offerId: string; savedAt: number };
type Driver = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void>; listKeys?(): Promise<string[] | null> };
const driver: Driver = {
  async getItem(key) { return Platform.OS === "web" ? globalThis.sessionStorage.getItem(key) : SecureStore.getItemAsync(key); },
  async setItem(key, value) { if (Platform.OS === "web") globalThis.sessionStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value); },
  async removeItem(key) { if (Platform.OS === "web") globalThis.sessionStorage.removeItem(key); else await SecureStore.deleteItemAsync(key); },
  async listKeys() { return Platform.OS === "web" ? Array.from({ length: globalThis.sessionStorage.length }, (_, index) => globalThis.sessionStorage.key(index)).filter((value): value is string => Boolean(value)) : null; },
};

// Persist only editable fields. Consent and shipping quotes must be checked again.
export function editablePurchaseDelivery(value: OfferDeliveryDraft): OfferDeliveryDraft {
  return {
    buyerCapacity: value.buyerCapacity === "business" ? "business" : "consumer",
    deliveryMethod: value.deliveryMethod,
    deliveryChannel: value.deliveryChannel,
    deliveryRecipientName: value.deliveryRecipientName?.slice(0, 160),
    deliveryEmail: value.deliveryEmail?.slice(0, 254),
    deliveryPhone: value.deliveryPhone?.slice(0, 40),
    deliveryAddress: (value.deliveryAddress || "").slice(0, 400),
    deliveryUnit: value.deliveryUnit?.slice(0, 120),
    deliveryPostalCode: value.deliveryPostalCode?.slice(0, 20),
    deliveryCity: value.deliveryCity?.slice(0, 120),
    deliveryCountryCode: value.deliveryCountryCode?.slice(0, 2),
    deliveryNotes: (value.deliveryNotes || "").slice(0, 600),
    deliveryWindow: value.deliveryWindow,
    recurringOrder: value.recurringOrder,
    deliveryLatitude: value.deliveryLatitude,
    deliveryLongitude: value.deliveryLongitude,
    commercialTermsAccepted: false,
    recurringMandateAccepted: false,
    deliveryDetailsConfirmed: false,
    saveDeliveryDetails: false,
  };
}

export function createPurchaseDraftStore(storage: Driver = driver, now: () => number = Date.now) {
  const memory = new Map<string, Envelope>();
  const removedInSession = new Set<string>();
  const deletedAccounts = new Set<string>();
  const knownKeys = new Set<string>();
  const queues = new Map<string, Promise<unknown>>();
  const encode = (value: string) => Array.from(value).map((character) => character.codePointAt(0)!.toString(16)).join("_");
  const key = (userId: string, offerId: string) => `allwain.purchase.v1.${encode(userId)}.${encode(offerId)}`;
  const accountPrefix = (userId: string) => `allwain.purchase.v1.${encode(userId)}.`;
  const indexKey = (userId: string) => `allwain.purchase.index.v1.${encode(userId)}`;
  const deletedKey = (userId: string) => `allwain.purchase.deleted.v1.${encode(userId)}`;
  const queued = <T>(storageKey: string, operation: () => Promise<T>): Promise<T> => {
    const task = (queues.get(storageKey) || Promise.resolve()).catch(() => undefined).then(operation);
    queues.set(storageKey, task);
    return task;
  };
  const accountWasDeleted = async (userId: string) => {
    if (deletedAccounts.has(userId)) return true;
    if (await storage.getItem(deletedKey(userId))) deletedAccounts.add(userId);
    return deletedAccounts.has(userId);
  };
  const indexedKeys = async (userId: string) => {
    const raw = await storage.getItem(indexKey(userId));
    if (!raw) return [] as string[];
    const keys: unknown = JSON.parse(raw);
    if (!Array.isArray(keys) || keys.some(item => typeof item !== "string" || !item.startsWith(accountPrefix(userId)))) throw new Error("Invalid account draft index");
    return keys as string[];
  };
  const updateIndex = (userId: string, storageKey: string, include: boolean) => queued(indexKey(userId), async () => {
    if (include && deletedAccounts.has(userId)) return;
    const keys = new Set(await indexedKeys(userId));
    if (include) keys.add(storageKey); else keys.delete(storageKey);
    if (keys.size) await storage.setItem(indexKey(userId), JSON.stringify([...keys]));
    else await storage.removeItem(indexKey(userId));
  });
  const valid = (entry: Envelope, userId: string, offerId: string) => entry?.version === 1 && entry.userId === userId && entry.offerId === offerId && Number.isFinite(entry.savedAt) && entry.savedAt <= now() + 60_000 && now() - entry.savedAt < PURCHASE_DRAFT_TTL && Number.isFinite(entry.quantity) && entry.quantity > 0 && Number.isInteger(entry.step) && entry.step >= 1 && entry.step <= 6 && typeof entry.purchaseKey === "string" && entry.purchaseKey.length > 0 && entry.purchaseKey.length < 200 && entry.delivery && ["local_connector", "carrier", "seller", "pickup"].includes(entry.delivery.deliveryChannel);
  return {
    async read(userId: string, offerId: string): Promise<{ draft: PurchaseDraft | null; error?: string }> {
      if (!userId || !offerId || deletedAccounts.has(userId)) return { draft: null };
      const storageKey = key(userId, offerId);
      knownKeys.add(storageKey);
      if (removedInSession.has(storageKey)) return { draft: null };
      try {
        if (await accountWasDeleted(userId)) {
          memory.delete(storageKey);
          await queued(storageKey, () => storage.removeItem(storageKey));
          return { draft: null };
        }
        const raw = await queued(storageKey, () => storage.getItem(storageKey));
        if (deletedAccounts.has(userId) || removedInSession.has(storageKey)) return { draft: null };
        const entry: Envelope | undefined = memory.get(storageKey) || (raw ? JSON.parse(raw) : undefined);
        if (!entry) return { draft: null };
        if (!valid(entry, userId, offerId)) { memory.delete(storageKey); await queued(storageKey, () => storage.removeItem(storageKey)); await updateIndex(userId, storageKey, false); return { draft: null }; }
        // Migrate an accessed legacy native draft into the enumerable account index.
        await updateIndex(userId, storageKey, true);
        if (deletedAccounts.has(userId) || removedInSession.has(storageKey)) return { draft: null };
        return { draft: { ...entry, delivery: editablePurchaseDelivery(entry.delivery) } };
      } catch {
        if (deletedAccounts.has(userId) || removedInSession.has(storageKey)) return { draft: null };
        const entry = memory.get(storageKey);
        return { draft: entry && valid(entry, userId, offerId) ? { ...entry, delivery: editablePurchaseDelivery(entry.delivery) } : null, error: "El navegador o el dispositivo no permite recuperar el borrador guardado. Puedes continuar, pero recargar podría perder los cambios." };
      }
    },
    async save(userId: string, offerId: string, draft: PurchaseDraft): Promise<{ saved: boolean; error?: string }> {
      if (!userId || !offerId || deletedAccounts.has(userId)) return { saved: false, error: "Identifícate con una cuenta activa para guardar este borrador." };
      const storageKey = key(userId, offerId);
      knownKeys.add(storageKey);
      removedInSession.delete(storageKey);
      const entry: Envelope = { ...draft, delivery: editablePurchaseDelivery(draft.delivery), version: 1, userId, offerId, savedAt: now() };
      memory.set(storageKey, entry);
      try {
        const saved = await queued(storageKey, async () => {
          if (await accountWasDeleted(userId)) return false;
          // Persist the index first: a terminated process must not leave an unlisted draft.
          await updateIndex(userId, storageKey, true);
          if (deletedAccounts.has(userId)) return false;
          await storage.setItem(storageKey, JSON.stringify(entry));
          return !deletedAccounts.has(userId);
        });
        if (!saved) { memory.delete(storageKey); return { saved: false, error: "Esta cuenta se ha eliminado. El borrador no se guardará." }; }
        return { saved: true };
      }
      catch { return { saved: false, error: "No se ha podido guardar en este dispositivo. Tu edición sigue abierta: reintenta antes de salir o descártala expresamente." }; }
    },
    async remove(userId: string, offerId: string): Promise<boolean> {
      const storageKey = key(userId, offerId);
      memory.delete(storageKey);
      removedInSession.add(storageKey);
      try { await queued(storageKey, () => storage.removeItem(storageKey)); await updateIndex(userId, storageKey, false); return true; } catch { return false; }
    },
    async purgeAccount(userId: string): Promise<boolean> {
      if (!userId) return true;
      deletedAccounts.add(userId);
      const prefix = accountPrefix(userId);
      for (const storageKey of memory.keys()) if (storageKey.startsWith(prefix)) memory.delete(storageKey);
      // New writes are blocked synchronously. Wait for writes already in storage.
      await Promise.allSettled([...queues].filter(([storageKey]) => storageKey.startsWith(prefix) || storageKey === indexKey(userId)).map(([, task]) => task));
      let cleared = true;
      try { await storage.setItem(deletedKey(userId), "deleted"); } catch { cleared = false; }
      const keys = new Set([...knownKeys].filter(storageKey => storageKey.startsWith(prefix)));
      let indexReadable = true;
      try { for (const storageKey of await indexedKeys(userId)) keys.add(storageKey); }
      catch { cleared = false; indexReadable = false; }
      try { for (const storageKey of await storage.listKeys?.() || []) if (storageKey.startsWith(prefix)) keys.add(storageKey); } catch { cleared = false; }
      const failed: string[] = [];
      await Promise.all([...keys].map(async storageKey => {
        memory.delete(storageKey); removedInSession.add(storageKey);
        try { await storage.removeItem(storageKey); knownKeys.delete(storageKey); }
        catch { cleared = false; failed.push(storageKey); }
      }));
      try {
        // Do not discard an unreadable index and then report a successful retry:
        // native secure storage cannot enumerate any keys it may have named.
        if (indexReadable) {
          if (failed.length) await storage.setItem(indexKey(userId), JSON.stringify(failed));
          else await storage.removeItem(indexKey(userId));
        }
      } catch { cleared = false; }
      return cleared;
    },
  };
}

export const purchaseDraftStore = createPurchaseDraftStore();
