import {
  addGlobalLead,
  getGlobalLeads as getGlobalLeadsFromStore,
} from "./data.store";
import {
  LeadGlobal,
  LeadGlobalSourceApp,
  LeadGlobalStatus,
} from "../shared/types";

interface CreateWhatsappLeadInput {
  name?: string;
  phone?: string;
  email?: string;
  message: string;
  sourceApp: LeadGlobalSourceApp;
  status?: LeadGlobalStatus;
}

export function createWhatsappLead(
  input: CreateWhatsappLeadInput
): LeadGlobal {
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

  return addGlobalLead(lead);
}

export function getGlobalLeads(): LeadGlobal[] {
  return getGlobalLeadsFromStore();
}
