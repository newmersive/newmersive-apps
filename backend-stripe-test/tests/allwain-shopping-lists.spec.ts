import assert from "node:assert";
import { describe, it } from "node:test";

import { parseAllwainShoppingListText } from "../src/services/allwain-shopping-lists.service";
import { assessAllwainPublicationRules } from "../src/services/allwain-publication-quality.service";

describe("Allwain shopping-list import", () => {
  it("allows a buyer request without an invented target price", () => {
    const review = assessAllwainPublicationRules({
      entityType: "request",
      title: "Leche semidesnatada",
      description: "Necesito seis litros para la compra semanal de la oficina.",
      quantity: 6,
      unit: "l",
      price: null,
      currency: "EUR",
      deliveryWindow: "El próximo viernes",
    });

    assert.equal(review.decision, "approve");
    assert.equal(
      review.issues.some((issue) => issue.code === "INVALID_TARGET_PRICE"),
      false,
    );
  });

  it("understands a natural multi-product list and infers structured units", () => {
    const result = parseAllwainShoppingListText(
      ["10 kg de naranjas a 1,20 EUR/kg", "2 lavadoras", "Leche 6 l"].join(
        "\n",
      ),
    );

    assert.equal(result.items.length, 3);
    assert.deepEqual(
      result.items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        target: item.targetUnitPrice,
      })),
      [
        { name: "naranjas", quantity: 10, unit: "kg", target: 1.2 },
        { name: "lavadoras", quantity: 2, unit: "ud", target: null },
        { name: "Leche", quantity: 6, unit: "l", target: null },
      ],
    );
    assert.equal(result.items[0].productKind, "produce_weight");
    assert.equal(result.items[1].productKind, "appliance");
  });

  it("uses a real CSV header map and keeps notes", () => {
    const result = parseAllwainShoppingListText(
      [
        "Producto;Cantidad;Unidad;Precio objetivo;Notas",
        "Tomates;12;kg;1,50;Maduros",
        "Cajas de cartón;8;caja;;Recicladas",
      ].join("\n"),
    );

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].productName, "Tomates");
    assert.equal(result.items[0].quantity, 12);
    assert.equal(result.items[0].unit, "kg");
    assert.equal(result.items[0].targetUnitPrice, 1.5);
    assert.equal(result.items[1].notes, "Recicladas");
  });

  it("rejects empty and oversized imports", () => {
    assert.throws(
      () => parseAllwainShoppingListText("  "),
      /EMPTY_SHOPPING_LIST_IMPORT/,
    );
    assert.throws(
      () =>
        parseAllwainShoppingListText(
          Array.from(
            { length: 101 },
            (_, index) => `1 unidad Producto ${index}`,
          ).join("\n"),
        ),
      /TOO_MANY_SHOPPING_LIST_ITEMS/,
    );
  });
});
