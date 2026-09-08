# vella-sdk

Python SDK for deterministic pre-execution adjudication and signed proof-bundle generation.

Evidence conversion now rejects invalid unsigned 32-bit values and unknown symbols with `E_EVIDENCE_INVALID`. Invalid custom policies raise at creation rather than silently weakening rules. See [evidence and policy validation](../../spec/input-validation.md) for accepted forms and compatibility changes.

**Development status:** the v2 proof and policy-bound signing APIs below are unreleased. Published 1.0.3 packages do not include them. See [migration and legacy limits](../../docs/remediation/migration.md).

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

print(result["proof_bundle"]["kind"])  # vella_proof_bundle_v2
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

Use `govern(...)` for the built-in default policy. For custom-policy signing use a governor:

```python
from vella import create_governor, verify_proof_v2

governor = create_governor(policy)
result = governor.govern(
    "GENERATION_CONTEXT", 1,
    request_id="request-123",
    action={"tool": "generate", "args": {"document": "draft-1"}},
    evidence={"identityRef": "session-123"},
    proof_signing_key=signing_key,
)
if result.get("proof_bundle"):
    checked = verify_proof_v2(result["proof_bundle"], trusted_public_key)
    if checked["ok"]:
        print(checked["authenticated"])
```

A governor snapshots its validated policy and exposes `policy_version` and `policy_digest`. Construct a new instance to activate a different policy. Custom evaluators remain evaluation-only.

The core SDK trusts application-supplied evidence, does not execute actions and does not persist proofs. Optional signing failure preserves the policy result and returns `proof_bundle: None` with `proof_error`. An integration requiring proof must stop before execution if signing or retention fails. Use the verified `authenticated` record, not an unverified decoded payload.

## When to use this SDK

This SDK runs VELLA in-process inside your Python application. It is the right choice for agent tool-call hooks, CI/CD gating, edge compute, research notebooks, batch processing, and any context where microsecond-latency adjudication is needed without a separate service.

For enterprise service mesh, polyglot environments (Go, Java, .NET), Kubernetes admission control, or multi-tenant deployments, a different VELLA component (the runtime service or sidecar adapter) is the better fit. See the full [deployment scope](../../DEPLOYMENT.md) in the repository root.

## API

- `govern(intent, evidence_mask, authority_scope=None, policy_version=None, proof_signing_key=None)`
  - Returns a dict with `decision`, `reason_code`, `latency_us`, and optional `proof_bundle`/`proof_error`
- `create_governor(policy=None)` exposes the same `govern` inputs plus keyword-only `action`, `evidence`, `request_id`, `boundary`, and `build_hash`
- `verify_proof_v2(bundle, public_key)` returns a structured verification result
- `action_digest(value)` returns a stable canonical JSON digest
- `create_evaluator(policy=None)`
  - Returns a policy-bound evaluator with `evaluate(input_dict)`, which returns `decision` and `reason_code`

## Reference docs

See the root repository docs for full protocol details:
- `spec/icd.md`
- `spec/proof-v2.md` and `spec/schemas/proof-v2.json`
- `spec/schemas/proof.json` (legacy)
- `verify/`
