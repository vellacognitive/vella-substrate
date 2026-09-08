"""v3 record contract. Preserve the released validator and its hash semantics."""
import hashlib
import re
from datetime import datetime
from typing import Any

from .bounded_json import assert_record_json, canonicalize

PROFILE = 'sha384-jcs-v1'
def digest(value: Any) -> str:
    return 'sha384:' + hashlib.sha384(canonicalize(value)).hexdigest()
RECORD_FIELDS = {"envelope_id", "request_id", "intent", "authority_scope", "policy_version", "requested_policy_version", "policy_digest", "evidence_mask", "decision", "reason_code", "timestamp", "action", "action_digest", "evidence", "boundary", "build_hash", "external_effects", "digest_profile"}
REASONS = {"POLICY_SATISFIED", "DENY_FAST", "E_INTENT_REQUIRED", "E_POLICY_VERSION_MISMATCH", "E_EVIDENCE_MISSING", "E_EVIDENCE_INVALID", "E_EVALUATOR_INTERNAL"}
def _fields(value: object, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"invalid {label} fields")
    return value


def _text(value: object) -> bool:
    return isinstance(value, str) and 0 < len(value.encode("utf8")) <= 1024


def validate_record(value: object) -> dict[str, Any]:
    assert_record_json(value)
    if type(value) is not dict or value.get("digest_profile") != PROFILE:
        raise ValueError("invalid digest_profile")
    record = _fields(value, RECORD_FIELDS, "authorization record")
    for field in ["envelope_id", "request_id", "authority_scope", "policy_version"]:
        if not _text(record[field]):
            raise ValueError(f"invalid {field}")
    for field in ["intent", "requested_policy_version", "build_hash"]:
        if record[field] is not None and not _text(record[field]):
            raise ValueError(f"invalid {field}")
    if not isinstance(record["policy_digest"], str) or not re.fullmatch(r"sha384:[a-f0-9]{96}", record["policy_digest"]):
        raise ValueError("invalid policy_digest")
    mask = record["evidence_mask"]
    if mask is not None and (isinstance(mask, bool) or not isinstance(mask, (int, float)) or int(mask) != mask or not 0 <= mask <= 0xFFFFFFFF):
        raise ValueError("invalid evidence_mask")
    decision, reason = record["decision"], record["reason_code"]
    if not isinstance(decision, str) or decision not in {"ALLOWED", "DENIED"} or not isinstance(reason, str) or reason not in REASONS:
        raise ValueError("invalid decision or reason")
    if (decision == "ALLOWED") != (reason == "POLICY_SATISFIED"):
        raise ValueError("inconsistent decision and reason")
    if decision == "ALLOWED" and (record["intent"] is None or mask is None):
        raise ValueError("allowed record lacks intent or evidence")
    timestamp = record["timestamp"]
    if not isinstance(timestamp, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", timestamp):
        raise ValueError("invalid timestamp")
    datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    for field in ["action", "evidence"]:
        if record[field] is not None and not isinstance(record[field], dict):
            raise ValueError("action and evidence must be objects or null")
    expected_digest = None if record["action"] is None else digest(record["action"])
    if record["action_digest"] != expected_digest:
        raise ValueError("action_digest mismatch")
    if record["boundary"] not in ("evaluation", "client-dispatch", "server-handler") or record["external_effects"] is not False:
        raise ValueError("invalid authorization boundary")
    return record
