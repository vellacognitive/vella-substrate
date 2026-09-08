// Rehearse producer rollback from installed, isolated SDK packages while keeping
// a v2-aware verifier for retained authorizations. Never changes tags or main.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const legacyCommit = "cbafda49ddb1682832b438498437d62de4f84d95"; // existing immutable v1.0.3
const folder = mkdtempSync(join(tmpdir(), "vella-migration-"));
function run(command, args, cwd = folder, expected = 0) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, expected, `${command}: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const legacy = join(folder, "legacy"); mkdirSync(legacy);
  run("git", ["archive", "--format=tar", "--output", join(folder, "legacy.tar"), legacyCommit, "sdk/node", "verify"], root);
  run("tar", ["-xf", join(folder, "legacy.tar"), "-C", legacy]);
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { format: "pem", type: "pkcs8" }, publicKeyEncoding: { format: "pem", type: "spki" } });
  const publicKey = join(folder, "public.pem"); writeFileSync(publicKey, pair.publicKey);
  for (const [name, source, kind] of [["candidate", join(root, "sdk/node"), "vella_proof_bundle_v2"], ["rollback", join(legacy, "sdk/node"), "vella_proof_bundle_v1"]]) {
    const consumer = join(folder, name); mkdirSync(consumer);
    const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", folder], source))[0];
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: `vella-${name}-check`, version: "0.0.0", private: true, type: "module" }));
    run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", join(folder, "cache"), join(folder, packed.filename)], consumer);
    writeFileSync(join(consumer, "produce.mjs"), `import assert from 'node:assert/strict'; import {writeFileSync} from 'node:fs'; import * as sdk from '@vellacognitive/vella-sdk'; const r=sdk.govern({intent:'EXECUTE_CHANGE',evidenceMask:1,proof:{signingKey:${JSON.stringify(pair.privateKey)}}}); assert.equal(r.decision,'ALLOWED'); assert.equal(r.proofBundle.kind,${JSON.stringify(kind)}); assert.equal(typeof sdk.createExecutionGate,${JSON.stringify(name === "candidate" ? "function" : "undefined")}); writeFileSync('proof.json',JSON.stringify(r.proofBundle));`);
    run(process.execPath, ["produce.mjs"], consumer);
    run(process.execPath, [join(root, "verify/verify.js"), join(consumer, "proof.json"), publicKey]);
  }
  const retained = join(folder, "candidate/proof.json"), before = createHash("sha256").update(readFileSync(retained)).digest("hex");
  run(process.execPath, [join(legacy, "verify/verify.js"), retained, publicKey], folder, 1);
  run(process.execPath, ["produce.mjs"], join(folder, "rollback"));
  run(process.execPath, [join(root, "verify/verify.js"), retained, publicKey]);
  assert.equal(createHash("sha256").update(readFileSync(retained)).digest("hex"), before);
  console.log(JSON.stringify({ passed: true, legacyCommit, installedProducers: [JSON.parse(readFileSync(join(root, "sdk/node/package.json"), "utf8")).version, "1.0.3"], retainedV2VerifiedAfterRollback: true, legacyVerifierRejectsV2: true, legacySdkHasNoExecutionGate: true, scope: "SDK producer and retained-proof verification rehearsal; MCP must remain stopped when reverting its required SDK" }));
} finally { rmSync(folder, { recursive: true, force: true }); }
