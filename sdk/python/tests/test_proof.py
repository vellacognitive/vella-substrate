import base64
import hashlib
import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from vella import govern

SIGNING_EXCLUDED = {
    "envelope_hash",
    "signature_alg",
    "signature",
    "sha256_bundle",
    "key_id",
    "kind",
    "exported_at",
}


def _read_fixture(name: str) -> str:
    return (Path(__file__).parent / "fixtures" / name).read_text(encoding="utf-8")


def test_proof_bundle_is_generated() -> None:
    private_key = _read_fixture("test-signing-private.pem")
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1, proof_signing_key=private_key)
    proof_bundle = result.get("proof_bundle")
    assert isinstance(proof_bundle, dict)
    assert proof_bundle["kind"] == "vella_proof_bundle_v1"


def test_envelope_hash_verifies() -> None:
    private_key = _read_fixture("test-signing-private.pem")
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1, proof_signing_key=private_key)
    proof_bundle = result["proof_bundle"]
    assert isinstance(proof_bundle, dict)

    envelope = {k: v for k, v in proof_bundle.items() if k not in SIGNING_EXCLUDED}
    canonical_envelope = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
    expected_hash = f"sha256:{hashlib.sha256(canonical_envelope.encode('utf-8')).hexdigest()}"
    assert proof_bundle["envelope_hash"] == expected_hash


def test_signature_verifies() -> None:
    private_key = _read_fixture("test-signing-private.pem")
    public_key_pem = _read_fixture("test-signing-public.pem")

    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1, proof_signing_key=private_key)
    proof_bundle = result["proof_bundle"]
    assert isinstance(proof_bundle, dict)

    public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    assert isinstance(public_key, ec.EllipticCurvePublicKey)

    signature_bytes = base64.b64decode(str(proof_bundle["signature"]))
    r_value = int.from_bytes(signature_bytes[:32], "big")
    s_value = int.from_bytes(signature_bytes[32:], "big")
    der_signature = encode_dss_signature(r_value, s_value)

    public_key.verify(
        der_signature,
        str(proof_bundle["envelope_hash"]).encode("utf-8"),
        ec.ECDSA(hashes.SHA256()),
    )


def test_bundle_hash_verifies() -> None:
    private_key = _read_fixture("test-signing-private.pem")
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1, proof_signing_key=private_key)
    proof_bundle = result["proof_bundle"]
    assert isinstance(proof_bundle, dict)

    envelope = {k: v for k, v in proof_bundle.items() if k not in SIGNING_EXCLUDED}
    bundle_for_hash = {
        **envelope,
        "envelope_hash": proof_bundle["envelope_hash"],
        "signature_alg": proof_bundle["signature_alg"],
        "signature": proof_bundle["signature"],
    }
    canonical_bundle = json.dumps(bundle_for_hash, sort_keys=True, separators=(",", ":"))
    expected_hash = f"sha256:{hashlib.sha256(canonical_bundle.encode('utf-8')).hexdigest()}"
    assert proof_bundle["sha256_bundle"] == expected_hash


def test_proof_bundle_absent_when_no_signing_key() -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1)
    assert "proof_bundle" not in result
