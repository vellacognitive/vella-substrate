#!/usr/bin/env python3
"""Standalone VELLA proof-bundle verifier."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

SIGNING_EXCLUDED_FIELDS = {
    "envelope_hash",
    "signature_alg",
    "signature",
    "sha256_bundle",
    "key_id",
    "kind",
    "exported_at",
}


def derive_key_id_from_pub(public_key_pem: str) -> str:
    public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return f"key_{hashlib.sha256(public_der).hexdigest()[:16]}"


def verify(bundle: dict[str, Any], public_key_pem: str) -> tuple[bool, list[str]]:
    errors: list[str] = []

    required_fields = [
        "envelope_id",
        "decision",
        "reason_code",
        "envelope_hash",
        "signature_alg",
        "signature",
        "sha256_bundle",
    ]
    for field in required_fields:
        if bundle.get(field) is None:
            errors.append(f"missing required field: {field}")

    envelope = {k: v for k, v in bundle.items() if k not in SIGNING_EXCLUDED_FIELDS}

    canonical_envelope = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
    expected_envelope_hash = f"sha256:{hashlib.sha256(canonical_envelope.encode('utf-8')).hexdigest()}"
    if bundle.get("envelope_hash") != expected_envelope_hash:
        errors.append("envelope_hash mismatch")

    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
        assert isinstance(public_key, ec.EllipticCurvePublicKey)

        signature_bytes = base64.b64decode(str(bundle.get("signature", "")))
        if len(signature_bytes) != 64:
            errors.append("signature length is not 64 bytes (P-256 P1363 expected)")
        else:
            r_value = int.from_bytes(signature_bytes[:32], "big")
            s_value = int.from_bytes(signature_bytes[32:], "big")
            der_signature = encode_dss_signature(r_value, s_value)
            public_key.verify(
                der_signature,
                str(bundle.get("envelope_hash", "")).encode("utf-8"),
                ec.ECDSA(hashes.SHA256()),
            )
    except Exception as exc:  # noqa: BLE001
        errors.append(f"signature invalid: {exc}")

    bundle_for_hash = {
        **envelope,
        "envelope_hash": bundle.get("envelope_hash"),
        "signature_alg": bundle.get("signature_alg"),
        "signature": bundle.get("signature"),
    }
    canonical_bundle = json.dumps(bundle_for_hash, sort_keys=True, separators=(",", ":"))
    expected_bundle_hash = f"sha256:{hashlib.sha256(canonical_bundle.encode('utf-8')).hexdigest()}"
    if bundle.get("sha256_bundle") != expected_bundle_hash:
        errors.append("sha256_bundle mismatch")

    key_id = bundle.get("key_id")
    if isinstance(key_id, str) and key_id:
        expected_key_id = derive_key_id_from_pub(public_key_pem)
        if key_id != expected_key_id:
            errors.append(f"key_id mismatch (bundle={key_id}, key={expected_key_id})")

    return (len(errors) == 0, errors)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a VELLA proof bundle")
    parser.add_argument("bundle", help="Path to proof bundle JSON")
    parser.add_argument("public_key", help="Path to PEM public key")
    args = parser.parse_args()

    try:
        bundle = json.loads(Path(args.bundle).read_text(encoding="utf-8"))
        assert isinstance(bundle, dict)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot read bundle: {exc}")
        return 1

    try:
        public_key_pem = Path(args.public_key).read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot read public key: {exc}")
        return 1

    ok, errors = verify(bundle, public_key_pem)
    if ok:
        print("VERIFIED")
        return 0

    print("FAILED")
    for error in errors:
        print(f"- {error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
