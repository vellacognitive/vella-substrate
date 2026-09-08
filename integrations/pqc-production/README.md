# PQ production conformance and regression checks

The implementation now lives in `sdk/node/pqc/`, `sdk/python/vella/pqc/`, and `integrations/mcp-server/example/pqc/`. These private test entry points delegate to those modules. There is no parallel draft implementation; the approved v3 format rejects private draft/feasibility identifiers.

Run on Node 24.20+ within 24.x with `PQC_PYTHON` pointing to Python 3.12–3.14 / cryptography 50.0.1. `conformance.mjs` runs cross-language/provider checks and optionally writes public-only vectors to `PQC_PUBLIC_VECTORS`. `schema_check.py VECTORS` checks the frozen schemas. Run `node --test integrations/pqc-production/*.test.mjs` for key/gate/MCP/archive tests. The test bridge uses the source Python package; installed-package qualification is separate.

Owner contract acceptance, remaining qualification and migration are recorded in `spec/pqc/`. No production performance or release completion follows from a conformance pass alone.
