# VELLA — Governance Substrate

VELLA is a deterministic pre-execution decision authority that returns `ALLOWED` or `DENIED` and produces signed proof bundles that can be verified independently.

## Install

```bash
npm install @vellacognitive/vella-sdk
```

```bash
pip install vella-sdk
```

## Quick example

```js
import { govern } from "@vellacognitive/vella-sdk";
import fs from "node:fs";

const signingKey = fs.readFileSync("./example-signing.key", "utf8");

const result = govern({
  intent: "EXECUTE_CHANGE",
  evidenceMask: 1,
  proof: { signingKey },
});

console.log(result.decision, result.reasonCode);
console.log(result.proofBundle.envelope_id);
```

```python
from vella import govern

signing_key = open("./example-signing.key", "r", encoding="utf-8").read()

result = govern(
    intent="EXECUTE_CHANGE",
    evidence_mask=1,
    proof_signing_key=signing_key,
)

print(result["decision"], result["reason_code"])
print(result["proof_bundle"]["envelope_id"])
```

## What this repository contains

- SDK:
  - `sdk/node/` and `sdk/python/` embedded SDKs for local adjudication + signed proof bundles
- Spec:
  - `spec/icd.md`, `spec/threat-model.md`, `spec/reason-codes.md`, and `spec/schemas/`
- Verifiers:
  - `verify/verify.js`, `verify/verify.py`, `verify/verify.sh` standalone proof-bundle verifiers
- Test vectors:
  - `test-vectors/valid/` and `test-vectors/tampered/` for verifier CI and audit workflows

## How to verify a proof bundle

```bash
node verify/verify.js examples/allowed-bundle.json examples/example-signing.pub
python verify/verify.py examples/allowed-bundle.json examples/example-signing.pub
bash verify/verify.sh examples/allowed-bundle.json examples/example-signing.pub
```

## License

This repository is released under the MIT License.

## Security

See [SECURITY.md](SECURITY.md).

## Citation

See [CITATION.cff](CITATION.cff).

## Contact

agent@vellacognitive.com
