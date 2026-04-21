/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */

import { createEvaluator } from "./evaluator.js";
import { DEFAULT_POLICY } from "./policy.js";
import { buildEnvelope, signBundle } from "./proof.js";

const evaluator = createEvaluator(DEFAULT_POLICY);

export function govern({ intent, evidenceMask, authorityScope, policyVersion, proof } = {}) {
  const start = process.hrtime.bigint();

  try {
    const result = evaluator.evaluate({
      intent_id: intent,
      evidence_mask: evidenceMask,
      authority_scope_id: authorityScope,
      policy_version: policyVersion,
    });

    const latencyUs = Number((process.hrtime.bigint() - start) / 1000n);
    const output = {
      decision: result.decision,
      reasonCode: result.reason_code,
      latencyUs,
    };

    if (proof && proof.signingKey) {
      try {
        const envelope = buildEnvelope(
          {
            intent_id: intent,
            evidence_mask: evidenceMask,
            authority_scope_id: authorityScope,
            policy_version: policyVersion,
          },
          result,
          { policyVersion: evaluator.policyVersion, authorityScope },
        );
        output.proofBundle = signBundle(envelope, proof.signingKey);
      } catch (proofError) {
        output.proofBundle = null;
        output.proofError = proofError instanceof Error ? proofError.message : String(proofError);
      }
    }

    return output;
  } catch {
    return {
      decision: "DENIED",
      reasonCode: "E_EVALUATOR_INTERNAL",
      latencyUs: 0,
    };
  }
}

export { DEFAULT_POLICY };
