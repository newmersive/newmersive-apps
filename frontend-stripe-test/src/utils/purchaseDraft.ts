import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { OfferDeliveryDraft } from "../components/OfferOrderForm";

export const PURCHASE_DRAFT_TTL = 4 * 60 * 60 * 1000;
export type PurchaseDraft = { quantity: number; step: number; delivery: OfferDeliveryDraft; purchaseKey: string };
type Envelope = PurchaseDraft & { version: 1; userId: string; offerId: string; savedAt: number };
type Driver = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
const driver: Driver = {
  async getItem(key) { return Platform.OS === "web" ? globalThis.sessionStorage.getItem(key) : SecureStore.getItemAsync(key); },
  async setItem(key, value) { if (Platform.OS === "web") globalThis.sessionStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value); },
  async removeItem(key) { if (Platform.OS === "web") globalThis.sessionStorage.removeItem(key); else await SecureStore.deleteItemAsync(key); },
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
  const queues = new Map<string, Promise<unknown>>();
  const encode = (value: string) => Array.from(value).map((character) => character.codePointAt(0)!.toString(16)).join("_");
  const key = (userId: string, offerId: string) => `allwain.purchase.v1.${encode(userId)}.${encode(offerId)}`;
  const queued = <T>(storageKey: string, operation: () => Promise<T>): Promise<T> => {
    const task = (queues.get(storageKey) || Promise.resolve()).catch(() => undefined).then(operation);
    queues.set(storageKey, task);
    return task;
  };
  const valid = (entry: Envelope, userId: string, offerId: string) => entry?.version === 1 && entry.userId === userId && entry.offerId === offerId && Number.isFinite(entry.savedAt) && entry.savedAt <= now() + 60_000 && now() - entry.savedAt < PURCHASE_DRAFT_TTL && Number.isFinite(entry.quantity) && entry.quantity > 0 && Number.isInteger(entry.step) && entry.step >= 1 && entry.step <= 6 && typeof entry.purchaseKey === "string" && entry.purchaseKey.length > 0 && entry.purchaseKey.length < 200 && entry.delivery && ["local_connector", "carrier", "seller", "pickup"].includes(entry.delivery.deliveryChannel);
  return {
    async read(userId: string, offerId: string): Promise<{ draft: PurchaseDraft | null; error?: string }> {
      if (!userId || !offerId) return { draft: null };
      const storageKey = key(userId, offerId);
      if (removedInSession.has(storageKey)) return { draft: null };
      try {
        const raw = await queued(storageKey, () => storage.getItem(storageKey));
        const entry: Envelope | undefined = memory.get(storageKey) || (raw ? JSON.parse(raw) : undefined);
        if (!entry) return { draft: null };
        if (!valid(entry, userId, offerId)) { memory.delete(storageKey); await queued(storageKey, () => storage.removeItem(storageKey)); return { draft: null }; }
        return { draft: { ...entry, delivery: editablePurchaseDelivery(entry.delivery) } };
      } catch {
        const entry = memory.get(storageKey);
        return { draft: entry && valid(entry, userId, offerId) ? { ...entry, delivery: editablePurchaseDelivery(entry.delivery) } : null, error: "El navegador o el dispositivo no permite recuperar el borrador guardado. Puedes continuar, pero recargar podría perder los cambios." };
      }
    },
    async save(userId: string, offerId: string, draft: PurchaseDraft): Promise<{ saved: boolean; error?: string }> {
      if (!userId || !offerId) return { saved: false, error: "Identifícate para guardar este borrador." };
      const storageKey = key(userId, offerId);
      removedInSession.delete(storageKey);
      const entry: Envelope = { ...draft, delivery: editablePurchaseDelivery(draft.delivery), version: 1, userId, offerId, savedAt: now() };
      memory.set(storageKey, entry);
      try { await queued(storageKey, () => storage.setItem(storageKey, JSON.stringify(entry))); return { saved: true }; }
      catch { return { saved: false, error: "No se ha podido guardar en este dispositivo. Tu edición sigue abierta: reintenta antes de salir o descártala expresamente." }; }
    },
    async remove(userId: string, offerId: string): Promise<boolean> {
      const storageKey = key(userId, offerId);
      memory.delete(storageKey);
      removedInSession.add(storageKey);
      try { await queued(storageKey, () => storage.removeItem(storageKey)); return true; } catch { return false; }
    },
  };
}

export const purchaseDraftStore = createPurchaseDraftStore();
