"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContractText = generateContractText;
async function generateContractText(payload) {
    return `Contrato generado (versión demo) para: ${payload.title || "Sin título"}.
  
Solicitante: ${payload.requesterName || "Solicitante"}
Proveedor: ${payload.providerName || "Proveedor"}
Tokens: ${payload.tokens || 0}
  
NOTA: Esta es una versión demostrativa sin validez legal.`;
}
