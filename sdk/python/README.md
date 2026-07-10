# vella-sdk

Python SDK for deterministic pre-execution adjudication and signed proof-bundle generation.

## Install

```bash
pip install vella-sdk
```

## From source (development)

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
pytest
ruff check .
mypy --strict vella/
```

## Basic usage

```python
from vella import govern

result = govern(
    intent="EXECUTE_CHANGE",
    evidence_mask=1,
)

print(result["decision"])    # ALLOWED | DENIED
print(result["reason_code"]) # reason code string
```

## With proof bundle

```python
from vella import govern

signing_key = open("./proof-signing.pem", "r", encoding="utf-8").read()

result = govern(
    intent="EXECUTE_CHANGE",
    evidence_mask=1,
    proof_signing_key=signing_key,
)

print(result["proof_bundle"]["kind"])  # vella_proof_bundle_v1
```

## Custom policy evaluators

Applications that need an application-supplied policy can create an isolated evaluator through the public package API:

```python
from vella import create_evaluator

policy = {
    "policyVersion": "generation-v1",
    "defaultScope": "generation",
    "evidenceBits": {"AUTHN": 1},
    "scopes": {
        "generation": {
            "allowUnknownIntents": False,
            "defaultRequiredMask": 1,
            "intents": {"GENERATION_CONTEXT": 1},
        }
    },
}

evaluator = create_evaluator(policy)
result = evaluator.evaluate(
    {
        "intent_id": "GENERATION_CONTEXT",
        "evidence_mask": 1,
        "authority_scope_id": "generation",
        "policy_version": "generation-v1",
    }
)

print(result["decision"])    # ALLOWED | DENIED
print(result["reason_code"]) # reason code string
```

The policy uses the same `policyVersion`, `defaultScope`, `evidenceBits`, and `scopes` shape as `DEFAULT_POLICY`. Each scope declares `allowUnknownIntents`, `defaultRequiredMask`, and an `intents` mapping from normalized intent names to required evidence masks.

`create_evaluator(...)` returns a policy-bound evaluator whose `evaluate(...)` method returns `decision` and `reason_code`. Missing inputs, unknown intents or scopes, insufficient evidence, policy-version mismatches, and unexpected evaluator errors all return `DENIED`.

Use `govern(...)` for the built-in default policy and the high-level response fields `latency_us`, `proof_bundle`, and `proof_error`. Custom evaluators perform deterministic policy adjudication only; they do not sign or persist proof bundles.

## When to use this SDK

This SDK runs VELLA in-process inside your Python application. It is the right choice for agent tool-call hooks, CI/CD gating, edge compute, research notebooks, batch processing, and any context where microsecond-latency adjudication is needed without a separate service.

For enterprise service mesh, polyglot environments (Go, Java, .NET), Kubernetes admission control, or multi-tenant deployments, a different VELLA component (the runtime service or sidecar adapter) is the better fit. See the full [deployment scope](../../DEPLOYMENT.md) in the repository root.

## API

- `govern(intent, evidence_mask, authority_scope=None, policy_version=None, proof_signing_key=None)`
  - Returns a dict with `decision`, `reason_code`, `latency_us`, and optional `proof_bundle`/`proof_error`
- `create_evaluator(policy=None)`
  - Returns a policy-bound evaluator with `evaluate(input_dict)`, which returns `decision` and `reason_code`

## Reference docs

See the root repository docs for full protocol details:
- `spec/icd.md`
- `spec/schemas/proof.json`
- `verify/`
