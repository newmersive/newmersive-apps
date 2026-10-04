const assert = require("node:assert/strict");
const { it } = require("node:test");
const load = require("./helpers/load-typescript.cjs");

const names = [
  "ai-service", "bicycle", "car", "coffee", "cold-brew", "design",
  "general", "honey", "laptop", "olive-oil", "oranges", "packaging",
  "plumbing", "professional-service", "rice", "television", "tomatoes",
  "vehicle-service", "washing-machine",
];
const replacements = Object.fromEntries(
  names.map((name) => [`../../assets/card-images/${name}.jpg`, `asset:${name}`]),
);
const { bundledAllwainCardImageSource, inferredAllwainCardImageSource } = load("src/data/cardImages.ts", replacements);

const apiBaseUrl = "https://api.allwain.es/api";
const resolve = (imageUrl, source) => bundledAllwainCardImageSource({ apiBaseUrl, imageUrl, source });

it("maps every curated API card image to its bundled copy", () => {
  for (const name of names) {
    assert.equal(
      resolve(`https://api.allwain.es/api/allwain/media/card-images/${name}.jpg?v=9`),
      `asset:${name}`,
    );
  }
});

it("maps supported relative API card-image URLs", () => {
  assert.equal(resolve("allwain/media/card-images/oranges.jpg?v=1"), "asset:oranges");
  assert.equal(resolve("/api/allwain/media/card-images/television.jpg"), "asset:television");
});

it("does not replace uploads, arbitrary files or another origin", () => {
  assert.equal(resolve("https://api.allwain.es/api/allwain/media/uploads/photo.jpg"), null);
  assert.equal(resolve("https://images.example/api/allwain/media/card-images/oranges.jpg"), null);
  assert.equal(resolve("https://api.allwain.es/api/allwain/media/card-images/unknown.jpg"), null);
});

it("can recognize a curated URL passed through the source prop", () => {
  assert.equal(
    resolve(null, { uri: "https://api.allwain.es/api/allwain/media/card-images/honey.jpg?v=1" }),
    "asset:honey",
  );
  assert.equal(resolve(null, 42), null);
});

it("recovers a bundled illustration from publication content when metadata is absent", () => {
  assert.equal(inferredAllwainCardImageSource("Naranjas valencianas de primera calidad"), "asset:oranges");
  assert.equal(inferredAllwainCardImageSource("Televisor Samsung 55 pulgadas"), "asset:television");
  assert.equal(inferredAllwainCardImageSource("Servicio sin imagen conocida"), null);
});
