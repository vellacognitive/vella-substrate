"""Check published schemas against producer output and verifier structure rules."""
import base64
import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from vella import govern, verify_proof_v2

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = {p.stem: json.loads(p.read_text()) for p in (ROOT / "spec/schemas").glob("*.json")}
KEY = (Path(__file__).parent / "fixtures/test-signing-private.pem").read_text()
PUB = (Path(__file__).parent / "fixtures/test-signing-public.pem").read_text()


def test_producer_wrapper_and_authenticated_payload_match_schema():
    for schema in SCHEMAS.values():
        Draft202012Validator.check_schema(schema)
    for mask in [0, 1, -1]:
        result = govern("EXECUTE_CHANGE", mask, action={"args": {"nested": ["😀", 1.0]}}, proof_signing_key=KEY)
        bundle = result["proof_bundle"]
        Draft202012Validator(SCHEMAS["proof-v2"]).validate(bundle)
        record = verify_proof_v2(bundle, PUB)["authenticated"]
        Draft202012Validator(SCHEMAS["proof-v2"]["$defs"]["authorizationRecord"]).validate(record)
        assert record == json.loads(base64.b64decode(bundle["payload"]))


@pytest.mark.parametrize("field,value", [
    ("intent", None), ("evidence_mask", True), ("decision", "other"),
    ("reason_code", "DENY_FAST"), ("timestamp", "not-a-timestamp"),
    ("action_digest", None), ("external_effects", True), ("boundary", "remote"),
])
def test_schema_rejects_invalid_decoded_record(field, value):
    bundle = govern("EXECUTE_CHANGE", 1, action={}, proof_signing_key=KEY)["proof_bundle"]
    record = verify_proof_v2(bundle, PUB)["authenticated"]
    record[field] = value
    validator = Draft202012Validator(SCHEMAS["proof-v2"]["$defs"]["authorizationRecord"])
    assert not validator.is_valid(record)


def test_icd_resolves_real_legacy_and_v2_refs_and_allows_signing_failure():
    registry = Registry().with_resources([
        (f"https://vella.invalid/contracts/{filename}", Resource.from_contents(SCHEMAS[key]))
        for filename, key in [("proof.json", "proof"), ("proof-v2.json", "proof-v2")]
    ])
    schema = copy.deepcopy(SCHEMAS["icd"]["definitions"]["DecisionResponse"])
    schema["$id"] = "https://vella.invalid/contracts/icd.json"
    validator = Draft202012Validator(schema, registry=registry)
    result = {"decision": "ALLOWED", "reasonCode": "POLICY_SATISFIED", "latencyUs": 1}
    for bundle in [None, govern("EXECUTE_CHANGE", 1, proof_signing_key=KEY)["proof_bundle"], json.loads((ROOT / "test-vectors/valid/allowed-decision-v1.json").read_text())]:
        validator.validate(result | {"proofBundle": bundle})
    assert not validator.is_valid(result | {"proofBundle": {"kind": "unknown"}})
