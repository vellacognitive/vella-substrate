"""Cross-language conformance producer using the supported Python API."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "sdk/python"))
from vella import govern  # noqa: E402

request = json.load(sys.stdin)
# Exercise a serialized Python float that Node would emit as integer 1.
request["action"]["integral_float"] = 1.0
result = govern("EXECUTE_CHANGE", 1, action=request["action"], proof_signing_key=Path(sys.argv[1]).read_bytes())
print(json.dumps(result["proof_bundle"], ensure_ascii=False))
