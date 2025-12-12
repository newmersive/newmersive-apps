import type { AllwainOffer } from "../config/api";

export type AllwainContract = {
  id: string;
  provider: string;
  product: string;
  monthlyCost?: number;
  currentSaving?: number;
  status: "confirmed" | "demo";
  note?: string;
  createdAt: string;
  offerId?: string;
};

const memory: { contracts: AllwainContract[] } = {
  contracts: [],
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = "ctr") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function listContracts(): AllwainContract[] {
  return memory.contracts;
}

export function addContractFromOffer(
  offer: AllwainOffer,
  note?: string,
): AllwainContract {
  const contract: AllwainContract = {
    id: uid(),
    provider: "Proveedor",
    product: offer.title ?? "Oferta aceptada",
    status: "confirmed",
    note: note ?? "Acuerdo confirmado (demo).",
    createdAt: nowIso(),
    offerId: offer.id,
  };

  memory.contracts = [contract, ...memory.contracts];
  return contract;
}

export function clearContracts() {
  memory.contracts = [];
}
