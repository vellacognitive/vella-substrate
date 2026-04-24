# VELLA — Governance Substrate for AI Agents & Autonomous Systems

**VELLA is the decision layer between an AI agent proposing an action and that action being taken.** It sits where alignment, input safety, and IAM don't: at the specific moment an autonomous system is about to act, under a specific policy, with specific evidence in hand.

Given a proposed action and an evidence mask, VELLA returns `ALLOWED` or `DENIED` deterministically and emits a cryptographically signed proof bundle. The bundle can be verified offline by any third party with only the bundle and a public key — no access to VELLA, the agent, or the originating system required.

This is a reference implementation, MIT-licensed. It's designed to be the primitive that agent frameworks, audit pipelines, and compliance systems build on — not a product.

**Start here:**
- [An Inspectable Substrate for AI Governance](https://vellacognitive.com/research/an-inspectable-substrate-for-ai-governance) — the conceptual argument (~14 min read)
- [Quickstart](#quickstart) — Node or Python SDK, working example in 2 minutes
- [Threat model](spec/threat-model.md) — what VELLA does and does not protect against

## Install

```bash
npm install @vellacognitive/vella-sdk
```

```bash
pip install vella-sdk
```

## Local development

### Node SDK from source

```bash
cd sdk/node
npm ci
npm test
```

### Python SDK from source

```bash
cd sdk/python
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
pytest
ruff check .
mypy --strict vella/
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

## Where this SDK fits

The VELLA SDK in this repository is one of several VELLA components. It runs in-process inside Node.js and Python applications and is designed for agent hooks, CI/CD gating, edge compute, research notebooks, and any other context where a library-level adjudicator with microsecond latency is the right fit.

For enterprise service mesh deployments, polyglot environments, network-boundary enforcement, Kubernetes admission control, or multi-tenant adjudication, the runtime service and sidecar adapter (available via commercial license from Vella Cognitive, LLC) are the appropriate components.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete deployment scope and the table of technical specifications.

For commercial licensing or integration services: `agent@vellacognitive.com`

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Contact

agent@vellacognitive.com
