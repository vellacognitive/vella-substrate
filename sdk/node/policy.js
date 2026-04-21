/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */

export const DEFAULT_POLICY = Object.freeze({
  policyVersion: "min-v1",
  defaultScope: "sdk_v1_default",
  evidenceBits: Object.freeze({
    AUTHN: 1,
    AUTHZ: 2,
    FRESHNESS: 4,
    ATTESTATION: 8,
  }),
  scopes: Object.freeze({
    sdk_v1_default: Object.freeze({
      allowUnknownIntents: false,
      defaultRequiredMask: 1,
      intents: Object.freeze({
        EXECUTE_CHANGE: 1,
        ESCALATE_PRIVILEGE: 1 | 2,
        DATA_EXPORT: 1 | 2,
      }),
    }),
  }),
});
