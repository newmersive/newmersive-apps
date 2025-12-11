export async function generateContractText(payload: any): Promise<string> {
  return `Contrato generado (versión demo) para: ${payload.title || "Sin título"}.
  
Solicitante: ${payload.requesterName || "Solicitante"}
Proveedor: ${payload.providerName || "Proveedor"}
Tokens: ${payload.tokens || 0}
  
NOTA: Esta es una versión demostrativa sin validez legal.`;
}
