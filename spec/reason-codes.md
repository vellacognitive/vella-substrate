# VELLA Reason Codes

This document enumerates the reason codes emitted by the embedded SDK evaluators (`sdk/node/evaluator.js` and `sdk/python/vella/evaluator.py`) and surfaced by `govern(...)`.

## Decision outcomes

- `ALLOWED`
  - `POLICY_SATISFIED`
- `DENIED`
  - `DENY_FAST`
  - `E_INTENT_REQUIRED`
  - `E_POLICY_VERSION_MISMATCH`
  - `E_EVIDENCE_MISSING`
  - `E_EVALUATOR_INTERNAL`

## Code semantics

| Reason code | Decision | Meaning |
|---|---|---|
| `POLICY_SATISFIED` | `ALLOWED` | The intent is recognized, policy version is acceptable, and required evidence mask bits are present. |
| `DENY_FAST` | `DENIED` | Immediate deny due to unknown intent or unknown authority scope under fail-closed defaults. |
| `E_INTENT_REQUIRED` | `DENIED` | Request did not include a usable intent identifier (`intent_id`, `intent`, or `action`). |
| `E_POLICY_VERSION_MISMATCH` | `DENIED` | The request specified a policy version that does not match the loaded evaluator policy version. |
| `E_EVIDENCE_MISSING` | `DENIED` | Required evidence bits for the intent are missing from `evidence_mask`. |
| `E_EVALUATOR_INTERNAL` | `DENIED` | Unexpected internal error path; caller must treat as fail-closed deny. |

## Enforcement note

Reason codes are diagnostic metadata. Enforcement is based on `decision` only: callers must halt on `DENIED`.
