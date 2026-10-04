import assert from "node:assert";
import { after, before, beforeEach, describe, it } from "node:test";

import { app } from "../src/server";
import { clearOperationRateLimitsForTests } from "../src/middleware/operation-rate-limit.middleware";
import { TestClient } from "./helpers/test-client";

const client = new TestClient(app);

describe("Allwain public read-only guide", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  before(async () => {
    process.env.OPENAI_API_KEY = "";
    await client.start();
  });

  beforeEach(() => {
    clearOperationRateLimitsForTests();
  });

  after(async () => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    await client.stop();
  });

  it("is public, versioned and exposes no action capability", async () => {
    const profile = await client.get("/allwain/public-guide");
    assert.equal(profile.status, 200);
    assert.equal(profile.body.knowledgeVersion, "2026-09-10-r8");
    assert.equal(profile.body.sourceCount, 47);
    assert.deepEqual(profile.body.capabilities, ["answer", "explain", "compare"]);
    assert.equal(profile.body.canExecute, false);
    assert.ok(profile.body.restrictions.includes("no_private_data"));
    assert.ok(profile.body.restrictions.includes("no_actions"));
  });

  it("answers every question suggested by its own public profile", async () => {
    const profile = await client.get("/allwain/public-guide");
    assert.equal(profile.status, 200);
    assert.ok(Array.isArray(profile.body.suggestions));
    assert.ok(profile.body.suggestions.length > 0);

    for (const message of profile.body.suggestions) {
      const reply = await client.post("/allwain/public-guide/messages", { message });
      assert.equal(reply.status, 200, message);
      assert.doesNotMatch(reply.body.message.text, /Solo puedo responder/i, message);
      assert.ok(reply.body.sources.length > 0, message);
    }
  });

  it("answers from the public corpus without authentication or private state", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Por qué Allwain es diferente de un catálogo tradicional?",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.provider, "local");
    assert.equal(reply.body.canExecute, false);
    assert.equal(reply.body.action, undefined);
    assert.ok(reply.body.message.text.length > 80);
    assert.doesNotMatch(reply.body.message.text, /valor defendible para el Vendedor/i);
    assert.ok(reply.body.sources.length >= 1);
    assert.ok(reply.body.sources.every((source: any) => /^[A-D]\d{1,2}$|^(SECURITY|PRIVACY|TERMS|FISCAL|DELETE|SUPPORT|SUSTAINABILITY)$/.test(source.id)));
  });

  it("refuses to create or publish anything", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Créame y publica por mí una oferta de naranjas",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.canExecute, false);
    assert.equal(reply.body.action, undefined);
    assert.match(reply.body.message.text, /No puedo actuar/i);
  });

  it("rejects likely private data before contacting a model", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Mi correo es persona@example.com, revisa mi cuenta",
    });
    assert.equal(reply.status, 422);
    assert.equal(reply.body.error, "PRIVATE_DATA_NOT_ALLOWED");
  });

  it("explains the TV capture as a reviewable draft without acting", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "TV: ¿cómo funciona la captura de la etiqueta en una gran superficie?",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.canExecute, false);
    assert.ok(reply.body.sources.some((source: any) => ["A4", "B3", "C3"].includes(source.id)));
    assert.match(reply.body.message.text, /borrador/i);
    assert.match(reply.body.message.text, /revis/i);
    assert.match(reply.body.message.text, /confirm/i);
  });

  it("explains the real Foios product without claiming a completed result", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿De dónde salen 0,25, 1 euro, +300 % y -50 %?",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.canExecute, false);
    assert.ok(reply.body.sources.some((source: any) => ["A3", "C5"].includes(source.id)));
    assert.match(reply.body.message.text, /(?:naranjas|caso).*real/i);
    assert.match(reply.body.message.text, /(?:primera operación|resultado).*todavía no/i);
  });

  it("presents Foios to Foios as a real case with its first delivery pending", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Compara naranjas de fuera frente a Foios a Foios",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.canExecute, false);
    assert.ok(reply.body.sources.some((source: any) => ["B5", "C2", "D4"].includes(source.id)));
    assert.match(reply.body.message.text, /(?:producto|caso).*real/i);
    assert.match(reply.body.message.text, /(?:venta|entrega).*pendiente/i);
  });

  it("explains sustainability without treating local as an automatic environmental claim", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Por qué una operación local no significa automáticamente menor huella ambiental?",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.canExecute, false);
    assert.ok(reply.body.sources.some((source: any) => source.id === "SUSTAINABILITY"));
    assert.match(reply.body.message.text, /local no significa automáticamente menor huella/i);
    assert.match(reply.body.message.text, /recorrido|vehículo|carga|embalaje/i);
    assert.match(reply.body.message.text, /no (?:asignará|tratará)|sin esos datos/i);
  });

  it("rejects a concrete postal address", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Entrega mi pedido en Calle Mayor 10, Foios",
    });
    assert.equal(reply.status, 422);
    assert.equal(reply.body.error, "PRIVATE_DATA_NOT_ALLOWED");
  });

  it("refuses a direct request to create an offer", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Crea una oferta de una TV por mí",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.canExecute, false);
    assert.match(reply.body.message.text, /No puedo actuar/i);
  });

  it("refuses compound and indirect imperatives without blocking explanations", async () => {
    const compound = await client.post("/allwain/public-guide/messages", {
      message: "Crea y publica ahora una oferta de naranjas",
    });
    assert.equal(compound.status, 200);
    assert.equal(compound.body.provider, "local");
    assert.equal(compound.body.canExecute, false);
    assert.equal(compound.body.action, undefined);
    assert.match(compound.body.message.text, /No puedo actuar/i);

    const indirect = await client.post("/allwain/public-guide/messages", {
      message: "Necesito que publiques una petición por mí",
    });
    assert.equal(indirect.status, 200);
    assert.equal(indirect.body.provider, "local");
    assert.match(indirect.body.message.text, /No puedo actuar/i);

    const explanation = await client.post("/allwain/public-guide/messages", {
      message: "¿Cómo crea y publica una oferta un vendedor?",
    });
    assert.equal(explanation.status, 200);
    assert.doesNotMatch(explanation.body.message.text, /No puedo actuar/i);

    const allowedComparison = await client.post("/allwain/public-guide/messages", {
      message: "Prepara una comparación sencilla entre el mercado tradicional y Allwain",
    });
    assert.equal(allowedComparison.status, 200);
    assert.doesNotMatch(allowedComparison.body.message.text, /No puedo actuar/i);
  });

  it("states the current publication rule without inventing a card requirement", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Necesito tarjeta o pagar para publicar una petición de prueba?",
    });
    assert.equal(reply.status, 200);
    assert.match(reply.body.message.text, /no exige tarjeta/i);
    assert.match(reply.body.message.text, /no (?:compra|equivale a comprar)|no activa un pago/i);
    assert.doesNotMatch(reply.body.message.text, /exige un medio de pago/i);
  });

  it("states that Stripe TEST covers every real user offer", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message:
        "¿Puedo comprar y vender otros productos con Stripe TEST o solo naranjas?",
    });
    assert.equal(reply.status, 200);
    assert.match(reply.body.message.text, /ofertas reales publicadas por usuarios/i);
    assert.match(reply.body.message.text, /no solo.*naranjas/i);
    assert.match(reply.body.message.text, /no se mueve dinero/i);
    assert.match(reply.body.message.text, /no hay transferencias/i);
  });

  it("keeps sensitive Connector earnings answers verified and deterministic", async () => {
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) {
        return originalFetch(input, init);
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            sources: ["C5", "D10", "D3"],
          }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "¿Cómo gana dinero un Conector y por qué importa el boca a boca?",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.provider, "local");
      assert.match(reply.body.message.text, /modelo del Conector está definido/i);
      assert.doesNotMatch(reply.body.message.text, /valor defendible para el Vendedor/i);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("pins an explicit Connector question to Connector evidence", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Explícame de forma sencilla cómo puede ganar dinero un Conector en Allwain y qué límites tiene su papel.",
    });
    assert.equal(reply.status, 200);
    assert.ok(reply.body.sources.filter((source: any) => source.id.startsWith("D")).length >= 2);
    assert.ok(reply.body.sources.some((source: any) => ["D1", "D10"].includes(source.id)));
    assert.match(reply.body.message.text, /modelo del Conector está definido/i);
    assert.doesNotMatch(reply.body.message.text, /valor defendible para el Vendedor/i);
  });

  it("rejects the entire AI candidate if any citation is outside the retrieved corpus", async () => {
    const originalFetch = global.fetch;
    let capturedRequest: any;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) {
        return originalFetch(input, init);
      }
      capturedRequest = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Allwain convierte una necesidad declarada en propuestas comparables y conserva la elección en manos del comprador.",
                  sources: ["A2", "B7", "PRIVATE_DATABASE", "A2"],
                  status: "answered",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "Mercado inverso: ¿cómo comparar el paquete completo de las propuestas?",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.provider, "local");
      assert.equal(reply.body.canExecute, false);
      assert.equal(reply.body.action, undefined);
      assert.ok(reply.body.sources.length > 0);
      assert.ok(reply.body.sources.every((source: any) => source.id !== "PRIVATE_DATABASE"));
      assert.equal(capturedRequest.messages[0].role, "system");
      assert.match(capturedRequest.messages[0].content, /Corpus público versión/);
      assert.equal(capturedRequest.messages[1].role, "user");
      assert.match(capturedRequest.messages[1].content, /Mercado inverso: ¿cómo comparar el paquete completo de las propuestas\?/);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("never publishes free marketing copy returned by the model", async () => {
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) {
        return originalFetch(input, init);
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            answer: "Allwain supera a un escaparate estático y es una opción más efectiva.",
            sources: ["A2"],
            status: "answered",
          }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "¿Qué diferencia aporta Allwain?",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.provider, "openai");
      assert.doesNotMatch(reply.body.message.text, /supera|escaparate estático|más efectiva/i);
      assert.match(reply.body.message.text, /funciona al revés del catálogo tradicional/i);
      assert.ok(reply.body.message.text.split(/\s+/).length <= 45);
      assert.equal(reply.body.canExecute, false);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("uses valid AI retrieval while keeping the final wording grounded", async () => {
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) return originalFetch(input, init);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          answer: "Primero publicas una necesidad concreta. Después revisas las propuestas compatibles con sus condiciones y decides con calma; comparar no te obliga a aceptar ninguna.",
          sources: ["A7", "A6"],
          status: "answered",
        }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "¿Cómo comparo propuestas?",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.provider, "openai");
      assert.match(reply.body.message.text, /comparar no te obliga/i);
      assert.doesNotMatch(reply.body.message.text, /Primero publicas una necesidad concreta/i);
      assert.deepEqual(reply.body.sources.map((source: any) => source.id), ["A7", "A6"]);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("ignores numeric claims written by the model and keeps verified wording", async () => {
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) return originalFetch(input, init);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          answer: "Puedes comparar las propuestas y Allwain te asegura un ahorro de 50 € en cada elección.",
          sources: ["A7", "A6"],
          status: "answered",
        }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "¿Cómo comparo propuestas?",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.provider, "openai");
      assert.doesNotMatch(reply.body.message.text, /50 €/i);
      assert.match(reply.body.message.text, /comparar no te obliga/i);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("answers closed role questions directly and briefly", async () => {
    const cases = [
      {
        message: "Como comprador, ¿publicar una petición me obliga a comprar?",
        source: "B7",
        expected: /^No\./,
      },
      {
        message: "Como vendedor, ¿la primera propuesta que envío gana automáticamente?",
        source: "C1",
        expected: /^No\./,
      },
      {
        message: "¿Ser Conector me convierte automáticamente en repartidor?",
        source: "D1",
        expected: /^No\./,
      },
      {
        message: "¿Allwain vende mis datos personales?",
        source: "PRIVACY",
        expected: /^No\./,
      },
      {
        message: "¿Una confirmación, una liquidación y una factura son el mismo documento?",
        source: "FISCAL",
        expected: /^No\./,
      },
    ];

    for (const item of cases) {
      const reply = await client.post("/allwain/public-guide/messages", { message: item.message });
      assert.equal(reply.status, 200);
      assert.match(reply.body.message.text, item.expected);
      assert.ok(reply.body.message.text.split(/\s+/).length <= 55);
      assert.ok(reply.body.sources.some((source: any) => source.id === item.source));
    }
  });

  it("answers the launch and fiscality questions shown in the public guide", async () => {
    const launch = await client.post("/allwain/public-guide/messages", {
      message: "¿Cuándo se inicia la preventa?",
    });
    assert.equal(launch.status, 200);
    assert.doesNotMatch(launch.body.message.text, /Solo puedo responder/i);
    assert.match(launch.body.message.text, /todavía no hay una fecha pública confirmada/i);
    assert.match(launch.body.message.text, /Navel Lane Late de Foios/i);

    const fiscality = await client.post("/allwain/public-guide/messages", {
      message: "Háblame de la fiscalidad",
    });
    assert.equal(fiscality.status, 200);
    assert.doesNotMatch(fiscality.body.message.text, /Solo puedo responder/i);
    assert.match(fiscality.body.message.text, /fiscalidad aún no está activada/i);
    assert.match(fiscality.body.message.text, /producto, transporte, comisión e impuestos/i);
  });

  it("uses recent conversation context for a short follow-up", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Y cuándo empieza?",
      history: [
        { role: "user", text: "Háblame de la preventa de naranjas" },
        { role: "assistant", text: "La primera prueba será una preventa de naranjas de Foios." },
      ],
    });
    assert.equal(reply.status, 200);
    assert.doesNotMatch(reply.body.message.text, /Solo puedo responder/i);
    assert.match(reply.body.message.text, /todavía no hay una fecha pública confirmada/i);
  });

  it("keeps the subject for a short Connector earnings follow-up", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Y cuánto cobra?",
      history: [
        { role: "user", text: "¿Qué hace un Conector?" },
        { role: "assistant", text: "El Conector comparte su QR y activa su zona." },
      ],
    });
    assert.equal(reply.status, 200);
    assert.match(reply.body.message.text, /modelo del Conector está definido/i);
    assert.match(reply.body.message.text, /porcentajes y fiscalidad aún no están activos/i);
  });

  it("uses only the latest explicit user topic for a follow-up", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Y cuánto cobra?",
      history: [
        { role: "user", text: "¿Cómo puedo participar en la preventa?" },
        { role: "assistant", text: "Puedes apuntarte como tester antes de la preventa." },
        { role: "user", text: "¿Qué hace un Conector?" },
        { role: "assistant", text: "El Conector comparte su QR y activa su zona." },
      ],
    });
    assert.equal(reply.status, 200);
    assert.match(reply.body.message.text, /modelo del Conector está definido/i);
    assert.deepEqual(reply.body.sources.map((source: any) => source.id), ["D10", "D3"]);
  });

  it("rejects private data hidden in any client-supplied history role", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Y qué implica eso?",
      history: [
        { role: "assistant", text: "Escribe a persona@example.com" },
        { role: "user", text: "Háblame de Allwain" },
      ],
    });
    assert.equal(reply.status, 422);
    assert.equal(reply.body.error, "PRIVATE_DATA_NOT_ALLOWED");
  });

  it("answers combined public intents without dropping half of the question", async () => {
    const privacyAndSecurity = await client.post("/allwain/public-guide/messages", {
      message: "Explícame privacidad y seguridad",
    });
    assert.equal(privacyAndSecurity.status, 200);
    assert.match(privacyAndSecurity.body.message.text, /no vende datos personales/i);
    assert.match(privacyAndSecurity.body.message.text, /HTTPS/i);
    assert.deepEqual(privacyAndSecurity.body.sources.map((source: any) => source.id), ["PRIVACY", "SECURITY"]);

    const connectorTaxes = await client.post("/allwain/public-guide/messages", {
      message: "¿Qué fiscalidad tiene el Conector?",
    });
    assert.equal(connectorTaxes.status, 200);
    assert.match(connectorTaxes.body.message.text, /fiscalidad del Conector aún no está activada/i);
    assert.deepEqual(connectorTaxes.body.sources.map((source: any) => source.id), ["FISCAL", "D10"]);

    const buyerPilot = await client.post("/allwain/public-guide/messages", {
      message: "¿Cómo participa un comprador en la preventa?",
    });
    assert.equal(buyerPilot.status, 200);
    assert.match(buyerPilot.body.message.text, /participar como Comprador, Vendedor o Conector/i);
    assert.deepEqual(buyerPilot.body.sources.map((source: any) => source.id), ["A10", "A5"]);
  });

  it("does not drag an unrelated new question into the previous topic", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Cómo cocinar paella?",
      history: [
        { role: "user", text: "¿Qué hace un Conector?" },
        { role: "assistant", text: "Un Conector acerca personas y negocios a Allwain." },
      ],
    });
    assert.equal(reply.status, 200);
    assert.match(reply.body.message.text, /Solo puedo responder sobre Allwain/i);
    assert.deepEqual(reply.body.sources, []);
  });

  it("understands common public questions without requiring exact vocabulary", async () => {
    const cases = [
      { message: "Háblame de impuestos", expected: /fiscalidad aún no está activada/i },
      { message: "¿Cuáles son los tres roles?", expected: /Comprador.*Vendedor.*Conector/i },
      { message: "¿Cómo puedo participar?", expected: /participar como Comprador, Vendedor o Conector/i },
      { message: "¿Cómo comparo propuestas?", expected: /ordenar las propuestas.*precio.*valoración.*fecha/i },
      { message: "Háblame de ofertas", expected: /comparar no te obliga a aceptar/i },
      { message: "¿Qué datos usa?", expected: /texto que escribes.*historial breve/i },
      { message: "¿Cuándo llegan las naranjas?", expected: /todavía no hay una fecha pública confirmada/i },
      { message: "¿Qué IVA se aplicará?", expected: /fiscalidad aún no está activada/i },
    ];
    for (const item of cases) {
      const reply = await client.post("/allwain/public-guide/messages", { message: item.message });
      assert.equal(reply.status, 200);
      assert.doesNotMatch(reply.body.message.text, /Solo puedo responder/i);
      assert.match(reply.body.message.text, item.expected);
    }
  });

  it("declines questions outside Allwain instead of inventing a connection", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "¿Quién ganó la final del Mundial de fútbol de 2010?",
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.provider, "local");
    assert.deepEqual(reply.body.sources, []);
    assert.match(reply.body.message.text, /Solo puedo responder sobre Allwain/i);
    assert.doesNotMatch(reply.body.message.text, /naranjas|stock|QR/i);
  });

  it("normalizes the same six locales supported by the Allwain app", async () => {
    const cases = [
      ["es-ES", "es"],
      ["en-GB", "en"],
      ["fr-FR", "fr"],
      ["it-IT", "it"],
      ["zh-Hant", "zh"],
      ["ar-SA", "ar"],
    ];
    for (const [requested, expected] of cases) {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "How does Allwain work?",
        locale: requested,
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.locale, expected);
      assert.equal(typeof reply.body.generic, "boolean");
    }
  });

  it("understands core intents in every translated locale without OpenAI", async () => {
    const cases = [
      { locale: "en", message: "How does a Connector earn commission?", expected: /Conector participe/i, sources: /D10|D3/ },
      { locale: "fr", message: "Comment fonctionne un acheteur ?", expected: /Fotografías una etiqueta|explicas qué necesitas/i, sources: /B1|B7/ },
      { locale: "it", message: "Come funziona un venditore?", expected: /vendedor ve peticiones compatibles/i, sources: /C1|C4/ },
      { locale: "zh", message: "连接者如何配送？", expected: /no te convierte en repartidor/i, sources: /D1/ },
      { locale: "ar", message: "كيف تعمل مقارنة العروض؟", expected: /ordenar las propuestas/i, sources: /A7|A6/ },
    ];
    for (const item of cases) {
      const reply = await client.post("/allwain/public-guide/messages", item);
      assert.equal(reply.status, 200, `${item.locale}: ${item.message}`);
      assert.equal(reply.body.locale, item.locale);
      assert.equal(reply.body.provider, "local");
      assert.equal(reply.body.generic, false);
      assert.match(reply.body.message.text, item.expected);
      assert.ok(reply.body.sources.length > 0);
      assert.ok(reply.body.sources.every((source: any) => item.sources.test(source.id)));
      assert.doesNotMatch(reply.body.message.text, /HTTPS|fiscalidad/i);
    }
  });

  it("keeps multilingual follow-ups on the previous verified topic", async () => {
    const reply = await client.post("/allwain/public-guide/messages", {
      message: "Tell me more",
      locale: "en-US",
      history: [{ role: "user", text: "How does a Connector earn commission?" }],
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.generic, false);
    assert.match(reply.body.message.text, /Conector participe/i);
    assert.ok(reply.body.sources.some((source: any) => source.id === "D10"));
  });

  it("declines unrelated multilingual questions instead of inventing a connection", async () => {
    for (const item of [
      { locale: "en", message: "Who won the 2010 football World Cup?" },
      { locale: "en", message: "How do airplanes fly?" },
      { locale: "zh", message: "2010年世界杯冠军是谁？" },
      { locale: "zh", message: "如何做蛋糕？" },
      { locale: "ar", message: "من فاز بكأس العالم 2010؟" },
      { locale: "ar", message: "كيف أطبخ الأرز؟" },
    ]) {
      const reply = await client.post("/allwain/public-guide/messages", item);
      assert.equal(reply.status, 200);
      assert.equal(reply.body.generic, true);
      assert.deepEqual(reply.body.sources, []);
      assert.match(reply.body.message.text, /Solo puedo responder sobre Allwain/i);
    }
  });

  it("refuses action requests written in translated locales", async () => {
    for (const item of [
      { locale: "en", message: "Create and publish an orange offer for me" },
      { locale: "en", message: "Can you publish this offer?" },
      { locale: "fr", message: "Publie cette offre pour moi" },
      { locale: "fr", message: "Peux-tu publier cette offre ?" },
      { locale: "it", message: "Pubblica questa offerta per me" },
      { locale: "it", message: "Puoi pubblicare questa offerta?" },
      { locale: "zh", message: "请帮我发布这个报价" },
      { locale: "zh", message: "发布这个报价" },
      { locale: "ar", message: "من فضلك انشر هذا العرض نيابة عني" },
      { locale: "ar", message: "انشر هذا العرض" },
    ]) {
      const reply = await client.post("/allwain/public-guide/messages", item);
      assert.equal(reply.status, 200, item.locale);
      assert.equal(reply.body.canExecute, false);
      assert.match(reply.body.message.text, /No puedo actuar/i);
    }
  });

  it("blocks street addresses written in the translated locales", async () => {
    for (const item of [
      { locale: "en", message: "My address is 12 Main Street" },
      { locale: "fr", message: "Mon adresse est 12 rue Victor Hugo" },
      { locale: "it", message: "Il mio indirizzo è Via Roma 12" },
      { locale: "zh", message: "我的地址是中山路12号" },
      { locale: "ar", message: "عنواني شارع النيل ١٢" },
    ]) {
      const reply = await client.post("/allwain/public-guide/messages", item);
      assert.equal(reply.status, 422, item.locale);
      assert.equal(reply.body.error, "PRIVATE_DATA_NOT_ALLOWED");
    }
  });

  it("blocks internationalized emails and Arabic-Indic phone numbers", async () => {
    for (const item of [
      { locale: "zh", message: "我的邮箱是 用户@例子.公司" },
      { locale: "ar", message: "بريدي مستخدم@مثال.موقع" },
      { locale: "ar", message: "هاتفي ٠٥٠١٢٣٤٥٦٧" },
    ]) {
      const reply = await client.post("/allwain/public-guide/messages", item);
      assert.equal(reply.status, 422, item.locale);
      assert.equal(reply.body.error, "PRIVATE_DATA_NOT_ALLOWED");
    }
  });

  it("lets the evidence selector understand a non-Spanish question while keeping verified wording", async () => {
    const originalFetch = global.fetch;
    let capturedRequest: any;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) return originalFetch(input, init);
      capturedRequest = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ sources: ["B7"] }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "How does someone buy without being forced to accept an offer?",
        locale: "en-GB",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.locale, "en");
      assert.equal(reply.body.generic, false);
      assert.equal(reply.body.provider, "openai");
      assert.match(reply.body.message.text, /no te obliga a aceptar/i);
      assert.match(capturedRequest.messages[0].content, /pregunta puede estar escrita en en/i);
      assert.match(capturedRequest.messages[1].content, /How does someone buy/i);
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });

  it("keeps a recognized translated intent when the model returns no sources", async () => {
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = "test-public-guide-key";
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith("https://api.openai.com/")) return originalFetch(input, init);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ sources: [] }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const reply = await client.post("/allwain/public-guide/messages", {
        message: "买家如何拍照提出需求？",
        locale: "zh-CN",
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.locale, "zh");
      assert.equal(reply.body.provider, "local");
      assert.equal(reply.body.generic, false);
      assert.match(reply.body.message.text, /Fotografías una etiqueta|explicas qué necesitas/i);
      assert.ok(reply.body.sources.some((source: any) => ["A4", "B3"].includes(source.id)));
    } finally {
      global.fetch = originalFetch;
      process.env.OPENAI_API_KEY = "";
    }
  });
});
