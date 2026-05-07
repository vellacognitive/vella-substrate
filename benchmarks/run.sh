#!/usr/bin/env bash
# VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC
#
# Convenience runner for the full benchmark suite.
#   ./benchmarks/run.sh                  # human-readable, both runtimes
#   ./benchmarks/run.sh --json > out.json   # machine-readable
#   ./benchmarks/run.sh --quick          # ~10s sanity check
#
# Requires: node >=18 (with --expose-gc), python3.10+, and the Python SDK
# installed in the active environment (pip install -e ./sdk/python).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

emit_json=false
quick=""
for arg in "$@"; do
  case "$arg" in
    --json)  emit_json=true ;;
    --quick) quick="--quick" ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if $emit_json; then
  node_out="$(node --expose-gc benchmarks/bench.js --json $quick)"
  py_out="$(python3 benchmarks/bench.py --json $quick)"
  printf '{\n  "node": %s,\n  "python": %s\n}\n' "$node_out" "$py_out"
else
  echo "▶ Node SDK"
  node --expose-gc benchmarks/bench.js $quick
  echo ""
  echo "▶ Python SDK"
  python3 benchmarks/bench.py $quick
fi
