"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import time
from datetime import datetime, timezone

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric import utils as asym_utils


def _uuidv7() -> str:
    buffer = bytearray(os.urandom(16))
    now_ms = int(time.time() * 1000)
    timestamp_bytes = struct.pack(">Q", now_ms)
    buffer[0:6] = timestamp_bytes[2:8]
    buffer[6] = (buffer[6] & 0x0F) | 0x70
    buffer[8] = (buffer[8] & 0x3F) | 0x80
    hexed = buffer.hex()
    return f"{hexed[:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:]}"


def _load_ec_private_key(signing_key_pem: str | bytes) -> ec.EllipticCurvePrivateKey:
    key_bytes = signing_key_pem.encode("utf-8") if isinstance(signing_key_pem, str) else signing_key_pem
    private_key = serialization.load_pem_private_key(key_bytes, password=None)
    if not isinstance(private_key, ec.EllipticCurvePrivateKey):
        raise ValueError("signing key must be an EC private key")
    return private_key


def build_envelope(
    intent_input: dict[str, object] | None,
    decision_result: dict[str, str] | None,
    context: dict[str, object] | None,
) -> dict[str, object]:
    request = intent_input if isinstance(intent_input, dict) else {}
    decision = decision_result if isinstance(decision_result, dict) else {}
    ctx = context if isinstance(context, dict) else {}

    return {
        "envelope_id": f"env_{_uuidv7()}",
        "intent": request.get("intent_id") or request.get("intent") or request.get("action"),
        "proposed": request.get("proposed"),
        "authority_scope": ctx.get("authorityScope") or request.get("authority_scope_id") or "sdk_v1_default",
        "evidence_mask": request.get("evidence_mask", 0),
        "decision": decision.get("decision", "DENIED"),
        "reason_code": decision.get("reason_code", "E_EVALUATOR_INTERNAL"),
        "policy_version": ctx.get("policyVersion", "min-v1"),
        "build_hash": ctx.get("buildHash", "unset"),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "ok": decision.get("decision") in ("ALLOWED", "DENIED"),
        "external_effects": False,
    }


def derive_key_id(signing_key_pem: str | bytes) -> str:
    private_key = _load_ec_private_key(signing_key_pem)
    public_der = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return f"key_{hashlib.sha256(public_der).hexdigest()[:16]}"


def sign_bundle(envelope: dict[str, object], signing_key_pem: str | bytes) -> dict[str, object]:
    canonical_envelope = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
    envelope_hash = f"sha256:{hashlib.sha256(canonical_envelope.encode('utf-8')).hexdigest()}"

    private_key = _load_ec_private_key(signing_key_pem)
    der_signature = private_key.sign(envelope_hash.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
    r_value, s_value = asym_utils.decode_dss_signature(der_signature)
    signature_bytes = r_value.to_bytes(32, "big") + s_value.to_bytes(32, "big")
    signature = base64.b64encode(signature_bytes).decode("utf-8")

    bundle_for_hash = {
        **envelope,
        "envelope_hash": envelope_hash,
        "signature_alg": "ecdsa-p256-sha256",
        "signature": signature,
    }
    canonical_bundle = json.dumps(bundle_for_hash, sort_keys=True, separators=(",", ":"))
    sha256_bundle = f"sha256:{hashlib.sha256(canonical_bundle.encode('utf-8')).hexdigest()}"

    return {
        **envelope,
        "envelope_hash": envelope_hash,
        "signature_alg": "ecdsa-p256-sha256",
        "signature": signature,
        "sha256_bundle": sha256_bundle,
        "key_id": derive_key_id(signing_key_pem),
        "kind": "vella_proof_bundle_v1",
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
