"""Versioned authorization proofs authenticating exact UTF-8 payload bytes."""
from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from datetime import datetime
from typing import Any

import rfc8785
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

KIND = "vella_proof_bundle_v2"
PAYLOAD_TYPE = "application/vnd.vella.authorization.v2+json"
ALGORITHM = "ecdsa-p256-sha256"
MAX_BYTES = 1024 * 1024
MAX_DEPTH = 32
REASONS = {"POLICY_SATISFIED", "DENY_FAST", "E_INTENT_REQUIRED", "E_POLICY_VERSION_MISMATCH", "E_EVIDENCE_MISSING", "E_EVIDENCE_INVALID", "E_EVALUATOR_INTERNAL"}
RECORD_FIELDS = {"envelope_id", "request_id", "intent", "authority_scope", "policy_version", "requested_policy_version", "policy_digest", "evidence_mask", "decision", "reason_code", "timestamp", "action", "action_digest", "evidence", "boundary", "build_hash", "external_effects"}
BUNDLE_FIELDS = {"kind", "payload_type", "payload", "signature_alg", "signature", "key_id", "payload_hash"}


def assert_json(value: object, depth: int = 0, ancestors: set[int] | None = None) -> None:
    if depth > MAX_DEPTH:
        raise ValueError("JSON nesting exceeds 32 levels")
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        if isinstance(value, int):
            valid = abs(value) <= 9007199254740991
        else:
            valid = math.isfinite(value) and (not value.is_integer() or abs(value) <= 9007199254740991)
        if not valid:
            raise ValueError("unsupported JSON number")
        return
    if isinstance(value, str):
        value.encode("utf8", errors="strict")
        return
    seen = ancestors if ancestors is not None else set()
    if not isinstance(value, (dict, list)) or id(value) in seen:
        raise ValueError("unsupported or cyclic JSON value")
    seen.add(id(value))
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("JSON object keys must be strings")
            assert_json(key, depth + 1, seen)
            assert_json(item, depth + 1, seen)
    else:
        for item in value:
            assert_json(item, depth + 1, seen)
    seen.remove(id(value))


def canonicalize(value: Any) -> bytes:
    assert_json(value)
    return rfc8785.dumps(value)


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonicalize(value)).hexdigest()


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def parse_json(text: str) -> Any:
    value = json.loads(text, object_pairs_hook=_pairs)
    assert_json(value)
    return value


def _fields(value: object, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"invalid {label} fields")
    return value


def _text(value: object) -> bool:
    return isinstance(value, str) and 0 < len(value.encode("utf8")) <= 1024


def validate_record(value: object) -> dict[str, Any]:
    assert_json(value)
    record = _fields(value, RECORD_FIELDS, "authorization record")
    for field in ["envelope_id", "request_id", "authority_scope", "policy_version"]:
        if not _text(record[field]):
            raise ValueError(f"invalid {field}")
    for field in ["intent", "requested_policy_version", "build_hash"]:
        if record[field] is not None and not _text(record[field]):
            raise ValueError(f"invalid {field}")
    if not isinstance(record["policy_digest"], str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", record["policy_digest"]):
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


def pae(payload_type: str, payload: bytes) -> bytes:
    return f"DSSEv1 {len(payload_type.encode('utf8'))} {payload_type} {len(payload)} ".encode() + payload


def _public_key_id(key: ec.EllipticCurvePublicKey) -> str:
    public = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return "key_" + hashlib.sha256(public).hexdigest()[:16]


def _decode64(value: object, maximum: int) -> bytes:
    if not isinstance(value, str) or len(value) > ((maximum + 2) // 3) * 4:
        raise ValueError("invalid base64 length")
    decoded = base64.b64decode(value, validate=True)
    if len(decoded) > maximum or base64.b64encode(decoded).decode() != value:
        raise ValueError("invalid base64 encoding or length")
    return decoded


def sign_v2(record: dict[str, Any], signing_key: str | bytes) -> dict[str, Any]:
    validate_record(record)
    payload = json.dumps(record, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf8")
    if len(payload) > MAX_BYTES:
        raise ValueError("payload exceeds 1 MiB")
    key = serialization.load_pem_private_key(signing_key.encode() if isinstance(signing_key, str) else signing_key, password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        raise TypeError("key must use P-256")
    message = pae(PAYLOAD_TYPE, payload)
    der = key.sign(message, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return {
        "kind": KIND, "payload_type": PAYLOAD_TYPE, "payload": base64.b64encode(payload).decode(), "signature_alg": ALGORITHM,
        "signature": base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode(),
        "key_id": _public_key_id(key.public_key()), "payload_hash": "sha256:" + hashlib.sha256(message).hexdigest(),
    }


def prepare_verification(bundle: object, public_key: str | bytes) -> tuple[dict[str, Any], bytes, bytes, ec.EllipticCurvePublicKey]:
    record = _fields(bundle, BUNDLE_FIELDS, "v2 bundle")
    if record["kind"] != KIND or record["payload_type"] != PAYLOAD_TYPE or record["signature_alg"] != ALGORITHM:
        raise ValueError("unsupported v2 format or algorithm")
    payload = _decode64(record["payload"], MAX_BYTES)
    signature = _decode64(record["signature"], 64)
    if len(signature) != 64:
        raise ValueError("signature must have 64 bytes")
    key = serialization.load_pem_public_key(public_key.encode() if isinstance(public_key, str) else public_key)
    if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
        raise TypeError("key must use P-256")
    if record["key_id"] != _public_key_id(key):
        raise ValueError("key_id mismatch")
    message = pae(PAYLOAD_TYPE, payload)
    if record["payload_hash"] != "sha256:" + hashlib.sha256(message).hexdigest():
        raise ValueError("payload_hash mismatch")
    der = encode_dss_signature(int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big"))
    return record, payload, der, key


def verify_v2(bundle: object, public_key: str | bytes) -> dict[str, Any]:
    try:
        wrapper, payload, signature, key = prepare_verification(bundle, public_key)
        key.verify(signature, pae(PAYLOAD_TYPE, payload), ec.ECDSA(hashes.SHA256()))
        record = validate_record(parse_json(payload.decode("utf8", errors="strict")))
        return {"ok": True, "format": "v2", "errors": [], "warnings": [], "authenticated": record,
                "computed": {"payload_hash": wrapper["payload_hash"], "key_id": wrapper["key_id"]}}
    except Exception as error:  # noqa: BLE001 - verifier must reject malformed/untrusted records
        return {"ok": False, "format": "v2", "errors": [str(error) or "invalid signature"], "warnings": []}
