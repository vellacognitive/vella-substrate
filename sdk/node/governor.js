/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { randomUUID } from "node:crypto";
import { compilePolicy, createEvaluator, toEvidenceMask } from "./evaluator.js";
import { DEFAULT_POLICY } from "./policy.js";
import proofV2 from "./proof-v2.cjs";
import { snapshotProofProfile } from "./proof-profile.js";

function snapshot(value) {
  proofV2.assertJson(value);
  return JSON.parse(JSON.stringify(value));
}

export function createGovernor(policy = DEFAULT_POLICY, options = {}) {
  const profile = snapshotProofProfile(options.proofProfile);
  profile.assertJson(policy);
  const policySnapshot = snapshot(policy);
  const compiled = compilePolicy(policySnapshot);
  const evaluator = createEvaluator(policySnapshot);
  const policyDigest = profile.digest(policySnapshot);

  function govern(input = {}) {
    const start = process.hrtime.bigint();
    try {
      const { intent, evidenceMask, authorityScope, policyVersion, proof } = input;
      const result = evaluator.evaluate({ intent_id: intent, evidence_mask: evidenceMask, authority_scope_id: authorityScope, policy_version: policyVersion });
      const output = { decision: result.decision, reasonCode: result.reason_code, latencyUs: Number((process.hrtime.bigint() - start) / 1000n) };
      if (proof?.signingKey !== undefined) {
        try {
          let normalizedMask;
          try { normalizedMask = toEvidenceMask(evidenceMask, compiled.evidenceBits); }
          catch { normalizedMask = null; }
          profile.assertJson(input.action ?? null);
          profile.assertJson(input.evidence ?? null);
          const action = snapshot(input.action ?? null);
          const record = {
            envelope_id: `env_${randomUUID()}`, request_id: input.requestId ?? `req_${randomUUID()}`,
            intent: typeof intent === "string" && intent.trim() ? intent.trim().toUpperCase() : null,
            authority_scope: authorityScope || compiled.defaultScope,
            policy_version: compiled.policyVersion, requested_policy_version: policyVersion || null,
            policy_digest: policyDigest, evidence_mask: normalizedMask,
            decision: result.decision, reason_code: result.reason_code, timestamp: new Date().toISOString(),
            action, action_digest: action === null ? null : profile.digest(action),
            evidence: snapshot(input.evidence ?? null), boundary: input.boundary ?? "evaluation",
            build_hash: input.buildHash ?? null, external_effects: false,
          };
          for (const field of Object.keys(profile.recordFields)) {
            if (Object.hasOwn(record, field)) throw new TypeError("profile must not override authorization fields");
          }
          output.proofBundle = profile.sign({ ...record, ...profile.recordFields }, proof.signingKey);
        } catch (error) {
          output.proofBundle = null;
          output.proofError = error instanceof Error ? error.message : String(error);
        }
      }
      return output;
    } catch {
      return { decision: "DENIED", reasonCode: "E_EVALUATOR_INTERNAL", latencyUs: 0 };
    }
  }

  return Object.freeze({ govern, policyVersion: compiled.policyVersion, policyDigest, proofProfileId: profile.id });
}
