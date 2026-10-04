const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  "aviso-legal", "privacidad", "eliminar-cuenta", "soporte", "seguridad",
  "delete-account", "privacy", "terms", "cookies", "terminos",
  path.join("oauth", "privacy"), path.join("oauth", "terms"),
];
const publicLogo = path.join(root, "public", "legal-assets", "allwain-wordmark.png");

it("ships a self-contained wordmark for every public legal page", () => {
  assert.ok(fs.statSync(publicLogo).size > 1_000);
  const png = fs.readFileSync(publicLogo);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");

  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, "public", page, "index.html"), "utf8");
    assert.match(html, /src="\/legal-assets\/allwain-wordmark\.png\?v=20260910"/);
    assert.doesNotMatch(html, /src="\/web\/assets\/brand\/allwain-wordmark\.png"/);
  }
});
