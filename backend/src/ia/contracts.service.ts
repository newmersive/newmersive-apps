export function generateDemoContract(input: any): string {
  return `CONTRATO DEMO\nOferta: ${input.offerTitle}\nSolicitante: ${input.requesterName}\nProveedor: ${input.providerName}\nTokens: ${input.tokens}`;
}