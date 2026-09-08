#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash verify-v2.sh <bundle.json> <public-key.pem>" >&2
  exit 1
fi
VELLA_PYTHON="${VELLA_VERIFY_PYTHON:-python3}"
VELLA_HELPER="$(dirname "$0")/prepare-v2.py"
VELLA_VERIFY_TMP="$(mktemp -d)"
trap 'rm -rf "$VELLA_VERIFY_TMP"' EXIT

"$VELLA_PYTHON" "$VELLA_HELPER" prepare "$1" "$2" "$VELLA_VERIFY_TMP"
openssl dgst -sha256 -verify "$2" -signature "$VELLA_VERIFY_TMP/signature.der" "$VELLA_VERIFY_TMP/message.bin" >/dev/null
"$VELLA_PYTHON" "$VELLA_HELPER" validate "$VELLA_VERIFY_TMP/payload.bin"
echo "FORMAT v2: authenticated authorization record under supplied key; evidence truth and execution are not established." >&2
echo "VERIFIED"
