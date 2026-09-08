import base64
import copy
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from vella import (
    DEFAULT_POLICY,
    action_digest,
    create_governor,
    govern,
    verify_proof_v2,
)
from vella.proof import build_envelope, sign_bundle
from vella.proof_v2 import canonicalize, parse_json

KEY = (Path(__file__).parent / "fixtures/test-signing-private.pem").read_text()
PUB = (Path(__file__).parent / "fixtures/test-signing-public.pem").read_text()
ACTION = {"server": "reports", "tool": "exportReport", "args": {"text": "café 😀", "values": [1.0, 0.000001, None, True], "nested": {"target": "a"}}}


def produce(**extra):
    options = {"intent": "EXECUTE_CHANGE", "evidence_mask": " AUTHN ", "action": ACTION, "proof_signing_key": KEY}
    return govern(**(options | extra))


def test_public_api_authenticates_action_and_policy():
    checked = verify_proof_v2(produce()["proof_bundle"], PUB)
    assert checked["ok"]
    assert checked["format"] == "v2"
    record = checked["authenticated"]
    assert record["action"] == ACTION
    assert record["action_digest"] == action_digest(ACTION)
    assert record["policy_digest"] == action_digest(DEFAULT_POLICY)
    assert record["evidence_mask"] == 1
    assert record["external_effects"] is False


def test_signature_covers_exact_typed_bytes():
    bundle = produce()["proof_bundle"]
    payload = base64.b64decode(bundle["payload"])
    signature = base64.b64decode(bundle["signature"])
    der = encode_dss_signature(int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big"))
    message = f'DSSEv1 {len(bundle["payload_type"].encode())} {bundle["payload_type"]} {len(payload)} '.encode() + payload
    public_key = serialization.load_pem_public_key(PUB.encode())
    public_key.verify(der, message, ec.ECDSA(hashes.SHA256()))


@pytest.mark.parametrize("field", ["kind", "payload_type", "signature_alg", "key_id", "payload_hash", "signature", "payload"])
def test_wrapper_alteration_rejects(field):
    bundle = produce()["proof_bundle"]
    bundle[field] += "changed"
    assert not verify_proof_v2(bundle, PUB)["ok"]


def test_nested_mutation_and_extra_fields_reject():
    bundle = produce()["proof_bundle"]
    record = json.loads(base64.b64decode(bundle["payload"]))
    record["action"]["args"]["nested"]["target"] = "b"
    bundle["payload"] = base64.b64encode(json.dumps(record).encode()).decode()
    assert not verify_proof_v2(bundle, PUB)["ok"]
    assert not verify_proof_v2(produce()["proof_bundle"] | {"exported_at": "now"}, PUB)["ok"]


def test_custom_governors_are_isolated_and_sign_actual_policy():
    policy = copy.deepcopy(DEFAULT_POLICY)
    policy["policyVersion"] = "reports-v1"
    policy["scopes"]["sdk_v1_default"]["intents"]["EXECUTE_CHANGE"] = 3
    custom = create_governor(policy)
    policy["scopes"]["sdk_v1_default"]["intents"]["EXECUTE_CHANGE"] = 0
    assert custom.govern("EXECUTE_CHANGE", 1)["decision"] == "DENIED"
    assert produce()["decision"] == "ALLOWED"
    result = custom.govern("EXECUTE_CHANGE", 3, policy_version="other", proof_signing_key=KEY)
    record = verify_proof_v2(result["proof_bundle"], PUB)["authenticated"]
    assert record["policy_version"] == "reports-v1"
    assert record["requested_policy_version"] == "other"
    assert record["reason_code"] == "E_POLICY_VERSION_MISMATCH"
    assert record["policy_digest"] == custom.policy_digest


def test_optional_proof_failure_preserves_policy_decision():
    result = produce(proof_signing_key="invalid")
    assert result["decision"] == "ALLOWED"
    assert result["proof_bundle"] is None
    assert isinstance(result["proof_error"], str)
    assert "proof_bundle" not in govern("EXECUTE_CHANGE", 1)


def test_invalid_evidence_signed_denial():
    record = verify_proof_v2(produce(evidence_mask=-1)["proof_bundle"], PUB)["authenticated"]
    assert record["reason_code"] == "E_EVIDENCE_INVALID"
    assert record["evidence_mask"] is None


def test_wrong_curve_rejects():
    key = ec.generate_private_key(ec.SECP384R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    pub = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    assert produce(proof_signing_key=pem)["proof_bundle"] is None
    assert not verify_proof_v2(produce()["proof_bundle"], pub)["ok"]


def test_canonical_digest_and_unsupported_values():
    assert action_digest({"z": 1.0, "a": {"10": 10, "2": 2}}) == action_digest({"a": {"2": 2, "10": 10}, "z": 1})
    assert canonicalize({"2": 2, "10": 10}) == b'{"10":10,"2":2}'
    for value in [float("nan"), float("inf"), 9007199254740992, "\ud800", (1,), {1: "x"}]:
        with pytest.raises((ValueError, TypeError)):
            action_digest(value)
    with pytest.raises(ValueError, match="duplicate"):
        parse_json('{"a":1,"\\u0061":2}')


def test_legacy_helper_still_explicitly_produces_v1():
    envelope = build_envelope({"intent": "EXECUTE_CHANGE", "evidence_mask": 1}, {"decision": "ALLOWED", "reason_code": "POLICY_SATISFIED"}, {})
    assert sign_bundle(envelope, KEY)["kind"] == "vella_proof_bundle_v1"
