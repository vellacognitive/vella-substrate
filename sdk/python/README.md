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

## When to use this SDK

This SDK runs VELLA in-process inside your Python application. It is the right choice for agent tool-call hooks, CI/CD gating, edge compute, research notebooks, batch processing, and any context where microsecond-latency adjudication is needed without a separate service.

For enterprise service mesh, polyglot environments (Go, Java, .NET), Kubernetes admission control, or multi-tenant deployments, a different VELLA component (the runtime service or sidecar adapter) is the better fit. See the full [deployment scope](../../DEPLOYMENT.md) in the repository root.

## API

- `govern(intent, evidence_mask, authority_scope=None, policy_version=None, proof_signing_key=None)`
  - Returns a dict with `decision`, `reason_code`, `latency_us`, and optional `proof_bundle`/`proof_error`

## Reference docs

See the root repository docs for full protocol details:
- `spec/icd.md`
- `spec/schemas/proof.json`
- `verify/`
