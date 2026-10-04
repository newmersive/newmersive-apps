import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTextPdf } from "../src/services/pdf.service";

describe("PDF text encoding", () => {
  it("writes Spanish text with WinAnsi bytes and correct stream lengths", () => {
    const pdf = buildTextPdf({
      title: "Contrato válido",
      lines: [
        "Página con acentos: áéíóú, ñ y compensación de 15 €.",
        "Revisión y aceptación por ambas partes.",
      ],
    });
    const source = pdf.toString("latin1");
    const streams = [
      ...source.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g),
    ];

    assert.ok(streams.length > 0);
    for (const stream of streams) {
      assert.equal(
        Number(stream[1]),
        Buffer.byteLength(stream[2], "latin1"),
      );
    }
    assert.match(source, /Contrato v\\341lido/);
    assert.match(source, /P\\341gina con acentos/);
    assert.ok(source.includes("15 EUR"));
    assert.ok(!source.includes("Ã"));
    assert.ok(!source.includes("þÿ"));
  });
});
