import assert from "node:assert";
import { describe, it } from "node:test";

import {
  AllwainAgentControlError,
  allwainAgentDefinitions,
  getAllwainAgentRuntimeControl,
  updateAllwainAgentControl,
} from "../src/services/allwain-agent-control.service";

describe("Allwain agent controls", () => {
  it("registers every operational agent with explicit modes and capabilities", () => {
    const definitions = allwainAgentDefinitions();
    assert.equal(definitions.length, 6);
    assert.equal(new Set(definitions.map((agent) => agent.key)).size, definitions.length);
    for (const agent of definitions) {
      assert.ok(agent.name.length > 3);
      assert.ok(agent.purpose.length > 10);
      assert.ok(agent.allowedModes.includes(agent.defaultMode));
      assert.ok(agent.capabilities.length > 0);
    }
  });

  it("rejects an unknown mode and changes without an accountable reason", async () => {
    await assert.rejects(
      () => updateAllwainAgentControl({
        actorUserId: "admin-test",
        agentKey: "operational_guide",
        enabled: true,
        mode: "unrestricted",
        reason: "Prueba de modo no permitido",
      }),
      (error: unknown) => error instanceof AllwainAgentControlError && error.message === "INVALID_AGENT_MODE",
    );

    await assert.rejects(
      () => updateAllwainAgentControl({
        actorUserId: "admin-test",
        agentKey: "operational_guide",
        enabled: false,
        mode: "local_only",
        reason: "corto",
      }),
      (error: unknown) => error instanceof AllwainAgentControlError && error.message === "ADMIN_REASON_REQUIRED",
    );
  });

  it("versions valid changes and exposes them to the runtime", async () => {
    const previous = await getAllwainAgentRuntimeControl("publication_quality");
    const updated = await updateAllwainAgentControl({
      actorUserId: "admin-test",
      agentKey: "publication_quality",
      enabled: true,
      mode: "rules_only",
      operatorInstructions: "Pide una descripción clara cuando falte el estado del producto.",
      reason: "Validar el control versionado en pruebas",
    });
    assert.equal(updated.mode, "rules_only");
    assert.equal(updated.enabled, true);
    assert.equal(updated.version, previous.version + 1);

    const runtime = await getAllwainAgentRuntimeControl("publication_quality");
    assert.deepEqual(runtime, updated);
  });
});
