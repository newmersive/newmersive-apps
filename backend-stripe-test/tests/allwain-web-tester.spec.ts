import assert from "node:assert";
import { describe, it } from "node:test";

import {
  ALLWAIN_APP_TESTER_ACTION_IDS,
  ALLWAIN_APP_TESTER_PROGRAM_ID,
  ALLWAIN_APP_TESTER_STEP_IDS,
  normalizeAllwainAppTesterActionId,
  normalizeAllwainAppTesterActionProgressInput,
  normalizeAllwainAppTesterProgressInput,
  normalizeAllwainAppTesterStepId,
  normalizeAllwainWebTesterFeedbackInput,
  normalizeAllwainWebTesterIncidentInput,
} from "../src/services/allwain-web-tester.service";

describe("allwain web tester input contracts", () => {
  it("normalizes a bounded incident without accepting arbitrary page URLs", () => {
    const incident = normalizeAllwainWebTesterIncidentInput({
      category: "Accessibility",
      severity: "high",
      description: "El texto del botón no se distingue en el fondo naranja.",
      steps: "Abrir Comprar y aumentar el texto al 200 %.",
      screen: "comprar",
      locale: "es-ES",
      release: "20260906-smart-pass-v1",
      clientReference: "incident-contract-0001",
    });

    assert.equal(incident.category, "accessibility");
    assert.equal(incident.locale, "es");
    assert.equal(incident.screen, "comprar");
    assert.equal(incident.subject, null);
    assert.equal(incident.target, "web");
    assert.equal(incident.platform, "web");
    assert.throws(
      () => normalizeAllwainWebTesterIncidentInput({
        category: "functionality",
        description: "La interacción no termina como esperaba.",
        screen: "https://allwain.es/web/?email=persona@example.test",
        clientReference: "incident-contract-0002",
      }),
      /INVALID_TESTER_INCIDENT_SCREEN/,
    );
    assert.throws(
      () => normalizeAllwainWebTesterIncidentInput({
        category: "functionality",
        description: "La interacción no termina como esperaba.",
      }),
      /TESTER_CLIENT_REFERENCE_REQUIRED/,
    );
    assert.throws(
      () => normalizeAllwainWebTesterIncidentInput({
        category: "functionality",
        description: "Mi DNI es 24393154X y la interacción no termina.",
        clientReference: "incident-contract-0003",
      }),
      /TESTER_INCIDENT_SENSITIVE_DATA/,
    );
  });

  it("normalizes app-targeted incidents without changing the legacy web defaults", () => {
    const incident = normalizeAllwainWebTesterIncidentInput({
      category: "functionality",
      description: "La acción de compra de la app no confirma el siguiente paso.",
      screen: "app_buy",
      target: "app",
      stepId: "buy",
      platform: "android",
      appVersion: "1.4.0 (42)",
      clientReference: "incident-app-contract-0001",
    });
    assert.equal(incident.target, "app");
    assert.equal(incident.stepId, "buy");
    assert.equal(incident.platform, "android");
    assert.equal(incident.appVersion, "1.4.0 (42)");

    assert.throws(
      () => normalizeAllwainWebTesterIncidentInput({
        category: "functionality",
        description: "La acción de la app no confirma el siguiente paso.",
        target: "app",
        stepId: "payments",
        clientReference: "incident-app-contract-0002",
      }),
      /INVALID_TESTER_STEP/,
    );
  });

  it("uses a fixed, allowlisted app tester program and strict completion payload", () => {
    assert.equal(ALLWAIN_APP_TESTER_PROGRAM_ID, "allwain-app-pilot-v1");
    assert.deepEqual(ALLWAIN_APP_TESTER_STEP_IDS, [
      "access",
      "profile",
      "capture",
      "buy",
      "compare",
      "sell",
      "connector",
      "notifications",
      "delivery",
      "assistant",
      "accessibility",
      "support",
    ]);
    assert.equal(normalizeAllwainAppTesterStepId("BUY"), "buy");
    assert.equal(normalizeAllwainAppTesterStepId("ACCESSIBILITY"), "accessibility");
    assert.deepEqual(normalizeAllwainAppTesterProgressInput({
      status: "completed",
      platform: "ios",
      appVersion: "2.0.0-beta.1",
      clientReference: "progress-contract-0001",
    }), {
      status: "completed",
      platform: "ios",
      appVersion: "2.0.0-beta.1",
      clientReference: "progress-contract-0001",
    });
    assert.throws(
      () => normalizeAllwainAppTesterProgressInput({
        status: "started",
        platform: "android",
        clientReference: "progress-contract-0002",
      }),
      /INVALID_TESTER_PROGRESS_STATUS/,
    );
    assert.throws(
      () => normalizeAllwainAppTesterProgressInput({
        status: "completed",
        platform: "desktop",
        clientReference: "progress-contract-0003",
      }),
      /INVALID_TESTER_PLATFORM/,
    );
    assert.throws(
      () => normalizeAllwainAppTesterProgressInput({
        status: "completed",
        platform: "android",
        clientReference: "progress-contract-0004",
        email: "persona@example.test",
      }),
      /INVALID_TESTER_PROGRESS_KEY/,
    );
  });

  it("accepts only the two stable actions per route and a private mark/unmark payload", () => {
    assert.deepEqual(ALLWAIN_APP_TESTER_ACTION_IDS, ["a1", "a2"]);
    assert.equal(normalizeAllwainAppTesterActionId("A2"), "a2");
    assert.deepEqual(normalizeAllwainAppTesterActionProgressInput({
      status: "completed",
      platform: "android",
      appVersion: "2.1.0 (51)",
      clientReference: "action-contract-0001",
    }), {
      status: "completed",
      platform: "android",
      appVersion: "2.1.0 (51)",
      clientReference: "action-contract-0001",
    });
    assert.deepEqual(normalizeAllwainAppTesterActionProgressInput({
      status: "pending",
      platform: "ios",
      clientReference: "action-contract-0002",
    }), {
      status: "pending",
      platform: "ios",
      appVersion: null,
      clientReference: "action-contract-0002",
    });
    assert.throws(
      () => normalizeAllwainAppTesterActionId("a3"),
      /INVALID_TESTER_ACTION/,
    );
    assert.throws(
      () => normalizeAllwainAppTesterActionProgressInput({
        status: "completed",
        platform: "android",
        clientReference: "action-contract-0003",
        email: "persona@example.test",
      }),
      /INVALID_TESTER_ACTION_KEY/,
    );
    assert.throws(
      () => normalizeAllwainAppTesterActionProgressInput({
        status: "removed",
        platform: "android",
        clientReference: "action-contract-0004",
      }),
      /INVALID_TESTER_ACTION_STATUS/,
    );
    assert.throws(
      () => normalizeAllwainAppTesterActionProgressInput({
        status: "completed",
        platform: "android",
        appVersion: "DNI 24393154X",
        clientReference: "action-contract-0005",
      }),
      /TESTER_APP_VERSION_SENSITIVE_DATA/,
    );
  });

  it("accepts only the seven questions and choices published by survey schema v1", () => {
    const feedback = normalizeAllwainWebTesterFeedbackInput({
      submissionId: "survey-contract-0001",
      schemaVersion: 1,
      locale: "fr-FR",
      release: "20260906-smart-pass-v1",
      answers: {
        web_clara: "YES",
        propuesta_clara: "partial",
        preventa: "maybe",
        valor: "local_economy",
        sostenibilidad: "yes",
        tester: "not_now",
        papel: "buyer",
      },
      comment: "Me gustaría comparar las ofertas con más detalle.",
    });

    assert.deepEqual(feedback.answers, {
      web_clara: "yes",
      propuesta_clara: "partial",
      preventa: "maybe",
      valor: "local_economy",
      sostenibilidad: "yes",
      tester: "not_now",
      papel: "buyer",
    });
    assert.equal(feedback.comment, "Me gustaría comparar las ofertas con más detalle.");
    assert.equal(feedback.locale, "fr");

    assert.throws(
      () => normalizeAllwainWebTesterFeedbackInput({
        submissionId: "survey-contract-0002",
        answers: { comentario: "No pertenece a answers." },
      }),
      /INVALID_TESTER_FEEDBACK_KEY/,
    );
  });

  it("rejects unknown choices, versions and private data while keeping a safe comment optional", () => {
    assert.throws(
      () => normalizeAllwainWebTesterFeedbackInput({
        submissionId: "survey-contract-0003",
        answers: { web_clara: "mi correo es persona@example.test" },
      }),
      /INVALID_TESTER_FEEDBACK_ANSWER/,
    );
    assert.throws(
      () => normalizeAllwainWebTesterFeedbackInput({
        submissionId: "survey-contract-0003b",
        answers: { dni: "24393154x" },
      }),
      /INVALID_TESTER_FEEDBACK_KEY/,
    );
    assert.throws(
      () => normalizeAllwainWebTesterFeedbackInput({
        submissionId: "survey-contract-0003c",
        schemaVersion: 2,
        answers: { web_clara: "yes" },
      }),
      /INVALID_TESTER_FEEDBACK_SCHEMA/,
    );
    assert.throws(
      () => normalizeAllwainWebTesterFeedbackInput({
        submissionId: "survey-contract-0003d",
        answers: { web_clara: "yes" },
        comment: "Puedes llamarme al 612 345 678.",
      }),
      /TESTER_FEEDBACK_SENSITIVE_DATA/,
    );
    const commentOnly = normalizeAllwainWebTesterFeedbackInput({
      submissionId: "survey-contract-0004",
      answers: {},
      comment: "Una observación opcional.",
    });
    assert.equal(commentOnly.comment, "Una observación opcional.");
  });
});
