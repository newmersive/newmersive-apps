import { DemoContractInput } from "../shared/types";

export function generateDemoContract(input: DemoContractInput): string {
  return `CONTRATO DEMO\nOferta: ${input.offerTitle}\nSolicitante: ${input.requesterName}\nProveedor: ${input.providerName}\nTokens: ${input.tokens}`;
}
