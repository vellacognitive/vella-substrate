// Disposable boundary experiment. Not a production gate, IAM provider, or proof store.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as z from "zod/v4";
import { createEvaluator } from "../../sdk/node/evaluator.js";
import { digest, signCandidate } from "./proof-candidates.mjs";

export const serverId = "vella-report-fixture";
export const toolSchema = z.object({
  reportId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  content: z.string().max(4096),
  format: z.enum(["text"]).default("text"),
}).strict();
export const registry = Object.freeze({ exportReport: "EXPORT_REPORT", ExportReport: "EXPORT_SUMMARY" });
export const fixturePolicy = {
  policyVersion: "report-fixture-v1", defaultScope: "reports",
  evidenceBits: { AUTHN: 1, AUTHZ: 2 },
  scopes: { reports: { allowUnknownIntents: false, intents: { EXPORT_REPORT: 3, EXPORT_SUMMARY: 1 } } },
};

export function actionFor(tool, args, configuredServer = serverId) {
  if (configuredServer !== serverId || !Object.hasOwn(registry, tool)) throw new Error("UNMAPPED_TOOL");
  return { server: configuredServer, tool, arguments: toolSchema.parse(args), principal: "fixture-operator" };
}

export function createFixtureGate({ directory, boundary, evidenceMask = 3, approvedDigest, fault }) {
  const policySnapshot = structuredClone(fixturePolicy);
  const evaluator = createEvaluator(policySnapshot);
  const policyDigest = digest(policySnapshot);
  return async function gate(tool, args, invoke, { signal, configuredServer = serverId } = {}) {
    let action;
    try { action = actionFor(tool, args, configuredServer); }
    catch { return { decision: null, eligible: false, outcome: "not_started", reason: "INVALID_ACTION" }; }
    const requestId = randomUUID();
    const actionDigest = digest(action);
    if (signal?.aborted) return { decision: null, eligible: false, outcome: "not_started", reason: "CANCELLED" };
    if (fault === "evidence" || (approvedDigest && actionDigest !== approvedDigest)) {
      return { decision: null, eligible: false, outcome: "not_started", reason: "EVIDENCE_REJECTED" };
    }
    // Evidence is trusted process configuration in this fixture, never a tool argument.
    const result = fault === "evaluate" ? { decision: "DENIED", reason_code: "E_EVALUATOR_INTERNAL" }
      : evaluator.evaluate({ intent: registry[tool], evidence_mask: evidenceMask });
    if (result.decision !== "ALLOWED") {
      return { decision: result.decision, eligible: false, outcome: "not_started", reason: result.reason_code };
    }
    const record = {
      experimental: true, requestId, boundary, action, actionDigest,
      decision: result.decision, policyDigest, evidenceMask,
    };
    try {
      if (fault === "sign") throw new Error("fixture signing failure");
      const proof = signCandidate(record);
      if (fault === "store") throw new Error("fixture storage failure");
      // Acknowledgment here is process-level write completion, not crash durability.
      await writeFile(join(directory, `${requestId}.proof.json`), JSON.stringify(proof), { flag: "wx", mode: 0o600 });
    } catch {
      return { decision: "ALLOWED", eligible: false, outcome: "not_started", reason: "PROOF_UNAVAILABLE" };
    }
    if (signal?.aborted) return { decision: "ALLOWED", eligible: false, outcome: "not_started", reason: "CANCELLED" };
    try {
      const output = await invoke(structuredClone(action.arguments));
      return { requestId, decision: "ALLOWED", eligible: true, outcome: "reported_success", boundary, output };
    } catch {
      return { requestId, decision: "ALLOWED", eligible: true, outcome: "unknown", boundary, reason: "RESULT_UNAVAILABLE" };
    }
  };
}
