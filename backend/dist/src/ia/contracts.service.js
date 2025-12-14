"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDemoContract = generateDemoContract;
function generateDemoContract(input) {
    return `CONTRATO DEMO\nOferta: ${input.offerTitle}\nSolicitante: ${input.requesterName}\nProveedor: ${input.providerName}\nTokens: ${input.tokens}`;
}
