import assert from "node:assert/strict";
import { test } from "node:test";
import { extractAllwainDocumentFromText } from "../src/services/scan.service";

test("OCR table preserves product, quantity, unit price and total", () => {
  const result = extractAllwainDocumentFromText("TICKET\nLeche 2 unidades 1,50 EUR 3,00 EUR\nArroz 1 kg 2,20 EUR 2,20 EUR\nCafe 1 paquete 4,80 EUR 4,80 EUR\nTOTAL 10,00 EUR");
  assert.deepEqual(result?.items.map(x => [x.productName,x.quantity,x.unit,x.unitPrice,x.lineTotal]), [
    ["Leche",2,"ud",1.5,3], ["Arroz",1,"kg",2.2,2.2], ["Cafe",1,"pack",4.8,4.8],
  ]);
});
test("ambiguous amounts are not silently interpreted as matching columns", () => {
  const result=extractAllwainDocumentFromText("TICKET\nLeche 2 unidades 1,50 EUR 7,00 EUR");
  assert.notEqual(result?.items[0].productName,"Leche");
});
