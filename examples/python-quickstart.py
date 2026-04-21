import os
import sys

from vella import govern

SIGNING_KEY_PATH = "/tmp/example-signing.key"

if not os.path.exists(SIGNING_KEY_PATH):
    print(f"VELLA quickstart: signing key not found at {SIGNING_KEY_PATH}", file=sys.stderr)
    print(file=sys.stderr)
    print("Generate one with:", file=sys.stderr)
    print(f"  openssl ecparam -name prime256v1 -genkey -noout -out {SIGNING_KEY_PATH}", file=sys.stderr)
    print(file=sys.stderr)
    print("See examples/walkthrough.md for the full walkthrough.", file=sys.stderr)
    sys.exit(1)

with open(SIGNING_KEY_PATH, "r", encoding="utf-8") as handle:
    signing_key = handle.read()

result = govern(
    intent="EXECUTE_CHANGE",
    evidence_mask=1,
    proof_signing_key=signing_key,
)

print(result)
