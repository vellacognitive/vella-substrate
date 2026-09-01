import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const gatePath = join(repositoryRoot, "integrations/github-action/gate.mjs");
const verifierPath = join(repositoryRoot, "verify/verify.js");
const privateKey = readFileSync(
  join(repositoryRoot, "sdk/node/test/fixtures/test-signing-private.pem"),
  "utf8",
);
const publicKeyPath = join(repositoryRoot, "sdk/node/test/fixtures/test-signing-public.pem");

function outputValue(outputs, name) {
  const prefix = `${name}=`;
  return outputs.split("\n").find((line) => line.startsWith(prefix))?.slice(prefix.length);
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "vella-action-gate-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  const outputFile = join(root, "github-output.txt");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(outputFile, "", "utf8");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, workspace, outside, outputFile };
}

function runGate(fixture, options = {}) {
  const result = spawnSync(process.execPath, [gatePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_OUTPUT: fixture.outputFile,
      GITHUB_WORKSPACE: fixture.workspace,
      VELLA_AUTHORITY_SCOPE: "",
      VELLA_EVIDENCE_MASK: options.evidenceMask ?? "1",
      VELLA_INTENT: options.intent ?? "EXECUTE_CHANGE",
      VELLA_POLICY_VERSION: "",
      VELLA_PROOF_OUTPUT: options.proofOutput ?? "artifacts/vella-proof.json",
      VELLA_PROOF_SIGNING_KEY: options.signingKey ?? privateKey,
    },
  });
  return {
    ...result,
    outputs: readFileSync(fixture.outputFile, "utf8"),
  };
}

test("writes and independently verifies a signed proof in a normal nested path", (t) => {
  const fixture = createFixture(t);
  const result = runGate(fixture);
  const proofPath = join(fixture.workspace, "artifacts/vella-proof.json");
  const canonicalProofPath = realpathSync(proofPath);
  const proofRelativePath = relative(realpathSync(fixture.workspace), canonicalProofPath);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(proofRelativePath.startsWith(`..${sep}`) || isAbsolute(proofRelativePath), false);
  if (process.platform !== "win32") {
    assert.equal(lstatSync(proofPath).mode & 0o777, 0o600);
  }
  assert.match(result.outputs, /^decision=ALLOWED$/m);
  assert.equal(outputValue(result.outputs, "proof-path"), canonicalProofPath);

  const verification = spawnSync(process.execPath, [verifierPath, proofPath, publicKeyPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(verification.status, 0, verification.stderr);
});

test("rejects a parent directory symlink without writing outside the workspace", (t) => {
  const fixture = createFixture(t);
  symlinkSync(fixture.outside, join(fixture.workspace, "artifacts"), "dir");

  const result = runGate(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain symbolic links/);
  assert.equal(result.outputs, "");
  assert.throws(() => lstatSync(join(fixture.outside, "vella-proof.json")), { code: "ENOENT" });
});

test("rejects a final file symlink and preserves its external target", (t) => {
  const fixture = createFixture(t);
  const artifacts = join(fixture.workspace, "artifacts");
  const externalTarget = join(fixture.outside, "sentinel.json");
  mkdirSync(artifacts);
  writeFileSync(externalTarget, "sentinel\n", "utf8");
  symlinkSync(externalTarget, join(artifacts, "vella-proof.json"), "file");

  const result = runGate(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not be a symbolic link/);
  assert.equal(result.outputs, "");
  assert.equal(readFileSync(externalTarget, "utf8"), "sentinel\n");
});

test("rejects a final hard link and preserves its external inode", (t) => {
  const fixture = createFixture(t);
  const artifacts = join(fixture.workspace, "artifacts");
  const externalTarget = join(fixture.outside, "sentinel.json");
  mkdirSync(artifacts);
  writeFileSync(externalTarget, "sentinel\n", "utf8");
  linkSync(externalTarget, join(artifacts, "vella-proof.json"));

  const result = runGate(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not share storage through hard links/);
  assert.equal(result.outputs, "");
  assert.equal(readFileSync(externalTarget, "utf8"), "sentinel\n");
});

test("rejects a lexical workspace escape without emitting decision outputs", (t) => {
  const fixture = createFixture(t);
  const result = runGate(fixture, { proofOutput: "../outside/vella-proof.json" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must resolve to a file inside GITHUB_WORKSPACE/);
  assert.equal(result.outputs, "");
  assert.throws(() => lstatSync(join(fixture.outside, "vella-proof.json")), { code: "ENOENT" });
});

test("preserves absolute proof paths that remain inside the workspace", (t) => {
  const fixture = createFixture(t);
  const proofPath = join(fixture.workspace, "absolute-proof.json");
  const result = runGate(fixture, { proofOutput: proofPath });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(outputValue(result.outputs, "proof-path"), realpathSync(proofPath));
});

test("rejects a non-directory parent component before emitting outputs", (t) => {
  const fixture = createFixture(t);
  writeFileSync(join(fixture.workspace, "artifacts"), "not a directory\n", "utf8");

  const result = runGate(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must contain only directory components/);
  assert.equal(result.outputs, "");
});

test("rejects line breaks in the proof path before writing any outputs", (t) => {
  const fixture = createFixture(t);
  const result = runGate(fixture, { proofOutput: "artifacts/proof\npath.json" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain line breaks/);
  assert.equal(result.outputs, "");
});

test("preserves regular-file overwrite behavior and enforces private permissions", (t) => {
  const fixture = createFixture(t);
  const artifacts = join(fixture.workspace, "artifacts");
  const proofPath = join(artifacts, "vella-proof.json");
  mkdirSync(artifacts);
  writeFileSync(proofPath, "old contents\n", "utf8");
  chmodSync(proofPath, 0o644);

  const result = runGate(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(proofPath, "utf8"), /"kind": "vella_proof_bundle_v1"/);
  assert.equal(lstatSync(proofPath).mode & 0o777, 0o600);
});

test("retains a signed denied proof while failing the gate", (t) => {
  const fixture = createFixture(t);
  const result = runGate(fixture, { evidenceMask: "0" });
  const proofPath = join(fixture.workspace, "artifacts/vella-proof.json");
  const canonicalProofPath = realpathSync(proofPath);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /VELLA denied EXECUTE_CHANGE: E_EVIDENCE_MISSING/);
  assert.match(result.outputs, /^decision=DENIED$/m);
  assert.equal(outputValue(result.outputs, "proof-path"), canonicalProofPath);
  assert.equal(lstatSync(proofPath).isFile(), true);
});

test("withholds outputs when proof signing fails", (t) => {
  const fixture = createFixture(t);
  const result = runGate(fixture, { signingKey: "not-a-private-key" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /proof signing failed/);
  assert.equal(result.outputs, "");
});
