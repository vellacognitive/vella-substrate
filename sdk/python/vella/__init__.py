"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC"""

from __future__ import annotations

import time

from .evaluator import create_evaluator
from .policy import DEFAULT_POLICY
from .proof import build_envelope, sign_bundle

__version__ = "1.0.0"

_EVALUATOR = create_evaluator(DEFAULT_POLICY)


def govern(
    intent: str | None,
    evidence_mask: object,
    authority_scope: str | None = None,
    policy_version: str | None = None,
    proof_signing_key: str | bytes | None = None,
) -> dict[str, object]:
    start = time.monotonic_ns()

    try:
        result = _EVALUATOR.evaluate(
            {
                "intent_id": intent,
                "evidence_mask": evidence_mask,
                "authority_scope_id": authority_scope,
                "policy_version": policy_version,
            }
        )
        latency_us = (time.monotonic_ns() - start) // 1000
        output: dict[str, object] = {
            "decision": result["decision"],
            "reason_code": result["reason_code"],
            "latency_us": latency_us,
        }

        if proof_signing_key is not None:
            try:
                envelope = build_envelope(
                    {
                        "intent_id": intent,
                        "evidence_mask": evidence_mask,
                        "authority_scope_id": authority_scope,
                        "policy_version": policy_version,
                    },
                    result,
                    {
                        "policyVersion": _EVALUATOR.policy_version,
                        "authorityScope": authority_scope,
                    },
                )
                output["proof_bundle"] = sign_bundle(envelope, proof_signing_key)
            except Exception as proof_error:  # noqa: BLE001
                output["proof_bundle"] = None
                output["proof_error"] = str(proof_error)

        return output
    except Exception:  # noqa: BLE001
        return {
            "decision": "DENIED",
            "reason_code": "E_EVALUATOR_INTERNAL",
            "latency_us": 0,
        }


__all__ = ["govern", "DEFAULT_POLICY", "__version__"]
