"""Structural validation for the OpenSSL v2 entry point; signature checks stay in OpenSSL."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sdk/python"))
from vella.proof_v2 import PAYLOAD_TYPE, pae, parse_json, prepare_verification, validate_record  # noqa: E402

if sys.argv[1] == "prepare":
    bundle = parse_json(Path(sys.argv[2]).read_text(encoding="utf8"))
    _, payload, signature, _ = prepare_verification(bundle, Path(sys.argv[3]).read_bytes())
    folder = Path(sys.argv[4])
    (folder / "message.bin").write_bytes(pae(PAYLOAD_TYPE, payload))
    (folder / "signature.der").write_bytes(signature)
    (folder / "payload.bin").write_bytes(payload)
elif sys.argv[1] == "validate":
    validate_record(parse_json(Path(sys.argv[2]).read_bytes().decode("utf8", errors="strict")))
else:
    raise SystemExit("unknown operation")
