import assert from "node:assert";
import { describe, it } from "node:test";

import {
  buildSafeAllwainSupportReply,
  classifyAllwainSupportMessage,
} from "../src/services/allwain-support.service";

describe("Allwain support safety", () => {
  it("allows only known low-risk help topics to become automatic replies", () => {
    const triage = classifyAllwainSupportMessage(
      "Como empiezo",
      "Quiero activar vendedor y publicar una oferta",
    );

    assert.equal(triage.category, "seller");
    assert.equal(triage.riskLevel, "low");
    assert.equal(triage.autoReplyEligible, true);
    assert.match(buildSafeAllwainSupportReply(triage) || "", /Activar vendedor/);
  });

  it("requires human review for payments and refunds", () => {
    const triage = classifyAllwainSupportMessage(
      "Cobro no reconocido",
      "Quiero un reembolso de mi tarjeta",
    );

    assert.equal(triage.riskLevel, "high");
    assert.equal(triage.autoReplyEligible, false);
    assert.equal(buildSafeAllwainSupportReply(triage), null);
  });

  it("requires human review for account access, legal, tax and privacy requests", () => {
    const messages = [
      "No puedo acceder a mi cuenta",
      "Necesito una factura con IVA",
      "Quiero ejercer mis derechos de privacidad RGPD",
      "Creo que han hackeado mi usuario",
    ];

    for (const body of messages) {
      const triage = classifyAllwainSupportMessage("Ayuda", body);
      assert.equal(triage.riskLevel, "high", body);
      assert.equal(triage.autoReplyEligible, false, body);
    }
  });

  it("does not invent an answer for an unrecognized request", () => {
    const triage = classifyAllwainSupportMessage(
      "Tengo una duda",
      "La pantalla no hace lo que esperaba",
    );

    assert.equal(triage.autoReplyEligible, false);
    assert.equal(buildSafeAllwainSupportReply(triage), null);
  });
});
