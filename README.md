[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.19738377.svg)](https://doi.org/10.5281/zenodo.19738377)
[![Test SDK](https://github.com/vellacognitive/vella-substrate/actions/workflows/test-sdk.yml/badge.svg)](https://github.com/vellacognitive/vella-substrate/actions/workflows/test-sdk.yml)
[![Verify Test Vectors](https://github.com/vellacognitive/vella-substrate/actions/workflows/verify-test-vectors.yml/badge.svg)](https://github.com/vellacognitive/vella-substrate/actions/workflows/verify-test-vectors.yml)
[![Lint Schemas](https://github.com/vellacognitive/vella-substrate/actions/workflows/lint-schemas.yml/badge.svg)](https://github.com/vellacognitive/vella-substrate/actions/workflows/lint-schemas.yml)

# VELLA — Governance Substrate for AI Agents & Autonomous Systems

**VELLA is the decision layer between an AI agent or autonomous system proposing an action and that action being taken.** It sits where alignment, input safety, and IAM don't: at the specific moment an autonomous system is about to act, under a specific policy, with specific evidence in hand.

Given a proposed action and an evidence mask, VELLA returns `ALLOWED` or `DENIED` deterministically and emits a cryptographically signed proof bundle. The bundle can be verified offline by any third party with only the bundle and a public key — no access to VELLA, the agent, or the originating system required.

This is a reference implementation, MIT-licensed. It's designed to be the primitive that agent frameworks, audit pipelines, and compliance systems build on.

## What this repo proves

This repository demonstrates the core VELLA primitive:

1. Before an action runs, the caller submits a proposed intent, such as `DATA_EXPORT`, `ESCALATE_PRIVILEGE`, or `EXECUTE_CHANGE`, along with evidence indicators.
2. VELLA evaluates that request against policy.
3. VELLA returns a deterministic `ALLOWED` or `DENIED` decision.
4. `DENIED` is fail-closed: the caller must not execute the action.
5. If signing is enabled, VELLA emits a proof bundle.
6. That proof bundle can be verified offline using the tools in this repo.

VELLA decides whether an action is authorized before it runs. The calling system remains responsible for carrying out — or blocking — the action.

The SDK is designed for in-process, low-latency adjudication; the authority decision can sit directly on the action path rather than being deferred to post-hoc logging.

**Start here:**
- [An Inspectable Substrate for AI Governance](https://vellacognitive.com/research/an-inspectable-substrate-for-ai-governance) — the conceptual argument (~14 min read)
- [Quickstart](#quick-example) — Node or Python SDK, working example in 2 minutes
- [Threat model](spec/threat-model.md) — what VELLA does and does not protect against
- [AI-assisted integration prompting](AI_INTEGRATION_PROMPTING.md) — prompt patterns for using AI coding agents to integrate VELLA without outsourcing authority decisions

## Install

```bash
npm install @vellacognitive/vella-sdk
```

```bash
pip install vella-sdk
```

The Node package has no runtime dependencies. The Python package depends only on [`cryptography`](https://pypi.org/project/cryptography/) for ECDSA signing. Python 3.10+ required; Node 18+ required.

Releases on npm and PyPI are published via [Trusted Publisher](https://docs.pypi.org/trusted-publishers/) (OIDC) from this repository's tagged GitHub Releases. The npm package carries [provenance attestations](https://docs.npmjs.com/generating-provenance-statements) you can verify with `npm audit signatures`.

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

## Local development

Contributors and anyone running an unreleased revision against their own code path:

### Node SDK from source

```bash
git clone https://github.com/vellacognitive/vella-substrate.git
cd vella-substrate/sdk/node
npm ci
npm test
```

To install the source checkout into another project, `npm pack` produces a tarball that `npm install /path/to/tarball.tgz` will accept.

### Python SDK from source

```bash
git clone https://github.com/vellacognitive/vella-substrate.git
cd vella-substrate/sdk/python
python3.10 -m venv .venv      # 3.10+ required; replace with python3.11/3.12 as available
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
pytest
ruff check .
mypy --strict vella/
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
- Benchmarks:
  - `benchmarks/` reproducible latency harness for both SDKs — see [`benchmarks/README.md`](benchmarks/README.md) for methodology and reference results

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

## Citing this work

If you reference VELLA in research, writing, or technical documentation, please cite:

> Wilson, M. (2026). *An Inspectable Substrate for AI Governance* (v1.0.0). Zenodo. https://doi.org/10.5281/zenodo.19738377

The conceptual argument accompanying this release is available as a companion essay:

> Wilson, M. (2026). *An Inspectable Substrate for AI Governance*. Vella Cognitive. https://vellacognitive.com/research/an-inspectable-substrate-for-ai-governance

Machine-readable citation metadata is available in [CITATION.cff](CITATION.cff).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Contact

agent@vellacognitive.com
