import assert from "node:assert";
import { describe, it } from "node:test";

import {
  allwainOfferCardImageMeta,
  ensureAllwainImageMeta,
  ensureAllwainRequestImageMeta,
  refreshAllwainIllustrativeImageMeta,
  selectAllwainCardImageKey,
} from "../src/services/allwain-card-images.service";

describe("Allwain publication images", () => {
  it("selects a stable subject image for common products and services", () => {
    assert.equal(selectAllwainCardImageKey({ title: "Naranjas Navelina" }), "oranges");
    assert.equal(selectAllwainCardImageKey({ title: "Televisor OLED 55 pulgadas" }), "television");
    assert.equal(selectAllwainCardImageKey({ title: "Lavadora de 9 kg" }), "washing-machine");
    assert.equal(selectAllwainCardImageKey({ title: "Mercedes Clase A" }), "car");
    assert.equal(selectAllwainCardImageKey({ title: "Reparación de una fuga" , category: "Fontanería" }), "plumbing");
    assert.equal(selectAllwainCardImageKey({ title: "Servicio de inteligencia artificial" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "Agente inteligente para empresas" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "OCR y reconocimiento de imágenes" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "Asesoramiento para mi comercio" }), "professional-service");
  });

  it("recognizes products in every supported interface language", () => {
    assert.equal(selectAllwainCardImageKey({ title: "Fresh oranges" }), "oranges");
    assert.equal(selectAllwainCardImageKey({ title: "Huile d'olive" }), "olive-oil");
    assert.equal(selectAllwainCardImageKey({ title: "Lavatrice efficiente" }), "washing-machine");
    assert.equal(selectAllwainCardImageKey({ title: "西红柿" }), "tomatoes");
    assert.equal(selectAllwainCardImageKey({ title: "عسل محلي" }), "honey");
    assert.equal(selectAllwainCardImageKey({ title: "Artificial intelligence consulting" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "Service d'intelligence artificielle" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "Consulenza di intelligenza artificiale" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "人工智能服务" }), "ai-service");
    assert.equal(selectAllwainCardImageKey({ title: "خدمة الذكاء الاصطناعي" }), "ai-service");
  });

  it("falls back to a reusable general illustration", () => {
    const meta = ensureAllwainImageMeta(null, { title: "Artículo especial" });

    assert.equal(meta.imageKey, "general");
    assert.equal(meta.imageIllustrative, true);
    assert.equal(meta.imageSource, "category");
    assert.match(String(meta.imageUrl), /\/card-images\/general\.jpg\?v=2$/);
  });

  it("never replaces a real image when publication text changes", () => {
    const originalUrl = "https://cdn.example.test/user/product.jpg";
    const meta = refreshAllwainIllustrativeImageMeta(
      {
        imageUrl: originalUrl,
        imageSource: "original",
        imageIllustrative: false,
        imageAlt: "Foto del vendedor",
      },
      { title: "Tomates valencianos" },
    );

    assert.equal(meta.imageUrl, originalUrl);
    assert.equal(meta.imageSource, "original");
    assert.equal(meta.imageIllustrative, false);
  });

  it("updates an illustrative image when the detected product changes", () => {
    const oranges = ensureAllwainImageMeta(null, { title: "Naranjas" });
    const television = refreshAllwainIllustrativeImageMeta(oranges, {
      title: "Televisor 4K",
    });

    assert.equal(oranges.imageKey, "oranges");
    assert.equal(television.imageKey, "television");
    assert.notEqual(television.imageUrl, oranges.imageUrl);
  });

  it("upgrades an existing generic category image when classification improves", () => {
    const meta = ensureAllwainImageMeta(
      {
        imageUrl: "https://api.allwain.es/api/allwain/media/card-images/general.jpg?v=1",
        imageKey: "general",
        imageSource: "category",
        imageIllustrative: true,
      },
      { title: "Creación de agentes de IA para empresas", productKind: "service" },
    );

    assert.equal(meta.imageKey, "ai-service");
    assert.equal(meta.imageSource, "illustrative");
    assert.match(String(meta.imageUrl), /\/card-images\/ai-service\.jpg\?v=1$/);
  });

  it("refreshes a cached generic fallback after the artwork changes", () => {
    const meta = ensureAllwainImageMeta(
      {
        imageUrl: "https://api.allwain.es/api/allwain/media/card-images/general.jpg?v=1",
        imageKey: "general",
        imageSource: "category",
      },
      { title: "Artículo todavía sin categoría" },
    );

    assert.match(String(meta.imageUrl), /\/card-images\/general\.jpg\?v=2$/);
  });

  it("reclassifies a historical AI request without replacing user photos", () => {
    const requestImage = ensureAllwainRequestImageMeta(
      {
        url: "https://api.allwain.es/api/allwain/media/card-images/general.jpg?v=1",
        key: "general",
        source: "category",
        illustrative: true,
      },
      {
        productName: "Agente inteligente para atención al cliente",
        productKind: "service",
        confidence: 0.92,
      },
    );

    assert.equal(requestImage.key, "ai-service");
    assert.equal(requestImage.source, "illustrative");
    assert.match(requestImage.url, /\/card-images\/ai-service\.jpg\?v=1$/);
  });

  it("carries the same offer image into agreement and order cards", () => {
    const image = allwainOfferCardImageMeta({
      id: "offer-tv",
      owner: "allwain",
      ownerUserId: "seller-tv",
      title: "Televisor OLED 55 pulgadas",
      description: "Televisor de demostración",
      price: 850,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(image.key, "television");
    assert.equal(image.source, "illustrative");
    assert.equal(image.illustrative, true);
    assert.match(image.url, /\/card-images\/television\.jpg\?v=1$/);
  });
});
