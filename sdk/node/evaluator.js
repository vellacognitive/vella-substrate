/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */

import { DEFAULT_POLICY } from "./policy.js";

const DECISION_ALLOWED = Object.freeze({
  decision: "ALLOWED",
  reason_code: "POLICY_SATISFIED",
});

const DECISION_DENIED_FAST = Object.freeze({
  decision: "DENIED",
  reason_code: "DENY_FAST",
});

const DECISION_DENIED_INTENT_REQUIRED = Object.freeze({
  decision: "DENIED",
  reason_code: "E_INTENT_REQUIRED",
});

const DECISION_DENIED_POLICY_VERSION = Object.freeze({
  decision: "DENIED",
  reason_code: "E_POLICY_VERSION_MISMATCH",
});

const DECISION_DENIED_EVIDENCE = Object.freeze({
  decision: "DENIED",
  reason_code: "E_EVIDENCE_MISSING",
});

function normalizeId(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim().toUpperCase();
}

function parseUnsignedIntStrict(text) {
  if (text.length === 0) {
    return -1;
  }

  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) {
      return -1;
    }
    value = (value * 10) + (code - 48);
    if (!Number.isFinite(value)) {
      return -1;
    }
  }

  return value >>> 0;
}

export function toEvidenceMask(value, evidenceBits) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >>> 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = parseUnsignedIntStrict(trimmed);
    if (numeric >= 0) {
      return numeric >>> 0;
    }
    const bit = evidenceBits[normalizeId(trimmed)];
    return bit ? (bit >>> 0) : 0;
  }

  if (Array.isArray(value)) {
    let mask = 0;
    for (let i = 0; i < value.length; i += 1) {
      const bit = evidenceBits[normalizeId(value[i])];
      if (bit) {
        mask |= bit;
      }
    }
    return mask >>> 0;
  }

  return 0;
}

export function compilePolicy(policyInput) {
  const policy = policyInput || DEFAULT_POLICY;
  const evidenceBits = Object.assign(Object.create(null), policy.evidenceBits || {});
  const scopeEntries = Object.entries(policy.scopes || {});
  const scopes = new Map();

  for (let i = 0; i < scopeEntries.length; i += 1) {
    const scopeName = scopeEntries[i][0];
    const scopeCfg = scopeEntries[i][1] || {};
    const intentEntries = Object.entries(scopeCfg.intents || {});
    const intentRules = new Map();

    for (let j = 0; j < intentEntries.length; j += 1) {
      const intentId = normalizeId(intentEntries[j][0]);
      if (!intentId) {
        continue;
      }
      intentRules.set(intentId, Number(intentEntries[j][1]) >>> 0);
    }

    scopes.set(scopeName, {
      allowUnknownIntents: scopeCfg.allowUnknownIntents === true,
      defaultRequiredMask: Number(scopeCfg.defaultRequiredMask || 0) >>> 0,
      intentRules,
    });
  }

  const defaultScope = policy.defaultScope || "sdk_v1_default";
  const policyVersion = policy.policyVersion || "min-v1";

  return Object.freeze({
    policyVersion,
    defaultScope,
    evidenceBits: Object.freeze(evidenceBits),
    scopes,
  });
}

export function createEvaluator(policyInput) {
  const compiled = compilePolicy(policyInput);
  const defaultScope = compiled.scopes.get(compiled.defaultScope) || null;

  function evaluate(input) {
    if (!input || typeof input !== "object") {
      return DECISION_DENIED_INTENT_REQUIRED;
    }

    const rawIntent = input.intent_id || input.intent || input.action;
    const intentId = normalizeId(rawIntent);
    if (!intentId) {
      return DECISION_DENIED_INTENT_REQUIRED;
    }

    let scope;
    if (input.authority_scope_id == null || input.authority_scope_id === "") {
      scope = defaultScope;
      if (!scope) {
        return DECISION_DENIED_FAST;
      }
    } else {
      scope = compiled.scopes.get(String(input.authority_scope_id));
      if (!scope) {
        return DECISION_DENIED_FAST;
      }
    }

    let requiredMask = scope.intentRules.get(intentId);
    if (requiredMask === undefined) {
      if (!scope.allowUnknownIntents) {
        return DECISION_DENIED_FAST;
      }
      requiredMask = scope.defaultRequiredMask;
    }

    const requestedPolicyVersion = input.policy_version;
    if (
      requestedPolicyVersion != null
      && requestedPolicyVersion !== ""
      && String(requestedPolicyVersion) !== compiled.policyVersion
    ) {
      return DECISION_DENIED_POLICY_VERSION;
    }

    const evidenceMask = toEvidenceMask(input.evidence_mask, compiled.evidenceBits);
    if ((evidenceMask & requiredMask) !== requiredMask) {
      return DECISION_DENIED_EVIDENCE;
    }

    return DECISION_ALLOWED;
  }

  return Object.freeze({
    policyVersion: compiled.policyVersion,
    evaluate,
  });
}
