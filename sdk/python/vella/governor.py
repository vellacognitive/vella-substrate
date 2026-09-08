"""Isolated policy-bound evaluation with optional v2 authorization proofs."""
from __future__ import annotations

import copy
import time
import uuid
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from .evaluator import Evaluator, _normalize_id, compile_policy, to_evidence_mask
from .policy import DEFAULT_POLICY
from .proof_v2 import assert_json, digest, sign_v2


class Governor:
    def __init__(self, policy: Mapping[str, object] | None = None) -> None:
        source = DEFAULT_POLICY if policy is None else policy
        assert_json(source)
        snapshot = copy.deepcopy(dict(source))
        self._compiled = compile_policy(snapshot)
        self._evaluator = Evaluator(self._compiled)
        self._policy_digest = digest(snapshot)

    @property
    def policy_version(self) -> str:
        return self._compiled.policy_version

    @property
    def policy_digest(self) -> str:
        return self._policy_digest

    def govern(
        self,
        intent: str | None,
        evidence_mask: object,
        authority_scope: str | None = None,
        policy_version: str | None = None,
        proof_signing_key: str | bytes | None = None,
        *,
        action: dict[str, Any] | None = None,
        evidence: dict[str, Any] | None = None,
        request_id: str | None = None,
        boundary: str = "evaluation",
        build_hash: str | None = None,
    ) -> dict[str, Any]:
        start = time.monotonic_ns()
        try:
            result = self._evaluator.evaluate({
                "intent_id": intent, "evidence_mask": evidence_mask,
                "authority_scope_id": authority_scope, "policy_version": policy_version,
            })
            output: dict[str, Any] = {
                "decision": result["decision"], "reason_code": result["reason_code"],
                "latency_us": (time.monotonic_ns() - start) // 1000,
            }
            if proof_signing_key is not None:
                try:
                    normalized_mask: int | None
                    try:
                        normalized_mask = to_evidence_mask(evidence_mask, self._compiled.evidence_bits)
                    except (ValueError, TypeError):
                        normalized_mask = None
                    assert_json(action)
                    assert_json(evidence)
                    action_snapshot = copy.deepcopy(action)
                    record = {
                        "envelope_id": f"env_{uuid.uuid4()}", "request_id": request_id if request_id is not None else f"req_{uuid.uuid4()}",
                        "intent": _normalize_id(intent) or None,
                        "authority_scope": authority_scope or self._compiled.default_scope,
                        "policy_version": self.policy_version, "requested_policy_version": policy_version or None,
                        "policy_digest": self.policy_digest, "evidence_mask": normalized_mask,
                        "decision": result["decision"], "reason_code": result["reason_code"],
                        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                        "action": action_snapshot, "action_digest": digest(action_snapshot) if action_snapshot is not None else None,
                        "evidence": copy.deepcopy(evidence), "boundary": boundary,
                        "build_hash": build_hash, "external_effects": False,
                    }
                    output["proof_bundle"] = sign_v2(record, proof_signing_key)
                except Exception as error:  # noqa: BLE001 - optional proof errors do not rewrite policy decisions
                    output["proof_bundle"] = None
                    output["proof_error"] = str(error)
            return output
        except Exception:  # noqa: BLE001 - evaluator boundary must fail closed
            return {"decision": "DENIED", "reason_code": "E_EVALUATOR_INTERNAL", "latency_us": 0}


def create_governor(policy: Mapping[str, object] | None = None) -> Governor:
    return Governor(policy)
