#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash verify/verify.sh <bundle.json> <public-key.pem>"
  exit 1
fi

BUNDLE_FILE="$1"
PUBLIC_KEY="$2"

for cmd in jq openssl base64 xxd shasum; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command missing: $cmd"
    exit 1
  fi
done

if [ ! -f "$BUNDLE_FILE" ]; then
  echo "ERROR: bundle file not found: $BUNDLE_FILE"
  exit 1
fi

if [ ! -f "$PUBLIC_KEY" ]; then
  echo "ERROR: public key file not found: $PUBLIC_KEY"
  exit 1
fi

ENVELOPE_HASH=$(jq -r '.envelope_hash // empty' "$BUNDLE_FILE")
SIGNATURE_B64=$(jq -r '.signature // empty' "$BUNDLE_FILE")
SHA256_BUNDLE=$(jq -r '.sha256_bundle // empty' "$BUNDLE_FILE")
BUNDLE_KEY_ID=$(jq -r '.key_id // empty' "$BUNDLE_FILE")

if [ -z "$ENVELOPE_HASH" ] || [ -z "$SIGNATURE_B64" ] || [ -z "$SHA256_BUNDLE" ]; then
  echo "FAILED"
  echo "- missing required fields"
  exit 1
fi

CANONICAL_ENVELOPE=$(jq -cS 'del(.envelope_hash, .signature_alg, .signature, .sha256_bundle, .key_id, .kind, .exported_at)' "$BUNDLE_FILE")
EXPECTED_ENVELOPE_HASH="sha256:$(printf '%s' "$CANONICAL_ENVELOPE" | shasum -a 256 | cut -d' ' -f1)"

TMPDIR_V=$(mktemp -d)
trap 'rm -rf "$TMPDIR_V"' EXIT

printf '%s' "$SIGNATURE_B64" | base64 -d > "$TMPDIR_V/sig.bin" 2>/dev/null
printf '%s' "$ENVELOPE_HASH" > "$TMPDIR_V/msg.txt"

p1363_to_der() {
  local in_file="$1"
  local out_file="$2"
  local sig_hex
  sig_hex=$(xxd -p "$in_file" | tr -d '\n')
  local r_hex="${sig_hex:0:64}"
  local s_hex="${sig_hex:64:64}"

  der_int() {
    local value="$1"
    while [[ "${value:0:2}" == "00" && ${#value} -gt 2 ]]; do
      value="${value:2}"
    done
    case "${value:0:1}" in
      [89a-fA-F]) value="00${value}" ;;
    esac
    printf '%02x%s' "$(( ${#value} / 2 ))" "$value"
  }

  local r_der s_der inner inner_len
  r_der=$(der_int "$r_hex")
  s_der=$(der_int "$s_hex")
  inner="02${r_der}02${s_der}"
  inner_len=$(( ${#inner} / 2 ))
  printf '%s' "30$(printf '%02x' "$inner_len")${inner}" | xxd -r -p > "$out_file"
}

p1363_to_der "$TMPDIR_V/sig.bin" "$TMPDIR_V/sig.der"

SIG_OK=true
if ! openssl dgst -sha256 -verify "$PUBLIC_KEY" -signature "$TMPDIR_V/sig.der" "$TMPDIR_V/msg.txt" >/dev/null 2>&1; then
  SIG_OK=false
fi

BUNDLE_FOR_HASH=$(jq -cS 'del(.sha256_bundle, .key_id, .kind, .exported_at)' "$BUNDLE_FILE")
EXPECTED_BUNDLE_HASH="sha256:$(printf '%s' "$BUNDLE_FOR_HASH" | shasum -a 256 | cut -d' ' -f1)"

KEY_ID_OK=true
if [ -n "$BUNDLE_KEY_ID" ]; then
  DER_PUB="$TMPDIR_V/pub.der"
  openssl pkey -pubin -in "$PUBLIC_KEY" -outform DER > "$DER_PUB" 2>/dev/null
  EXPECTED_KEY_ID="key_$(shasum -a 256 "$DER_PUB" | cut -d' ' -f1 | cut -c1-16)"
  if [ "$EXPECTED_KEY_ID" != "$BUNDLE_KEY_ID" ]; then
    KEY_ID_OK=false
  fi
fi

if [ "$EXPECTED_ENVELOPE_HASH" = "$ENVELOPE_HASH" ] && [ "$SIG_OK" = true ] && [ "$EXPECTED_BUNDLE_HASH" = "$SHA256_BUNDLE" ] && [ "$KEY_ID_OK" = true ]; then
  echo "VERIFIED"
  exit 0
fi

echo "FAILED"
[ "$EXPECTED_ENVELOPE_HASH" != "$ENVELOPE_HASH" ] && echo "- envelope_hash mismatch"
[ "$SIG_OK" != true ] && echo "- signature invalid"
[ "$EXPECTED_BUNDLE_HASH" != "$SHA256_BUNDLE" ] && echo "- sha256_bundle mismatch"
[ "$KEY_ID_OK" != true ] && echo "- key_id mismatch"
exit 1
