import { Offer, User } from "../shared/types";

interface GenerateTrueqiaContractParams {
  offer: Offer;
  fromUser: User;
  toUser: User;
  tokens: number;
}

export function generateTrueqiaContract({
  offer,
  fromUser,
  toUser,
  tokens,
}: GenerateTrueqiaContractParams): string {
  const today = new Date().toISOString().slice(0, 10);
  return `CONTRATO DEMO TRUEQIA\n` +
    `Fecha: ${today}\n` +
    `Oferta: ${offer.title}\n` +
    `Solicitante: ${fromUser.name} (ID: ${fromUser.id})\n` +
    `Proveedor: ${toUser.name} (ID: ${toUser.id})\n` +
    `Tokens acordados: ${tokens}\n` +
    `\n` +
    `1. Alcance: Las partes acuerdan un trueque basado en la oferta descrita.` +
    ` ${offer.description}` +
    `\n` +
    `2. Responsabilidades: El solicitante se compromete a entregar los tokens indicados y el proveedor a ejecutar la oferta.` +
    `\n` +
    `3. Plazos: Las partes coordinarán fechas y entregables de mutuo acuerdo.` +
    `\n` +
    `4. Confidencialidad y resolución: Este contrato es una demo; cualquier conflicto se manejará de buena fe.`;
}
