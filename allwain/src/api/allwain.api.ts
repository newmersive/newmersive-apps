import { apiAuthGet } from "../config/api";

export interface Offer {
  id: string;
  title: string;
  description: string;
  tokens: number;
  owner: "allwain" | "trueqia";
  category: string;
}

export interface ScanDemoResponse {
  result: string;
  productName?: string;
  suggestions?: string[];
  user?: string;
  demoMode?: boolean;
}

export async function getAllwainOffers(): Promise<Offer[]> {
  const res = await apiAuthGet<{ items?: Offer[] }>("/allwain/offers");
  return res.items || [];
}

export async function getAllwainScanDemo(): Promise<ScanDemoResponse> {
  return apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
}
