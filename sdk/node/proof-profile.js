/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import proofV2 from "./proof-v2.cjs";

// Profiles are application-owned dependencies, never selected from a caller's proof.
export const V2_PROFILE = Object.freeze({
  id: "v2", receiptKind: "vella_execution_receipt_v1", recordFields: Object.freeze({}),
  digest: proofV2.digest, isDigest: value => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value),
  sign: proofV2.signV2, verify: proofV2.verifyV2, assertJson: proofV2.assertJson,
});

export function snapshotProofProfile(profile = V2_PROFILE) {
  if (typeof profile?.id !== "string" || !profile.id || typeof profile.receiptKind !== "string" ||
    !["digest", "isDigest", "sign", "verify", "assertJson"].every(name => typeof profile[name] === "function")) {
    throw new TypeError("invalid operator-owned proof profile");
  }
  proofV2.assertJson(profile.recordFields);
  return Object.freeze({ id: profile.id, receiptKind: profile.receiptKind,
    recordFields: Object.freeze(JSON.parse(JSON.stringify(profile.recordFields))),
    digest: profile.digest, isDigest: profile.isDigest, sign: profile.sign, verify: profile.verify, assertJson: profile.assertJson });
}
