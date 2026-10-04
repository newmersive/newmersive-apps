import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAllwainTaxSettlement } from "../src/services/allwain-compliance.service";

const baseOrder = {
  subtotalAmount: 1_500,
  shippingAmount: 0,
  platformFeeAmount: 150,
  connectorFeeAmount: 3,
  connectorPlatformShareAmount: 3,
  connectorDeliveryAmount: 0,
};

const localDeliveryOrder = {
  ...baseOrder,
  shippingAmount: 200,
  connectorFeeAmount: 203,
  connectorDeliveryAmount: 200,
};

const platformInvoice = {
  documentType: "platform_service_invoice",
  issuer: "platform",
  recipient: "seller",
  amountSource: "platform_fee",
  taxMode: "included",
  taxRateBps: 2_100,
  legalBasis: "Tratamiento validado por asesor para los servicios de plataforma.",
};

describe("Allwain legal settlement", () => {
  it("models an approved REAGP consumer sale without VAT or compensation", () => {
    const result = calculateAllwainTaxSettlement(baseOrder, {
      treatmentCode: "ES_REAGP_OWN_PRODUCTION_B2C",
      taxMode: "none",
      taxRateBps: 0,
      compensationMode: "none",
      agriculturalCompensationRateBps: 0,
      legalBasis: "Operación REAGP validada por asesor.",
      requiredDocuments: [
        {
          documentType: "purchase_receipt",
          issuer: "seller",
          recipient: "buyer",
          amountSource: "order_total",
          taxMode: "none",
          taxRateBps: 0,
          legalBasis: "Recibo de venta directa validado por asesor.",
        },
        platformInvoice,
      ],
    });

    assert.equal(result.taxAmount, 0);
    assert.equal(result.compensationAmount, 0);
    assert.equal(result.grossAmount, 1_500);
    assert.equal(result.sellerAmount, 1_350);
    assert.equal(
      result.sellerAmount + result.platformNetFeeAmount + result.connectorAmount,
      result.grossAmount,
    );
  });

  it("adds an adviser-approved REAGP compensation to an eligible business sale", () => {
    const result = calculateAllwainTaxSettlement(baseOrder, {
      treatmentCode: "ES_REAGP_OWN_PRODUCTION_B2B_COMPENSATION",
      taxMode: "none",
      taxRateBps: 0,
      compensationMode: "added",
      agriculturalCompensationRateBps: 1_200,
      compensationBaseSources: ["product"],
      legalBasis: "Compensación agraria validada por asesor.",
      requiredDocuments: [
        {
          documentType: "reagp_compensation_receipt",
          issuer: "buyer",
          recipient: "seller",
          signatureBy: "seller",
          signatureRequired: true,
          amountSource: "compensation",
          taxMode: "none",
          taxRateBps: 0,
          legalBasis: "Recibo de compensación validado por asesor.",
        },
        platformInvoice,
      ],
    });

    assert.equal(result.compensationAmount, 180);
    assert.equal(result.grossAmount, 1_680);
    assert.equal(result.sellerAmount, 1_530);
    assert.equal(
      result.sellerAmount + result.platformNetFeeAmount + result.connectorAmount,
      result.grossAmount,
    );
  });

  it("extracts included VAT without adding it again to the checkout total", () => {
    const result = calculateAllwainTaxSettlement(baseOrder, {
      treatmentCode: "ES_GENERAL_INCLUDED",
      taxMode: "included",
      taxRateBps: 2_100,
      taxBaseSources: ["product"],
      compensationMode: "none",
      agriculturalCompensationRateBps: 0,
      legalBasis: "IVA incluido validado por asesor.",
      requiredDocuments: [
        {
          documentType: "invoice",
          issuer: "seller",
          recipient: "buyer",
          amountSource: "product",
          taxMode: "order",
          taxRateBps: 0,
          legalBasis: "Factura validada por asesor.",
        },
        platformInvoice,
      ],
    });

    assert.equal(result.taxAmount, 260);
    assert.equal(result.grossAmount, 1_500);
  });

  it("keeps a Km0 delivery separate from product revenue and platform commission", () => {
    const result = calculateAllwainTaxSettlement(localDeliveryOrder, {
      treatmentCode: "ES_REAGP_OWN_PRODUCTION_B2C",
      taxMode: "none",
      taxRateBps: 0,
      compensationMode: "none",
      agriculturalCompensationRateBps: 0,
      legalBasis: "Operación REAGP validada por asesor.",
      requiredDocuments: [platformInvoice],
    });

    assert.equal(result.grossAmount, 1_700);
    assert.equal(result.productAmount, 1_500);
    assert.equal(result.shippingAmount, 200);
    assert.equal(result.sellerAmount, 1_350);
    assert.equal(result.connectorPlatformShareAmount, 3);
    assert.equal(result.connectorDeliveryAmount, 200);
    assert.equal(result.connectorAmount, 203);
    assert.equal(result.platformNetFeeAmount, 147);
  });

  it("rejects fiscal rules that omit a legal document plan", () => {
    assert.throws(
      () =>
        calculateAllwainTaxSettlement(baseOrder, {
          taxMode: "none",
          taxRateBps: 0,
          compensationMode: "none",
          agriculturalCompensationRateBps: 0,
        }),
      /INVALID_TAX_DOCUMENT_PLAN/,
    );
  });

  it("rejects a tax rate whose taxable components were not approved explicitly", () => {
    assert.throws(
      () =>
        calculateAllwainTaxSettlement(baseOrder, {
          taxMode: "added",
          taxRateBps: 2_100,
          compensationMode: "none",
          agriculturalCompensationRateBps: 0,
          requiredDocuments: [platformInvoice],
        }),
      /INVALID_TAX_BASE_SOURCES/,
    );
  });
});
