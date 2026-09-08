"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

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
DECISION_DENIED_INTERNAL: Decision = {
    "decision": "DENIED",
    "reason_code": "E_EVALUATOR_INTERNAL",
}
DECISION_DENIED_INVALID_EVIDENCE: Decision = {
    "decision": "DENIED", "reason_code": "E_EVIDENCE_INVALID",
}
MAX_MASK = 0xFFFFFFFF
# Match ECMAScript String.trim exactly, including BOM but excluding NEL.
ECMASCRIPT_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


class InvalidEvidenceError(ValueError):
    pass


def _is_mask(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return 0 <= value <= MAX_MASK
    return (
        isinstance(value, float) and math.isfinite(value)
        and value.is_integer() and 0 <= value <= MAX_MASK
    )


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
    if not isinstance(value, str):
        return ""
    return value.strip(ECMASCRIPT_WHITESPACE).upper()


def _parse_unsigned_int_strict(text: str) -> int:
    if len(text) == 0:
        return -1
    value = 0
    for ch in text:
        code = ord(ch)
        if code < 48 or code > 57:
            return -1
        value = (value * 10) + (code - 48)
        if value > MAX_MASK:
            return -1
    return value


def to_evidence_mask(value: object, evidence_bits: Mapping[str, int]) -> int:
    if value is None:
        return 0

    if isinstance(value, (int, float)) and _is_mask(value):
        return int(value)

    if isinstance(value, str):
        trimmed = value.strip(ECMASCRIPT_WHITESPACE)
        numeric = _parse_unsigned_int_strict(trimmed)
        if numeric >= 0:
            return numeric
        bit = evidence_bits.get(_normalize_id(trimmed))
        if bit is not None and _is_mask(bit):
            return bit
        raise InvalidEvidenceError("evidence must be an unsigned 32-bit integer or known symbol")

    if isinstance(value, list):
        mask = 0
        for item in value:
            bit = evidence_bits.get(_normalize_id(item)) if isinstance(item, str) else None
            if bit is None or not _is_mask(bit):
                raise InvalidEvidenceError("every evidence list item must be a known symbol")
            mask |= bit
        return mask

    raise InvalidEvidenceError("unsupported evidence value")


def _policy_mask(value: object, label: str) -> int:
    if not isinstance(value, (int, float)) or not _is_mask(value):
        raise ValueError(f"{label} must be an unsigned 32-bit integer")
    return int(value)


def _policy_name(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip(ECMASCRIPT_WHITESPACE) or value != value.strip(ECMASCRIPT_WHITESPACE):
        raise ValueError(f"{label} must be a nonempty string without surrounding whitespace")
    return value


def _policy_object(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(k, str) for k in value):
        raise ValueError(f"{label} must be an object with string keys")
    return value


def compile_policy(policy_input: Mapping[str, object] | None = None) -> CompiledPolicy:
    policy = _policy_object(policy_input if policy_input is not None else DEFAULT_POLICY, "policy")
    policy_version = _policy_name(policy.get("policyVersion"), "policyVersion")
    default_scope = _policy_name(policy.get("defaultScope"), "defaultScope")
    raw_evidence = _policy_object(policy.get("evidenceBits"), "evidenceBits")
    evidence_bits: dict[str, int] = {}
    used_bits: set[int] = set()
    for key, value in raw_evidence.items():
        name = _normalize_id(_policy_name(key, "evidence name"))
        bit = _policy_mask(value, f"evidenceBits.{key}")
        if (name.isascii() and name.isdigit()) or name in evidence_bits:
            raise ValueError(f"ambiguous evidence name: {key}")
        if bit == 0 or bit & (bit - 1) or bit in used_bits:
            raise ValueError(f"evidenceBits.{key} must name a unique single bit")
        evidence_bits[name] = bit
        used_bits.add(bit)

    raw_scopes = _policy_object(policy.get("scopes"), "scopes")
    scopes: dict[str, CompiledScope] = {}
    for scope_name_obj, scope_cfg_obj in raw_scopes.items():
        scope_name = _policy_name(scope_name_obj, "scope name")
        scope_cfg = _policy_object(scope_cfg_obj, f"scopes.{scope_name}")
        raw_intents = _policy_object(scope_cfg.get("intents"), f"scopes.{scope_name}.intents")
        intent_rules: dict[str, int] = {}
        for intent_name_obj, intent_mask_obj in raw_intents.items():
            intent_name = _normalize_id(_policy_name(intent_name_obj, "intent name"))
            if intent_name in intent_rules:
                raise ValueError(f"normalized intent collision: {intent_name}")
            intent_rules[intent_name] = _policy_mask(intent_mask_obj, f"intent {intent_name}")

        allow_unknown = scope_cfg.get("allowUnknownIntents", False)
        if not isinstance(allow_unknown, bool):
            raise TypeError("allowUnknownIntents must be a boolean")
        default_required = _policy_mask(scope_cfg.get("defaultRequiredMask", 0), "defaultRequiredMask")
        scopes[scope_name] = CompiledScope(
            allow_unknown_intents=allow_unknown,
            default_required_mask=default_required,
            intent_rules=intent_rules,
        )

    if default_scope not in scopes:
        raise ValueError("defaultScope must reference a declared scope")

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
        try:
            return self._evaluate(input_dict)
        except InvalidEvidenceError:
            return DECISION_DENIED_INVALID_EVIDENCE.copy()
        except Exception:  # noqa: BLE001 - the public authority boundary must fail closed
            return DECISION_DENIED_INTERNAL.copy()

    def _evaluate(self, input_dict: Mapping[str, object] | None) -> Decision:
        if input_dict is None:
            return DECISION_DENIED_INTENT_REQUIRED.copy()

        raw_intent = (
            input_dict.get("intent_id")
            or input_dict.get("intent")
            or input_dict.get("action")
        )
        intent_id = _normalize_id(raw_intent)
        if not intent_id:
            return DECISION_DENIED_INTENT_REQUIRED.copy()

        authority_scope_id = input_dict.get("authority_scope_id")
        if authority_scope_id is None or authority_scope_id == "":
            scope = self._default_scope
            if scope is None:
                return DECISION_DENIED_FAST.copy()
        else:
            if not isinstance(authority_scope_id, str):
                return DECISION_DENIED_FAST.copy()
            scope = self._compiled.scopes.get(authority_scope_id)
            if scope is None:
                return DECISION_DENIED_FAST.copy()

        required_mask = scope.intent_rules.get(intent_id)
        if required_mask is None:
            if not scope.allow_unknown_intents:
                return DECISION_DENIED_FAST.copy()
            required_mask = scope.default_required_mask

        requested_policy_version = input_dict.get("policy_version")
        if (
            requested_policy_version is not None
            and requested_policy_version != ""
            and (not isinstance(requested_policy_version, str) or requested_policy_version != self._compiled.policy_version)
        ):
            return DECISION_DENIED_POLICY_VERSION.copy()

        evidence_mask = to_evidence_mask(input_dict.get("evidence_mask"), self._compiled.evidence_bits)
        if (evidence_mask & required_mask) != required_mask:
            return DECISION_DENIED_EVIDENCE.copy()

        return DECISION_ALLOWED.copy()


def create_evaluator(policy_input: Mapping[str, object] | None = None) -> Evaluator:
    return Evaluator(compile_policy(policy_input))
