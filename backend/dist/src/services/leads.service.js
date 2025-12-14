"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWhatsappLead = createWhatsappLead;
exports.getGlobalLeads = getGlobalLeads;
const data_store_pg_1 = require("./data.store.pg");
async function createWhatsappLead(input) {
    const lead = {
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
    return (0, data_store_pg_1.addLeadGlobalPg)(lead);
}
async function getGlobalLeads() {
    return (0, data_store_pg_1.getLeadsGlobalPg)();
}
