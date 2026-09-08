#!/bin/sh
# Install vella-sdk[pqc] into this interpreter first. No profile auto-detection.
set -eu
exec "${VELLA_PYTHON:-python3}" -m vella.pqc.verify_cli "$@"
