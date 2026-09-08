#!/bin/sh
# Python is the explicit qualified ML-DSA backend for this review shell route.
set -eu
VELLA_PQ_VERIFY_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "${PQC_PYTHON:-python3}" "$VELLA_PQ_VERIFY_DIR/verify_cli.py" "$@"
