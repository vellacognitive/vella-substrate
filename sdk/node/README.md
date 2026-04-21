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
