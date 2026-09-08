import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { govern, verifyProofV2 } from "../sdk/node/index.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = process.env.VELLA_VERIFY_PYTHON || "python3";
const privatePath = resolve(root, "sdk/node/test/fixtures/test-signing-private.pem");
const publicPath = resolve(root, "sdk/node/test/fixtures/test-signing-public.pem");
const key = readFileSync(privatePath, "utf8");
const pub = readFileSync(publicPath, "utf8");
const folder = mkdtempSync(resolve(tmpdir(), "vella-proof-conformance-"));
test.after(() => rmSync(folder, { recursive: true, force: true }));
const runtimes = [
  ["Node", "node", [resolve(root, "verify/verify.js")]],
  ["Python", python, [resolve(root, "verify/verify.py")]],
  ["OpenSSL", "bash", [resolve(root, "verify/verify.sh")]],
];
let serial = 0;
function checkAll(bundle, expected, raw = false, keyPath = publicPath) {
  const file = resolve(folder, `${serial++}.json`);
  writeFileSync(file, raw ? bundle : JSON.stringify(bundle));
  for (const [name, command, args] of runtimes) {
    const result = spawnSync(command, [...args, file, keyPath], { encoding: "utf8", env: { ...process.env, VELLA_VERIFY_PYTHON: python } });
    assert.equal(result.status === 0, expected, `${name}: ${result.error || ""}\n${result.stdout}\n${result.stderr}`);
    if (expected) assert.match(result.stdout, /VERIFIED/);
  }
}
function produce(action) { return govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1, action, proof: { signingKey: key } }).proofBundle; }
const seed = produce({ server: "reports", tool: "exportReport", args: { text: "café 😀", values: [1, null, true] } });
const record = verifyProofV2(seed, pub).authenticated;
// Deliberately bypass the SDK's signing validator, so structural rejection is
// checked even when a valid trusted test key signs a malformed record.
function signedBytes(bytes) {
  const message = Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(seed.payload_type)} ${seed.payload_type} ${bytes.length} `), bytes]);
  return { ...seed, payload: bytes.toString("base64"), payload_hash: `sha256:${crypto.createHash("sha256").update(message).digest("hex")}`, signature: crypto.sign("sha256", message, { key, dsaEncoding: "ieee-p1363" }).toString("base64") };
}
const values = [
  { name: "nested Unicode", value: { nested: { array: ["é", "😀", { target: "資料" }] }, integral_float: 1 } },
  { name: "numbers and ordering", value: { "10": 10, "2": 2, numbers: [-0, 0.000001, 1e-7, 1.2345678901234567, 9007199254740991, -9007199254740991], integral_float: 1 } },
  { name: "UTF-16 key order", value: { "😀": "a", "\ue000": "b", control: "\b\t\n\r\f", integral_float: 1 } },
];
for (const item of values) {
  for (const producer of ["Node", "Python"]) {
    test(`${producer} ${item.name} proof verifies through all three entry points`, () => {
      let bundle;
      if (producer === "Node") bundle = produce(item.value);
      else {
        const result = spawnSync(python, [resolve(root, "scripts/fixtures/produce-v2.py"), privatePath], { input: JSON.stringify({ action: item.value }), encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        bundle = JSON.parse(result.stdout);
        assert.match(Buffer.from(bundle.payload, "base64").toString(), /"integral_float":1\.0/);
      }
      checkAll(bundle, true);
      assert.equal(verifyProofV2(bundle, pub).authenticated.action_digest, verifyProofV2(produce(item.value), pub).authenticated.action_digest);
    });
  }
}
for (const field of Object.keys(record)) {
  test(`all verifiers reject unsigned change to authenticated ${field}`, () => {
    const changed = structuredClone(record);
    changed[field] = { tampered: true };
    const changedBundle = signedBytes(Buffer.from(JSON.stringify(changed)));
    checkAll({ ...changedBundle, signature: seed.signature }, false);
  });
}
const malformed = [
  ["missing field", r => { delete r.intent; }],
  ["extra field", r => { r.ok = true; }],
  ["invalid decision", r => { r.decision = "PERMITTED"; }],
  ["decision reason mismatch", r => { r.reason_code = "DENY_FAST"; }],
  ["empty request id", r => { r.request_id = ""; }],
  ["long UTF8 identifier", r => { r.request_id = "😀".repeat(257); }],
  ["year zero", r => { r.timestamp = "0000-01-01T00:00:00.000Z"; }],
  ["impossible date", r => { r.timestamp = "2026-02-30T00:00:00.000Z"; }],
  ["bad policy digest", r => { r.policy_digest = "unknown"; }],
  ["action digest mismatch", r => { r.action.args.text = "changed"; }],
  ["evidence array", r => { r.evidence = []; }],
  ["invalid mask", r => { r.evidence_mask = true; }],
  ["missing allowed evidence", r => { r.evidence_mask = null; }],
  ["false execution claim", r => { r.external_effects = true; }],
  ["unknown boundary", r => { r.boundary = "anywhere"; }],
  ["unsafe number", r => { r.evidence = { value: 9007199254740992 }; }],
  ["surrogate", r => { r.evidence = { value: "\ud800" }; }],
  ["excess depth", r => { r.evidence = {}; let x = r.evidence; for (let i = 0; i < 33; i++) x = x.next = {}; }],
];
for (const [name, change] of malformed) {
  test(`all verifiers reject valid signature over ${name}`, () => {
    const value = structuredClone(record); change(value);
    checkAll(signedBytes(Buffer.from(JSON.stringify(value))), false);
  });
}
for (const [name, bytes] of [
  ["duplicate escaped key", Buffer.from(JSON.stringify(record).replace('{', '{"\\u0069ntent":"OTHER",'))],
  ["invalid UTF8", Buffer.from([0xff, 0xfe])],
  ["UTF8 BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(record))])],
  ["payload too large", Buffer.from(" ".repeat(1024 * 1024) + JSON.stringify(record))],
  ["trailing JSON", Buffer.from(JSON.stringify(record) + " {}")],
]) test(`all verifiers reject signed ${name}`, () => checkAll(signedBytes(bytes), false));

test("all verifiers accept noncanonical exact bytes and reject unsigned reserialization", () => {
  const spaced = signedBytes(Buffer.from(JSON.stringify(record, null, 2)));
  checkAll(spaced, true);
  checkAll({ ...spaced, payload: Buffer.from(JSON.stringify(record)).toString("base64") }, false);
});
test("all verifiers reject duplicate wrapper keys", () => checkAll(JSON.stringify(seed).replace('{', '{"kind":"other",'), false, true));
test("all verifiers reject unknown format, type, algorithm, extra fields and noncanonical base64", () => {
  for (const change of [{ kind: "other" }, { payload_type: "text/plain" }, { signature_alg: "rsa-sha256" }, { key_id: "unknown" }, { extra: true }, { payload: seed.payload + "\n" }]) checkAll({ ...seed, ...change }, false);
});
test("all verifiers reject another trusted-looking key and wrong key family", () => {
  for (const options of [["ec", { namedCurve: "prime256v1" }], ["ec", { namedCurve: "secp384r1" }], ["rsa", { modulusLength: 2048 }]]) {
    const pair = crypto.generateKeyPairSync(...options);
    const file = resolve(folder, `other-${serial}.pem`);
    writeFileSync(file, pair.publicKey.export({ type: "spki", format: "pem" }));
    checkAll(seed, false, false, file);
  }
});
