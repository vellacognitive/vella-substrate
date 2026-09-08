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

const DECISION_DENIED_INVALID_EVIDENCE = Object.freeze({
  decision: "DENIED", reason_code: "E_EVIDENCE_INVALID",
});
const DECISION_DENIED_INTERNAL = Object.freeze({
  decision: "DENIED", reason_code: "E_EVALUATOR_INTERNAL",
});
const MAX_MASK = 0xffffffff;

class InvalidEvidenceError extends TypeError {}

function isMask(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_MASK;
}

function normalizeId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
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
    if (value > MAX_MASK) {
      return -1;
    }
  }

  return value;
}

export function toEvidenceMask(value, evidenceBits) {
  if (value == null) {
    return 0;
  }
  if (isMask(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = parseUnsignedIntStrict(trimmed);
    if (numeric >= 0) {
      return numeric;
    }
    const bit = evidenceBits[normalizeId(trimmed)];
    if (Object.hasOwn(evidenceBits, normalizeId(trimmed)) && isMask(bit)) {
      return bit;
    }
    throw new InvalidEvidenceError("evidence must be an unsigned 32-bit integer or known symbol");
  }

  if (Array.isArray(value)) {
    let mask = 0;
    for (let i = 0; i < value.length; i += 1) {
      const name = typeof value[i] === "string" ? normalizeId(value[i]) : "";
      const bit = evidenceBits[name];
      if (!name || !Object.hasOwn(evidenceBits, name) || !isMask(bit)) {
        throw new InvalidEvidenceError("every evidence list item must be a known symbol");
      }
      mask |= bit;
    }
    return mask >>> 0;
  }

  throw new InvalidEvidenceError("unsupported evidence value");
}

export function compilePolicy(policyInput) {
  function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${label} must be an object`);
    }
    return value;
  }
  function name(value, label) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
      throw new TypeError(`${label} must be a nonempty string without surrounding whitespace`);
    }
    return value;
  }
  function mask(value, label) {
    if (!isMask(value)) throw new TypeError(`${label} must be an unsigned 32-bit integer`);
    return value;
  }
  const policy = object(policyInput ?? DEFAULT_POLICY, "policy");
  const policyVersion = name(policy.policyVersion, "policyVersion");
  const defaultScope = name(policy.defaultScope, "defaultScope");
  const evidenceBits = Object.create(null);
  const usedBits = new Set();
  for (const [key, value] of Object.entries(object(policy.evidenceBits, "evidenceBits"))) {
    const id = normalizeId(name(key, "evidence name"));
    const bit = mask(value, `evidenceBits.${key}`);
    if (/^[0-9]+$/.test(id) || Object.hasOwn(evidenceBits, id)) {
      throw new TypeError(`ambiguous evidence name: ${key}`);
    }
    if (bit === 0 || (bit & (bit - 1)) !== 0 || usedBits.has(bit)) {
      throw new TypeError(`evidenceBits.${key} must name a unique single bit`);
    }
    evidenceBits[id] = bit;
    usedBits.add(bit);
  }
  const scopeEntries = Object.entries(object(policy.scopes, "scopes"));
  const scopes = new Map();

  for (let i = 0; i < scopeEntries.length; i += 1) {
    const scopeName = name(scopeEntries[i][0], "scope name");
    const scopeCfg = object(scopeEntries[i][1], `scopes.${scopeName}`);
    const intentEntries = Object.entries(object(scopeCfg.intents, `scopes.${scopeName}.intents`));
    const intentRules = new Map();

    for (let j = 0; j < intentEntries.length; j += 1) {
      const intentId = normalizeId(name(intentEntries[j][0], "intent name"));
      if (intentRules.has(intentId)) {
        throw new TypeError(`normalized intent collision: ${intentId}`);
      }
      intentRules.set(intentId, mask(intentEntries[j][1], `intent ${intentId}`));
    }

    if (scopeCfg.allowUnknownIntents !== undefined && typeof scopeCfg.allowUnknownIntents !== "boolean") {
      throw new TypeError("allowUnknownIntents must be a boolean");
    }
    scopes.set(scopeName, {
      allowUnknownIntents: scopeCfg.allowUnknownIntents === true,
      defaultRequiredMask: mask(scopeCfg.defaultRequiredMask === undefined ? 0 : scopeCfg.defaultRequiredMask, "defaultRequiredMask"),
      intentRules,
    });
  }

  if (!scopes.has(defaultScope)) throw new TypeError("defaultScope must reference a declared scope");

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

  function evaluateInput(input) {
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
      if (typeof input.authority_scope_id !== "string") return DECISION_DENIED_FAST;
      scope = compiled.scopes.get(input.authority_scope_id);
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
      && (typeof requestedPolicyVersion !== "string" || requestedPolicyVersion !== compiled.policyVersion)
    ) {
      return DECISION_DENIED_POLICY_VERSION;
    }

    const evidenceMask = toEvidenceMask(input.evidence_mask, compiled.evidenceBits);
    if (((evidenceMask & requiredMask) >>> 0) !== requiredMask) {
      return DECISION_DENIED_EVIDENCE;
    }

    return DECISION_ALLOWED;
  }

  function evaluate(input) {
    try {
      return evaluateInput(input);
    } catch (error) {
      return error instanceof InvalidEvidenceError ? DECISION_DENIED_INVALID_EVIDENCE : DECISION_DENIED_INTERNAL;
    }
  }

  return Object.freeze({
    policyVersion: compiled.policyVersion,
    evaluate,
  });
}
