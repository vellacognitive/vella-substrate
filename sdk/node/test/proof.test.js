import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { govern } from "../index.js";

const fixtureKey = fs.readFileSync(path.resolve("test/fixtures/test-signing-private.pem"), "utf8");
const fixturePub = fs.readFileSync(path.resolve("test/fixtures/test-signing-public.pem"), "utf8");

const SIGNING_EXCLUDED = new Set([
  "envelope_hash",
  "signature_alg",
  "signature",
  "sha256_bundle",
  "key_id",
  "kind",
  "exported_at",
]);

test("proof bundle is generated when signing key is provided", () => {
  const result = govern({
    intent: "EXECUTE_CHANGE",
    evidenceMask: 1,
    proof: { signingKey: fixtureKey },
  });

  assert.ok(result.proofBundle);
  assert.equal(result.proofBundle.kind, "vella_proof_bundle_v1");
  assert.equal(typeof result.proofBundle.key_id, "string");
});

test("envelope hash verifies", () => {
  const result = govern({
    intent: "EXECUTE_CHANGE",
    evidenceMask: 1,
    proof: { signingKey: fixtureKey },
  });

  const proofBundle = result.proofBundle;
  const envelope = {};
  for (const key of Object.keys(proofBundle)) {
    if (!SIGNING_EXCLUDED.has(key)) {
      envelope[key] = proofBundle[key];
    }
  }

  const expectedHash = `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify(envelope, Object.keys(envelope).sort()))
    .digest("hex")}`;

  assert.equal(expectedHash, proofBundle.envelope_hash);
});

test("signature verifies against fixture public key", () => {
  const result = govern({
    intent: "EXECUTE_CHANGE",
    evidenceMask: 1,
    proof: { signingKey: fixtureKey },
  });

  const proofBundle = result.proofBundle;
  const verified = crypto.verify(
    "SHA256",
    Buffer.from(proofBundle.envelope_hash),
    { key: fixturePub, dsaEncoding: "ieee-p1363" },
    Buffer.from(proofBundle.signature, "base64"),
  );

  assert.equal(verified, true);
});

test("bundle hash verifies", () => {
  const result = govern({
    intent: "EXECUTE_CHANGE",
    evidenceMask: 1,
    proof: { signingKey: fixtureKey },
  });

  const proofBundle = result.proofBundle;
  const envelope = {};
  for (const key of Object.keys(proofBundle)) {
    if (!SIGNING_EXCLUDED.has(key)) {
      envelope[key] = proofBundle[key];
    }
  }

  const forHash = {
    ...envelope,
    envelope_hash: proofBundle.envelope_hash,
    signature_alg: proofBundle.signature_alg,
    signature: proofBundle.signature,
  };

  const expectedBundleHash = `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify(forHash, Object.keys(forHash).sort()))
    .digest("hex")}`;

  assert.equal(expectedBundleHash, proofBundle.sha256_bundle);
});

test("proof bundle is omitted when proof options are absent", () => {
  const result = govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1 });
  assert.equal(Object.prototype.hasOwnProperty.call(result, "proofBundle"), false);
});
