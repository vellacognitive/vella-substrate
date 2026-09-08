# @vellacognitive/vella-sdk

**SDK 2.1.0:** opt-in v3 proofs require both P-256 and ML-DSA-65. Existing defaults remain v2. See the [hybrid migration runbook](https://github.com/vellacognitive/vella-substrate/blob/main/spec/pqc/MIGRATION.md).

Node.js SDK for deterministic pre-execution adjudication and signed proof-bundle generation.

Evidence conversion now rejects invalid unsigned 32-bit values and unknown symbols with `E_EVIDENCE_INVALID`. See [evidence and policy validation](../../spec/input-validation.md) for accepted convenience forms and compatibility changes.

**Version 2.0.0:** the v2 proof and policy-bound signing APIs below introduce breaking changes from SDK 1.0.3. See [migration and legacy limits](../../docs/remediation/migration.md).

## Install

```bash
npm install @vellacognitive/vella-sdk
```

## Basic usage

```js
import { govern } from "@vellacognitive/vella-sdk";

const result = govern({
  intent: "EXECUTE_CHANGE",
  evidenceMask: 1,
});

console.log(result.decision);   // ALLOWED | DENIED
console.log(result.reasonCode); // reason code string
```

## With proof bundle

```js
import fs from "node:fs";
import { govern } from "@vellacognitive/vella-sdk";

const signingKey = fs.readFileSync("./proof-signing.pem", "utf8");

const result = govern({
  intent: "EXECUTE_CHANGE",
  evidenceMask: 1,
  proof: { signingKey },
});

console.log(result.proofBundle.kind); // vella_proof_bundle_v2
```

## Custom policies and verified record access

```js
import { createGovernor, verifyProofV2 } from "@vellacognitive/vella-sdk";

const governor = createGovernor(applicationPolicy);
const result = governor.govern({
  intent: "EXPORT_REPORT",
  evidenceMask: ["AUTHN", "AUTHZ"],
  requestId: "request-123",
  action: { server: "reports", tool: "exportReport", args: { reportId: "report-1" } },
  evidence: { identityRef: "session-123", approvalRef: "approval-456" },
  proof: { signingKey },
});
if (result.proofBundle) {
  const checked = verifyProofV2(result.proofBundle, trustedPublicKey);
  if (checked.ok) console.log(checked.authenticated);
}
```

`createGovernor(policy)` snapshots a validated policy and exposes `govern`, `policyVersion` and `policyDigest`. Construct a new instance to change policy. `createEvaluator(policy)` is available for evaluation only. The policy shape and validation rules are defined in [input validation](../../spec/input-validation.md).

The core SDK trusts application-supplied evidence, does not execute actions and does not persist proofs. Optional signing failure preserves the policy result and returns `proofBundle: null` with `proofError`. An integration requiring proof must stop before execution if signing or retention fails. Use the verified `authenticated` record; never interpret unverified decoded payload as authority.

## When to use this SDK

This SDK runs VELLA in-process inside your Node.js application. It is the right choice for agent tool-call hooks, CI/CD gating, edge compute, research notebooks, batch processing, and any context where microsecond-latency adjudication is needed without a separate service.

For enterprise service mesh, polyglot environments (Go, Java, .NET), Kubernetes admission control, or multi-tenant deployments, a different VELLA component (the runtime service or sidecar adapter) is the better fit. See the full [deployment scope](../../DEPLOYMENT.md) in the repository root.

## API

- `govern({ intent, evidenceMask, authorityScope?, policyVersion?, proof?, action?, evidence?, requestId?, boundary?, buildHash? })`
  - Returns `{ decision, reasonCode, latencyUs, proofBundle?, proofError? }`
- `proof.signingKey`
  - PEM-encoded ECDSA-P256 private key (string)

## Reference docs

See the root repository docs for full protocol details:
- `spec/icd.md`
- `spec/proof-v2.md` and `spec/schemas/proof-v2.json`
- `spec/schemas/proof.json` (legacy)
- `verify/`

## Mandatory execution and local evidence

The `createExecutionGate` requires a signed v2 authorization, trusted evidence resolution and acknowledged retention before invoking a protected callable. `createLocalProofSink` supplies the documented local fsync acknowledgment; `createOperatorEvidenceProvider` is the fixed-bit local session/permission/approval reference. A proof sink must return the exact proof hash and its promised durability.

Use [the complete local reference](../../integrations/mcp-server/README.md) for registration, evidence-state ownership, receipts, cancellation and recovery semantics. Core `govern` remains a synchronous optional-signing API; execution uses the separate asynchronous gate. Node declarations ship with the package.
