import { LeadGlobal, LeadGlobalSourceApp, LeadGlobalStatus } from "../shared/types";
import { addLeadGlobalPg, getLeadsGlobalPg } from "./data.store.pg";

interface CreateWhatsappLeadInput {
  name?: string;
  phone?: string;
  email?: string;
  message: string;
  sourceApp: LeadGlobalSourceApp;
  status?: LeadGlobalStatus;
}

export async function createWhatsappLead(input: CreateWhatsappLeadInput): Promise<LeadGlobal> {
  const lead: LeadGlobal = {
    id: `lead-global-${Date.now()}`,
    channel: "whatsapp",
    name: input.name,
    phone: input.phone,
    email: input.email,
    sourceApp: input.sourceApp,
    message: input.message,
    createdAt: new Date().toISOString(),
    status: input.status ?? "new",
  };

  return addLeadGlobalPg(lead);
}

export async function getGlobalLeads(): Promise<LeadGlobal[]> {
  return getLeadsGlobalPg();
}