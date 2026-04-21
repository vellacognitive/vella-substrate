# @vellacognitive/vella-sdk

Node.js SDK for deterministic pre-execution adjudication and signed proof-bundle generation.

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

console.log(result.proofBundle.kind); // vella_proof_bundle_v1
```

## When to use this SDK

This SDK runs VELLA in-process inside your Node.js application. It is the right choice for agent tool-call hooks, CI/CD gating, edge compute, research notebooks, batch processing, and any context where microsecond-latency adjudication is needed without a separate service.

For enterprise service mesh, polyglot environments (Go, Java, .NET), Kubernetes admission control, or multi-tenant deployments, a different VELLA component (the runtime service or sidecar adapter) is the better fit. See the full [deployment scope](../../DEPLOYMENT.md) in the repository root.

## API

- `govern({ intent, evidenceMask, authorityScope?, policyVersion?, proof? })`
  - Returns `{ decision, reasonCode, latencyUs, proofBundle?, proofError? }`
- `proof.signingKey`
  - PEM-encoded ECDSA-P256 private key (string)

## Reference docs

See the root repository docs for full protocol details:
- `spec/icd.md`
- `spec/schemas/proof.json`
- `verify/`
