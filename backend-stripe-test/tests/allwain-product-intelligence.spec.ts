import assert from "node:assert";
import { describe, it } from "node:test";

import {
  applyAllwainProductIntelligence,
  inferAllwainVisualIdentity,
  normalizeAllwainUnit,
} from "../src/services/allwain-product-intelligence";

describe("Allwain product intelligence", () => {
  it("uses units for a television and kilograms for oranges", () => {
    const television = applyAllwainProductIntelligence({
      productName: "Televisor OLED de 55 pulgadas",
      confidence: 0.6,
    });
    const oranges = applyAllwainProductIntelligence({
      productName: "Naranjas valencianas",
      confidence: 0.6,
    });

    assert.equal(television.productKind, "electronics");
    assert.equal(television.unit, "ud");
    assert.equal(television.measurement?.quantityLabel, "Unidades");
    assert.equal(oranges.productKind, "produce_weight");
    assert.equal(oranges.unit, "kg");
    assert.equal(oranges.measurement?.quantityLabel, "Kilos");
  });

  it("keeps the requested quantity unit ahead of the package weight", () => {
    const coffee = applyAllwainProductIntelligence(
      {
        productName: "Cafe de origen 250 g",
        quantity: 24,
        unit: "uds",
        rawText: "Producto: Cafe de origen 250 g\nCantidad: 24 uds",
        confidence: 0.8,
      },
      { rawText: "Producto: Cafe de origen 250 g\nCantidad: 24 uds" },
    );

    assert.equal(coffee.unit, "ud");
  });

  it("turns strong visual signals into useful product identities", () => {
    assert.equal(
      inferAllwainVisualIdentity([], [{ name: "Washing machine", confidence: 0.91 }])?.productName,
      "Lavadora",
    );
    assert.equal(
      inferAllwainVisualIdentity([], [{ name: "Car", confidence: 0.88 }])?.productName,
      "Coche",
    );
    assert.equal(
      inferAllwainVisualIdentity([{ name: "Orange", confidence: 0.93 }], [])?.productName,
      "Naranjas",
    );
  });

  it("does not confuse an appliance capacity with the order unit", () => {
    const washingMachine = applyAllwainProductIntelligence(
      {
        productName: "Washing machine",
        quantity: null,
        unit: "l",
        rawText: "Capacidad 9 L",
        confidence: 0.43,
      },
      {
        rawText: "Capacidad 9 L",
        labels: [{ name: "Washing machine", confidence: 0.98 }],
        objects: [],
        unitSource: "model",
      },
    );

    assert.equal(washingMachine.productName, "Lavadora");
    assert.equal(washingMachine.productKind, "appliance");
    assert.equal(washingMachine.quantity, 1);
    assert.equal(washingMachine.unit, "ud");
    assert.equal(washingMachine.measurement?.quantityLabel, "Unidades");
    assert.ok(washingMachine.confidence >= 0.95);
  });

  it("does not turn a control-panel number into the appliance name or quantity", () => {
    const washingMachine = applyAllwainProductIntelligence(
      {
        productName: "25",
        quantity: 25,
        unit: "l",
        rawText: "25\n9 L",
        confidence: 0.43,
      },
      {
        rawText: "25\n9 L",
        labels: [{ name: "Washing machine", confidence: 0.98 }],
        objects: [],
        unitSource: "model",
      },
    );

    assert.equal(washingMachine.productName, "Lavadora");
    assert.equal(washingMachine.quantity, 1);
    assert.equal(washingMachine.unit, "ud");
    assert.ok(washingMachine.confidence >= 0.95);
  });

  it("overrides a weight read from a countable appliance", () => {
    const television = applyAllwainProductIntelligence(
      {
        productName: "Televisor OLED 65 pulgadas",
        unit: "kg",
        confidence: 0.6,
      },
      { rawText: "Televisor OLED 65 pulgadas", unitSource: "model" },
    );
    assert.equal(television.productKind, "electronics");
    assert.equal(television.unit, "ud");
  });

  it("normalizes the units used by multi-product shopping lists", () => {
    assert.equal(normalizeAllwainUnit("paquetes"), "pack");
    assert.equal(normalizeAllwainUnit("sacos"), "saco");
    assert.equal(normalizeAllwainUnit("rollos"), "rollo");
    assert.equal(normalizeAllwainUnit("pares"), "par");
    assert.equal(normalizeAllwainUnit("servicios"), "servicio");
    assert.equal(normalizeAllwainUnit("horas"), "hora");
  });
});
