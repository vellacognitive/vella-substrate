from collections.abc import Mapping
from typing import Iterator

from vella import create_evaluator, govern

CUSTOM_POLICY = {
    "policyVersion": "custom-v1",
    "defaultScope": "generation",
    "evidenceBits": {"AUTHN": 1},
    "scopes": {
        "generation": {
            "allowUnknownIntents": False,
            "defaultRequiredMask": 1,
            "intents": {"GENERATION_CONTEXT": 1},
        },
    },
}


class FailingMapping(Mapping[str, object]):
    def __getitem__(self, key: str) -> object:
        raise RuntimeError("controlled evaluator failure")

    def __iter__(self) -> Iterator[str]:
        return iter(("intent_id",))

    def __len__(self) -> int:
        return 1


def test_create_evaluator_is_available_from_public_package() -> None:
    assert callable(create_evaluator)


def test_custom_evaluator_allows_controlled_policy_fixture() -> None:
    evaluator = create_evaluator(CUSTOM_POLICY)

    result = evaluator.evaluate(
        {
            "intent_id": "GENERATION_CONTEXT",
            "evidence_mask": 1,
            "authority_scope_id": "generation",
            "policy_version": "custom-v1",
        }
    )

    assert result == {"decision": "ALLOWED", "reason_code": "POLICY_SATISFIED"}


def test_custom_evaluator_denies_missing_evidence() -> None:
    evaluator = create_evaluator(CUSTOM_POLICY)

    result = evaluator.evaluate(
        {
            "intent_id": "GENERATION_CONTEXT",
            "evidence_mask": 0,
            "authority_scope_id": "generation",
            "policy_version": "custom-v1",
        }
    )

    assert result == {"decision": "DENIED", "reason_code": "E_EVIDENCE_MISSING"}


def test_custom_evaluator_errors_fail_closed() -> None:
    evaluator = create_evaluator(CUSTOM_POLICY)

    result = evaluator.evaluate(FailingMapping())

    assert result == {"decision": "DENIED", "reason_code": "E_EVALUATOR_INTERNAL"}


def test_custom_evaluator_results_do_not_share_mutable_state() -> None:
    evaluator = create_evaluator(CUSTOM_POLICY)
    request = {"intent_id": "GENERATION_CONTEXT", "evidence_mask": 1}

    first = evaluator.evaluate(request)
    first["decision"] = "DENIED"

    assert evaluator.evaluate(request) == {
        "decision": "ALLOWED",
        "reason_code": "POLICY_SATISFIED",
    }


def test_existing_govern_api_remains_available() -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1)

    assert result["decision"] == "ALLOWED"
    assert result["reason_code"] == "POLICY_SATISFIED"
    assert "latency_us" in result
