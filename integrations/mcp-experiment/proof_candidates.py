"""Disposable cross-language proof experiment, not a Vella verifier."""
import base64
import json
import sys
from pathlib import Path

import rfc8785
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

FIXTURES = Path(__file__).resolve().parents[2] / "sdk/node/test/fixtures"
TYPES = {"vella-experiment/jcs", "vella-experiment/bytes"}


def pae(payload_type, payload):
    return f"DSSEv1 {len(payload_type.encode('utf8'))} {payload_type} {len(payload)} ".encode() + payload


request = json.load(sys.stdin)
if request["operation"] == "sign":
    if request.get("integralFloat"):
        request["value"]["integral"] = float(request["value"]["integral"])
    payload_type = "vella-experiment/" + request["mode"]
    if payload_type not in TYPES:
        raise ValueError("unknown experimental type")
    payload = rfc8785.dumps(request["value"]) if request["mode"] == "jcs" else json.dumps(
        request["value"], ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf8")
    key = serialization.load_pem_private_key((FIXTURES / "test-signing-private.pem").read_bytes(), None)
    signature = key.sign(pae(payload_type, payload), ec.ECDSA(hashes.SHA256()))
    print(json.dumps({"payloadType": payload_type, "payload": base64.b64encode(payload).decode(), "signature": base64.b64encode(signature).decode()}))
else:
    record = request["record"]
    if record["payloadType"] not in TYPES:
        raise ValueError("unknown experimental type")
    payload = base64.b64decode(record["payload"], validate=True)
    key = serialization.load_pem_public_key((FIXTURES / "test-signing-public.pem").read_bytes())
    key.verify(base64.b64decode(record["signature"], validate=True), pae(record["payloadType"], payload), ec.ECDSA(hashes.SHA256()))
    value = json.loads(payload)
    if record["payloadType"] == "vella-experiment/jcs" and rfc8785.dumps(value) != payload:
        raise ValueError("noncanonical experimental payload")
    print(json.dumps(value))
