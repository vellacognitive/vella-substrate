/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */

import crypto from "node:crypto";

function uuidv7() {
  const buffer = crypto.randomBytes(16);
  const now = Date.now();

  buffer[0] = (now / 2 ** 40) & 0xff;
  buffer[1] = (now / 2 ** 32) & 0xff;
  buffer[2] = (now / 2 ** 24) & 0xff;
  buffer[3] = (now / 2 ** 16) & 0xff;
  buffer[4] = (now / 2 ** 8) & 0xff;
  buffer[5] = now & 0xff;

  buffer[6] = (buffer[6] & 0x0f) | 0x70;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;

  const hex = buffer.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildEnvelope(intentInput, decisionResult, context) {
  const request = (intentInput && typeof intentInput === "object") ? intentInput : {};
  const decision = (decisionResult && typeof decisionResult === "object") ? decisionResult : {};
  const ctx = (context && typeof context === "object") ? context : {};

  return {
    envelope_id: `env_${uuidv7()}`,
    intent: request.intent_id || request.intent || request.action || null,
    proposed: request.proposed || null,
    authority_scope: ctx.authorityScope || request.authority_scope_id || "sdk_v1_default",
    evidence_mask: request.evidence_mask || 0,
    decision: decision.decision || "DENIED",
    reason_code: decision.reason_code || "E_EVALUATOR_INTERNAL",
    policy_version: ctx.policyVersion || "min-v1",
    build_hash: ctx.buildHash || "unset",
    timestamp: new Date().toISOString(),
    ok: decision.decision === "ALLOWED" || decision.decision === "DENIED",
    external_effects: false,
  };
}

function deriveKeyId(signingKey) {
  const publicKeyDer = crypto.createPublicKey(signingKey).export({ type: "spki", format: "der" });
  return `key_${crypto.createHash("sha256").update(publicKeyDer).digest("hex").slice(0, 16)}`;
}

export function signBundle(envelope, signingKey) {
  const canonicalEnvelope = JSON.stringify(envelope, Object.keys(envelope).sort());
  const envelopeHash = `sha256:${crypto.createHash("sha256").update(canonicalEnvelope).digest("hex")}`;

  const signature = crypto.sign(
    "SHA256",
    Buffer.from(envelopeHash),
    { key: signingKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64");

  const bundleForHash = {
    ...envelope,
    envelope_hash: envelopeHash,
    signature_alg: "ecdsa-p256-sha256",
    signature,
  };

  const sha256Bundle = `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify(bundleForHash, Object.keys(bundleForHash).sort()))
    .digest("hex")}`;

  return {
    ...envelope,
    envelope_hash: envelopeHash,
    signature_alg: "ecdsa-p256-sha256",
    signature,
    sha256_bundle: sha256Bundle,
    key_id: deriveKeyId(signingKey),
    kind: "vella_proof_bundle_v1",
    exported_at: new Date().toISOString(),
  };
}
