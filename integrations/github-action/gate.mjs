import {
  appendFileSync,
  closeSync,
  constants,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { govern } from "../../sdk/node/index.js";

function optional(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function writeOutput(name, value) {
  const normalized = String(value);
  if (/[\r\n]/.test(normalized)) {
    fail(`Refusing multiline GitHub Actions output: ${name}`);
  }

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${normalized}\n`, "utf8");
  }
}

function fail(message) {
  const escaped = String(message)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  process.stderr.write(`::error title=VELLA Authority Gate::${escaped}\n`);
  process.exit(1);
}

function isInside(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

function pathError(path, message) {
  return new Error(`VELLA proof-output ${path} ${message}`);
}

function readPathState(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function createSafeParent(workspace, relativeProofPath) {
  const workspaceReal = realpathSync(workspace);
  const parentRelativePath = dirname(relativeProofPath);
  let current = workspace;

  if (parentRelativePath !== ".") {
    for (const component of parentRelativePath.split(sep)) {
      current = join(current, component);
      let state = readPathState(current);
      if (!state) {
        try {
          mkdirSync(current, { mode: 0o700 });
        } catch (error) {
          if (error?.code !== "EEXIST") {
            throw error;
          }
        }
        state = readPathState(current);
      }

      if (!state || state.isSymbolicLink()) {
        throw pathError(current, "must not contain symbolic links");
      }
      if (!state.isDirectory()) {
        throw pathError(current, "must contain only directory components");
      }
    }
  }

  const parentReal = realpathSync(current);
  if (!isInside(workspaceReal, parentReal)) {
    throw pathError(parentReal, "must remain inside GITHUB_WORKSPACE");
  }
  return parentReal;
}

function writeProof(workspace, configuredPath, proofBundle) {
  if (/[\r\n]/.test(configuredPath)) {
    throw new Error("VELLA proof-output must not contain line breaks");
  }

  const workspacePath = resolve(workspace);
  const requestedPath = resolve(workspacePath, configuredPath);
  const relativeProofPath = relative(workspacePath, requestedPath);
  if (!relativeProofPath || !isInside(workspacePath, requestedPath)) {
    throw pathError(requestedPath, "must resolve to a file inside GITHUB_WORKSPACE");
  }

  const parentReal = createSafeParent(workspacePath, relativeProofPath);
  const proofPath = join(parentReal, basename(relativeProofPath));
  if (/[\r\n]/.test(proofPath)) {
    throw new Error("VELLA proof-output must not contain line breaks");
  }
  const finalState = readPathState(proofPath);
  if (finalState?.isSymbolicLink()) {
    throw pathError(proofPath, "must not be a symbolic link");
  }
  if (finalState && !finalState.isFile()) {
    throw pathError(proofPath, "must be a regular file");
  }
  if (finalState && finalState.nlink !== 1) {
    throw pathError(proofPath, "must not share storage through hard links");
  }
  const noFollowFlag = Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0;

  let descriptor;
  try {
    descriptor = openSync(
      proofPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollowFlag,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, `${JSON.stringify(proofBundle, null, 2)}\n`, "utf8");
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }

  return proofPath;
}

const intent = optional(process.env.VELLA_INTENT);
const evidenceText = optional(process.env.VELLA_EVIDENCE_MASK);

if (!intent) {
  fail("VELLA intent is required");
}

if (!evidenceText || !/^\d+$/.test(evidenceText)) {
  fail("VELLA evidence-mask must be an unsigned decimal integer");
}

const evidenceMask = Number(evidenceText);
if (!Number.isSafeInteger(evidenceMask) || evidenceMask > 0xFFFFFFFF) {
  fail("VELLA evidence-mask must be between 0 and 4294967295");
}

const signingKey = optional(process.env.VELLA_PROOF_SIGNING_KEY);
const result = govern({
  intent,
  evidenceMask,
  authorityScope: optional(process.env.VELLA_AUTHORITY_SCOPE),
  policyVersion: optional(process.env.VELLA_POLICY_VERSION),
  proof: signingKey ? { signingKey } : undefined,
});

let proofPath = "";
if (signingKey) {
  if (!result.proofBundle) {
    fail(`VELLA proof signing failed: ${result.proofError ?? "unknown error"}`);
  }

  try {
    proofPath = writeProof(
      optional(process.env.GITHUB_WORKSPACE) ?? process.cwd(),
      optional(process.env.VELLA_PROOF_OUTPUT) ?? "vella-proof.json",
      result.proofBundle,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : "VELLA proof-output could not be written safely");
  }
}

writeOutput("decision", result.decision);
writeOutput("reason-code", result.reasonCode);
writeOutput("latency-us", result.latencyUs);
if (proofPath) {
  writeOutput("proof-path", proofPath);
}

const summary = {
  decision: result.decision,
  reasonCode: result.reasonCode,
  latencyUs: result.latencyUs,
  ...(proofPath ? { proofPath } : {}),
};

process.stdout.write(`${JSON.stringify(summary)}\n`);

if (result.decision !== "ALLOWED") {
  fail(`VELLA denied ${intent}: ${result.reasonCode}`);
}
