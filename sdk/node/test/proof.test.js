import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { govern, createGovernor, verifyProofV2, actionDigest, DEFAULT_POLICY } from "../index.js";
import { buildEnvelope, signBundle } from "../proof.js";
import v2 from "../proof-v2.cjs";
const { verify } = createRequire(import.meta.url)("../../../verify/verify.js");
const key = fs.readFileSync(new URL("./fixtures/test-signing-private.pem", import.meta.url), "utf8");
const pub = fs.readFileSync(new URL("./fixtures/test-signing-public.pem", import.meta.url), "utf8");
const action = { server: "reports", tool: "exportReport", args: { text: "café 😀", values: [1, 0.000001, null, true], nested: { target: "a" } } };
function produce(extra = {}) { return govern({ intent: "EXECUTE_CHANGE", evidenceMask: " AUTHN ", action, proof: { signingKey: key }, ...extra }); }

test("public API signs v2 and exposes authenticated action, normalized evidence and policy identity", () => {
  const result = produce();
  const checked = verifyProofV2(result.proofBundle, pub);
  assert.equal(checked.ok, true);
  assert.equal(checked.format, "v2");
  assert.deepEqual(checked.authenticated.action, action);
  assert.equal(checked.authenticated.action_digest, actionDigest(action));
  assert.equal(checked.authenticated.policy_digest, actionDigest(DEFAULT_POLICY));
  assert.equal(checked.authenticated.evidence_mask, 1);
  assert.equal(checked.authenticated.external_effects, false);
});

test("independent crypto call verifies exact typed bytes", () => {
  const bundle = produce().proofBundle;
  const bytes = Buffer.from(bundle.payload, "base64");
  const message = Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(bundle.payload_type)} ${bundle.payload_type} ${bytes.length} `), bytes]);
  assert.equal(crypto.verify("sha256", message, { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(bundle.signature, "base64")), true);
});

for (const field of ["kind", "payload_type", "signature_alg", "key_id", "payload_hash", "signature", "payload"]) {
  test(`wrapper alteration rejects: ${field}`, () => {
    const bundle = produce().proofBundle;
    bundle[field] += "changed";
    assert.equal(verifyProofV2(bundle, pub).ok, false);
  });
}

test("nested content mutation and wrapper extra fields reject", () => {
  const bundle = produce().proofBundle;
  const record = JSON.parse(Buffer.from(bundle.payload, "base64"));
  record.action.args.nested.target = "b";
  bundle.payload = Buffer.from(JSON.stringify(record)).toString("base64");
  assert.equal(verifyProofV2(bundle, pub).ok, false);
  assert.equal(verifyProofV2({ ...produce().proofBundle, exported_at: "now" }, pub).ok, false);
});

test("custom governors sign isolated policy snapshots and retain requested versus actual versions", () => {
  const policy = structuredClone(DEFAULT_POLICY);
  policy.policyVersion = "reports-v1";
  policy.scopes.sdk_v1_default.intents.EXECUTE_CHANGE = 3;
  const custom = createGovernor(policy);
  policy.scopes.sdk_v1_default.intents.EXECUTE_CHANGE = 0;
  assert.equal(custom.govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1 }).decision, "DENIED");
  assert.equal(produce().decision, "ALLOWED");
  const result = custom.govern({ intent: "EXECUTE_CHANGE", evidenceMask: 3, policyVersion: "other", proof: { signingKey: key } });
  const record = verifyProofV2(result.proofBundle, pub).authenticated;
  assert.equal(record.policy_version, "reports-v1");
  assert.equal(record.requested_policy_version, "other");
  assert.equal(record.reason_code, "E_POLICY_VERSION_MISMATCH");
  assert.equal(record.policy_digest, custom.policyDigest);
});

test("optional signing failure preserves policy decision without claiming a proof", () => {
  const result = produce({ proof: { signingKey: "invalid" } });
  assert.equal(result.decision, "ALLOWED");
  assert.equal(result.proofBundle, null);
  assert.equal(typeof result.proofError, "string");
  assert.equal(Object.hasOwn(govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1 }), "proofBundle"), false);
});

test("invalid evidence can have a signed denial with no invented normalized mask", () => {
  const result = produce({ evidenceMask: -1 });
  const record = verifyProofV2(result.proofBundle, pub).authenticated;
  assert.equal(record.reason_code, "E_EVIDENCE_INVALID");
  assert.equal(record.evidence_mask, null);
});

test("wrong curve cannot produce or verify v2", () => {
  const other = crypto.generateKeyPairSync("ec", { namedCurve: "secp384r1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  assert.equal(produce({ proof: { signingKey: other.privateKey } }).proofBundle, null);
  assert.equal(verifyProofV2(produce().proofBundle, other.publicKey).ok, false);
});

test("canonical action digest is stable across ordering and equivalent numbers", () => {
  assert.equal(actionDigest({ z: 1.0, a: { "10": 10, "2": 2 } }), actionDigest({ a: { "2": 2, "10": 10 }, z: 1 }));
  assert.equal(v2.canonicalize({ "2": 2, "10": 10 }), '{"10":10,"2":2}');
});

test("ambiguous or unsupported in-memory action values reject", () => {
  const accessor = [];
  Object.defineProperty(accessor, "0", { get() { throw new Error("must not run"); } });
  for (const value of [NaN, Infinity, 9007199254740992, "\ud800", [, 1], accessor, { [Symbol("hidden")]: 1 }, new Date(), { x: undefined }]) {
    assert.throws(() => actionDigest(value));
  }
  assert.throws(() => v2.parseJson('{"a":1,"\\u0061":2}'), /duplicate/);
});

test("legacy helper remains explicit and verifier identifies its limited claim", () => {
  const bundle = signBundle(buildEnvelope({ intent: "EXECUTE_CHANGE", evidence_mask: 1 }, { decision: "ALLOWED", reason_code: "POLICY_SATISFIED" }, {}), key);
  const result = verify(bundle, pub);
  assert.equal(result.ok, true);
  assert.equal(result.format, "v1");
  assert.ok(result.warnings.length);
});
