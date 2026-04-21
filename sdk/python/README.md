# vella-sdk

Python SDK for deterministic pre-execution adjudication and signed proof-bundle generation.

## Install

```bash
pip install vella-sdk
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

## API

- `govern(intent, evidence_mask, authority_scope=None, policy_version=None, proof_signing_key=None)`
  - Returns a dict with `decision`, `reason_code`, `latency_us`, and optional `proof_bundle`/`proof_error`

## Reference docs

See the root repository docs for full protocol details:
- `spec/icd.md`
- `spec/schemas/proof.json`
- `verify/`
