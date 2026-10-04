import { apiAuthGet } from "../config/api";

export type PurchaseRecipient = {
  deliveryRecipientName?: string;
  deliveryEmail?: string;
  deliveryPhone?: string;
  deliveryUnit?: string;
  deliveryAddress: string;
  deliveryPostalCode?: string;
  deliveryCity?: string;
  deliveryCountryCode?: string;
  deliveryDetailsConfirmed?: boolean;
  saveDeliveryDetails?: boolean;
};

export async function loadPurchaseDetails(): Promise<PurchaseRecipient | null> {
  const response = await apiAuthGet<{ details: PurchaseRecipient | null }>("/allwain/purchase-details");
  return response.details;
}

export function recipientIssue(value: PurchaseRecipient, pickup: boolean): { field: keyof PurchaseRecipient; message: string } | null {
  if ((value.deliveryRecipientName || "").trim().length < 2) return { field: "deliveryRecipientName", message: "Indica el nombre completo de quien recibirá o recogerá el pedido." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value.deliveryEmail || "").trim())) return { field: "deliveryEmail", message: "Revisa el email de contacto." };
  const phone = (value.deliveryPhone || "").replace(/[\s().+-]/g, "");
  if (!/^\d{7,15}$/.test(phone)) return { field: "deliveryPhone", message: "Indica un teléfono de contacto válido, con prefijo si es necesario." };
  if (pickup) return null;
  if (value.deliveryAddress.trim().length < 4) return { field: "deliveryAddress", message: "Indica la calle y el número de entrega." };
  if (!/^\d{5}$/.test((value.deliveryPostalCode || "").trim())) return { field: "deliveryPostalCode", message: "Indica un código postal de España de cinco dígitos." };
  if ((value.deliveryCity || "").trim().length < 2) return { field: "deliveryCity", message: "Indica la localidad de entrega." };
  if ((value.deliveryCountryCode || "").trim().toUpperCase() !== "ES") return { field: "deliveryCountryCode", message: "Por ahora la entrega está disponible en España (ES)." };
  return null;
}

export function recipientSummary(value: PurchaseRecipient, pickup: boolean) {
  return pickup ? "Recogida en el punto acordado con el vendedor" : [value.deliveryAddress, value.deliveryUnit, [value.deliveryPostalCode, value.deliveryCity].filter(Boolean).join(" "), value.deliveryCountryCode].filter(Boolean).join(" · ");
}
