"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping

from .policy import DEFAULT_POLICY

Decision = dict[str, str]

DECISION_ALLOWED: Decision = {"decision": "ALLOWED", "reason_code": "POLICY_SATISFIED"}
DECISION_DENIED_FAST: Decision = {"decision": "DENIED", "reason_code": "DENY_FAST"}
DECISION_DENIED_INTENT_REQUIRED: Decision = {
    "decision": "DENIED",
    "reason_code": "E_INTENT_REQUIRED",
}
DECISION_DENIED_POLICY_VERSION: Decision = {
    "decision": "DENIED",
    "reason_code": "E_POLICY_VERSION_MISMATCH",
}
DECISION_DENIED_EVIDENCE: Decision = {
    "decision": "DENIED",
    "reason_code": "E_EVIDENCE_MISSING",
}


@dataclass(frozen=True)
class CompiledScope:
    allow_unknown_intents: bool
    default_required_mask: int
    intent_rules: dict[str, int]


@dataclass(frozen=True)
class CompiledPolicy:
    policy_version: str
    default_scope: str
    evidence_bits: dict[str, int]
    scopes: dict[str, CompiledScope]


def _normalize_id(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def _parse_unsigned_int_strict(text: str) -> int:
    if len(text) == 0:
        return -1
    value = 0
    for ch in text:
        code = ord(ch)
        if code < 48 or code > 57:
            return -1
        value = (value * 10) + (code - 48)
        if not math.isfinite(value):
            return -1
    return value & 0xFFFFFFFF


def to_evidence_mask(value: object, evidence_bits: Mapping[str, int]) -> int:
    if isinstance(value, bool):
        return 0

    if isinstance(value, int):
        return value & 0xFFFFFFFF

    if isinstance(value, float) and math.isfinite(value):
        return int(value) & 0xFFFFFFFF

    if isinstance(value, str):
        trimmed = value.strip()
        numeric = _parse_unsigned_int_strict(trimmed)
        if numeric >= 0:
            return numeric & 0xFFFFFFFF
        bit = evidence_bits.get(_normalize_id(trimmed))
        return (bit & 0xFFFFFFFF) if bit is not None else 0

    if isinstance(value, list):
        mask = 0
        for item in value:
            bit = evidence_bits.get(_normalize_id(item))
            if bit is not None:
                mask |= bit
        return mask & 0xFFFFFFFF

    return 0


def _to_int(value: object, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return int(value)
    if isinstance(value, str):
        parsed = _parse_unsigned_int_strict(value.strip())
        if parsed >= 0:
            return parsed
    return default


def compile_policy(policy_input: Mapping[str, object] | None = None) -> CompiledPolicy:
    policy = policy_input if policy_input is not None else DEFAULT_POLICY

    raw_evidence = policy.get("evidenceBits")
    evidence_bits: dict[str, int] = {}
    if isinstance(raw_evidence, Mapping):
        for key, value in raw_evidence.items():
            if not isinstance(key, str):
                continue
            evidence_bits[key] = _to_int(value) & 0xFFFFFFFF

    raw_scopes = policy.get("scopes")
    scopes: dict[str, CompiledScope] = {}
    if isinstance(raw_scopes, Mapping):
        for scope_name_obj, scope_cfg_obj in raw_scopes.items():
            if not isinstance(scope_name_obj, str):
                continue
            scope_name = scope_name_obj
            scope_cfg = scope_cfg_obj if isinstance(scope_cfg_obj, Mapping) else {}

            raw_intents = scope_cfg.get("intents")
            intent_rules: dict[str, int] = {}
            if isinstance(raw_intents, Mapping):
                for intent_name_obj, intent_mask_obj in raw_intents.items():
                    if not isinstance(intent_name_obj, str):
                        continue
                    intent_name = _normalize_id(intent_name_obj)
                    if not intent_name:
                        continue
                    intent_rules[intent_name] = _to_int(intent_mask_obj) & 0xFFFFFFFF

            allow_unknown = bool(scope_cfg.get("allowUnknownIntents") is True)
            default_required = _to_int(scope_cfg.get("defaultRequiredMask"), 0) & 0xFFFFFFFF
            scopes[scope_name] = CompiledScope(
                allow_unknown_intents=allow_unknown,
                default_required_mask=default_required,
                intent_rules=intent_rules,
            )

    default_scope_obj = policy.get("defaultScope")
    default_scope = str(default_scope_obj) if default_scope_obj is not None else "sdk_v1_default"

    policy_version_obj = policy.get("policyVersion")
    policy_version = str(policy_version_obj) if policy_version_obj is not None else "min-v1"

    return CompiledPolicy(
        policy_version=policy_version,
        default_scope=default_scope,
        evidence_bits=evidence_bits,
        scopes=scopes,
    )


class Evaluator:
    def __init__(self, compiled_policy: CompiledPolicy) -> None:
        self._compiled = compiled_policy
        self._default_scope = compiled_policy.scopes.get(compiled_policy.default_scope)
        self.policy_version = compiled_policy.policy_version

    def evaluate(self, input_dict: Mapping[str, object] | None) -> Decision:
        if input_dict is None:
            return DECISION_DENIED_INTENT_REQUIRED

        raw_intent = (
            input_dict.get("intent_id")
            or input_dict.get("intent")
            or input_dict.get("action")
        )
        intent_id = _normalize_id(raw_intent)
        if not intent_id:
            return DECISION_DENIED_INTENT_REQUIRED

        authority_scope_id = input_dict.get("authority_scope_id")
        if authority_scope_id is None or authority_scope_id == "":
            scope = self._default_scope
            if scope is None:
                return DECISION_DENIED_FAST
        else:
            scope = self._compiled.scopes.get(str(authority_scope_id))
            if scope is None:
                return DECISION_DENIED_FAST

        required_mask = scope.intent_rules.get(intent_id)
        if required_mask is None:
            if not scope.allow_unknown_intents:
                return DECISION_DENIED_FAST
            required_mask = scope.default_required_mask

        requested_policy_version = input_dict.get("policy_version")
        if (
            requested_policy_version is not None
            and requested_policy_version != ""
            and str(requested_policy_version) != self._compiled.policy_version
        ):
            return DECISION_DENIED_POLICY_VERSION

        evidence_mask = to_evidence_mask(input_dict.get("evidence_mask"), self._compiled.evidence_bits)
        if (evidence_mask & required_mask) != required_mask:
            return DECISION_DENIED_EVIDENCE

        return DECISION_ALLOWED


def create_evaluator(policy_input: Mapping[str, object] | None = None) -> Evaluator:
    return Evaluator(compile_policy(policy_input))
