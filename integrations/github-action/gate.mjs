import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

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

writeOutput("decision", result.decision);
writeOutput("reason-code", result.reasonCode);
writeOutput("latency-us", result.latencyUs);

let proofPath = "";
if (signingKey) {
  if (!result.proofBundle) {
    fail(`VELLA proof signing failed: ${result.proofError ?? "unknown error"}`);
  }

  const workspace = resolve(optional(process.env.GITHUB_WORKSPACE) ?? process.cwd());
  proofPath = resolve(workspace, optional(process.env.VELLA_PROOF_OUTPUT) ?? "vella-proof.json");
  const relativeProofPath = relative(workspace, proofPath);
  if (
    relativeProofPath === ".."
    || relativeProofPath.startsWith(`..${sep}`)
    || isAbsolute(relativeProofPath)
  ) {
    fail("VELLA proof-output must resolve inside GITHUB_WORKSPACE");
  }

  mkdirSync(dirname(proofPath), { recursive: true });
  writeFileSync(proofPath, `${JSON.stringify(result.proofBundle, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
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
