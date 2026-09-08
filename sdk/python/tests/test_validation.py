import json
from pathlib import Path

import pytest

from vella import create_evaluator, govern

VECTORS = json.loads((Path(__file__).resolve().parents[3] / "test-vectors/policy-validation.json").read_text())


def policy(mask: int) -> dict:
    return {
        "policyVersion": "test-v1", "defaultScope": "s", "evidenceBits": {"AUTHN": 1},
        "scopes": {"s": {"intents": {"READ": mask}, "allowUnknownIntents": False}},
    }


@pytest.mark.parametrize("row", VECTORS["evidence"], ids=lambda row: row["name"])
def test_shared_evidence(row: dict) -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=row["value"])
    assert result["reason_code"] == row["reason"]
    assert result["decision"] == ("ALLOWED" if row["reason"] == "POLICY_SATISFIED" else "DENIED")


@pytest.mark.parametrize("row", VECTORS["invalidPolicies"], ids=lambda row: row["name"])
def test_invalid_policy(row: dict) -> None:
    with pytest.raises((ValueError, TypeError)):
        create_evaluator(row["policy"])


def test_all_32_bits() -> None:
    for bit in range(32):
        mask = 1 << bit
        evaluator = create_evaluator(policy(mask))
        assert evaluator.evaluate({"intent": "READ", "evidence_mask": mask})["decision"] == "ALLOWED"
        assert evaluator.evaluate({"intent": "READ", "evidence_mask": 0})["decision"] == "DENIED"


def test_invalid_evidence_cannot_allow_zero_rule() -> None:
    evaluator = create_evaluator(policy(0))
    for value in [-1, 1.5, float("nan"), float("inf"), True, ["AUTHN", "TYPO"], "9" * 1000]:
        result = evaluator.evaluate({"intent": "READ", "evidence_mask": value})
        assert result["reason_code"] == "E_EVIDENCE_INVALID"
    assert evaluator.evaluate({"intent": "READ"})["decision"] == "ALLOWED"


def test_compiled_policies_are_isolated() -> None:
    source = policy(1)
    first = create_evaluator(source)
    second = create_evaluator(policy(3))
    source["scopes"]["s"]["intents"]["READ"] = 0
    source["evidenceBits"]["AUTHN"] = 0
    assert first.evaluate({"intent": "READ", "evidence_mask": 0})["decision"] == "DENIED"
    assert first.evaluate({"intent": "READ", "evidence_mask": "AUTHN"})["decision"] == "ALLOWED"
    assert second.evaluate({"intent": "READ", "evidence_mask": 1})["decision"] == "DENIED"


def test_nontext_identifiers_cannot_enter_permissive_policy() -> None:
    permissive = create_evaluator({"policyVersion": "1", "defaultScope": "1", "evidenceBits": {}, "scopes": {"1": {"allowUnknownIntents": True, "intents": {}}}})
    for intent in [True, 1, {}, ["READ"]]:
        assert permissive.evaluate({"intent": intent})["reason_code"] == "E_INTENT_REQUIRED"
    assert permissive.evaluate({"intent": "READ", "authority_scope_id": 1})["decision"] == "DENIED"
    assert permissive.evaluate({"intent": "READ", "policy_version": 1})["reason_code"] == "E_POLICY_VERSION_MISMATCH"
