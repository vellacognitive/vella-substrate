"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const proofV2 = require("../sdk/node/proof-v2.cjs");
const LEGACY_WARNING = "Legacy v1 verifies its historical subset only; metadata and some nested Node fields were not authenticated. It does not establish exact action binding or execution.";

const SIGNING_EXCLUDED_FIELDS = new Set([
  "envelope_hash",
  "signature_alg",
  "signature",
  "sha256_bundle",
  "key_id",
  "kind",
  "exported_at",
]);

function deriveKeyIdFromPub(publicKeyPem) {
  const publicKeyDer = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return `key_${crypto.createHash("sha256").update(publicKeyDer).digest("hex").slice(0, 16)}`;
}

function verifyLegacy(bundle, publicKeyPem) {
  const errors = [];

  if (!bundle || typeof bundle !== "object") {
    return { ok: false, errors: ["bundle is not an object"] };
  }

  const requiredFields = [
    "envelope_id",
    "decision",
    "reason_code",
    "envelope_hash",
    "signature_alg",
    "signature",
    "sha256_bundle",
  ];

  for (const field of requiredFields) {
    if (bundle[field] == null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  const envelope = {};
  for (const key of Object.keys(bundle)) {
    if (!SIGNING_EXCLUDED_FIELDS.has(key)) {
      envelope[key] = bundle[key];
    }
  }

  const expectedEnvelopeHash = `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify(envelope, Object.keys(envelope).sort()))
    .digest("hex")}`;

  if (bundle.envelope_hash !== expectedEnvelopeHash) {
    errors.push("envelope_hash mismatch");
  }

  try {
    const signatureValid = crypto.verify(
      "SHA256",
      Buffer.from(String(bundle.envelope_hash)),
      { key: publicKeyPem, dsaEncoding: "ieee-p1363" },
      Buffer.from(String(bundle.signature), "base64"),
    );
    if (!signatureValid) {
      errors.push("signature invalid");
    }
  } catch (error) {
    errors.push(`signature verification error: ${error instanceof Error ? error.message : String(error)}`);
  }

  const bundleForHash = {
    ...envelope,
    envelope_hash: bundle.envelope_hash,
    signature_alg: bundle.signature_alg,
    signature: bundle.signature,
  };

  const expectedBundleHash = `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify(bundleForHash, Object.keys(bundleForHash).sort()))
    .digest("hex")}`;

  if (bundle.sha256_bundle !== expectedBundleHash) {
    errors.push("sha256_bundle mismatch");
  }

  if (bundle.key_id) {
    const expectedKeyId = deriveKeyIdFromPub(publicKeyPem);
    if (bundle.key_id !== expectedKeyId) {
      errors.push(`key_id mismatch (bundle=${bundle.key_id}, key=${expectedKeyId})`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    computed: {
      envelope_hash: expectedEnvelopeHash,
      sha256_bundle: expectedBundleHash,
      key_id: deriveKeyIdFromPub(publicKeyPem),
    },
  };
}

function verify(bundle, publicKeyPem) {
  if (bundle?.kind === proofV2.KIND || bundle?.payload_type !== undefined) return proofV2.verifyV2(bundle, publicKeyPem);
  if (bundle?.kind !== undefined && bundle.kind !== "vella_proof_bundle_v1") return { ok: false, format: "unknown", errors: ["unsupported proof format"], warnings: [] };
  try { return { ...verifyLegacy(bundle, publicKeyPem), format: "v1", warnings: [LEGACY_WARNING] }; }
  catch (error) { return { ok: false, format: "v1", errors: [String(error)], warnings: [LEGACY_WARNING] }; }
}

function main() {
  const [bundlePath, keyPath] = process.argv.slice(2);
  if (!bundlePath || !keyPath) {
    console.error("Usage: node verify.js <bundle.json> <public-key.pem>");
    process.exit(1);
  }

  let bundle;
  let publicKeyPem;

  try {
    const raw = fs.readFileSync(path.resolve(bundlePath), "utf8");
    bundle = JSON.parse(raw);
    if (bundle?.kind === proofV2.KIND || bundle?.payload_type !== undefined) bundle = proofV2.parseJson(raw);
  } catch (error) {
    console.error(`ERROR: cannot read bundle: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  try {
    publicKeyPem = fs.readFileSync(path.resolve(keyPath), "utf8");
  } catch (error) {
    console.error(`ERROR: cannot read public key: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const result = verify(bundle, publicKeyPem);

  if (result.ok) {
    for (const warning of result.warnings || []) console.error(`WARNING: ${warning}`);
    if (result.format === "v2") console.error("FORMAT v2: authenticated authorization record under supplied key; evidence truth and execution are not established.");
    console.log("VERIFIED");
    process.exit(0);
  }

  console.error("FAILED");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { verify, verifyLegacy };
