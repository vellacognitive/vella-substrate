# PQ production contract review implementation

Private, unpublished working implementation for M0/M1 of the PQ SOW. It differs from the completed feasibility experiment: one explicit hybrid-required suite, SHA-384 record bindings, a protected version/profile descriptor, bounded JSON/object inputs, stable verification failure categories, draft schemas, and public review vectors.

No released SDK or MCP entry point imports this directory. This is not the final provider API or an alternate MCP overlay. `proof.cjs` and `proof.py` use native cryptographic primitives; the gate, key store, public verifiers and deployment qualification follow contract review. Existing v1/v2 semantics are unchanged.

## Reproduce

Use Node 24.20.0 and Python 3.12–3.14 with cryptography 50.0.1, rfc8785 0.1.4, and jsonschema for schema checks. Other combinations are qualification work, not implied support. The proof module's Python dependency is exact for this draft.

From this directory:

```sh
PQC_PYTHON=/absolute/path/to/python PQC_PUBLIC_VECTORS=/absolute/path/to/public-vectors.json node conformance.mjs
/absolute/path/to/python schema_check.py /absolute/path/to/public-vectors.json
```

The runner sets its child Python import path to the repository SDK. All signing keys are generated for the run and travel only through process memory/private stdin/stdout pipes. The optional vector output includes public keys only. The bridge is a private test helper, not a packaged verification CLI. Public-vector files are safe synthetic test artifacts, not operator data.

See `spec/pqc/PROOF-CONTRACT-DRAFT.md` for exact bytes, `THREAT-AND-HASH-MAP.md` for migration dependencies, and `REVIEW-REQUEST.md` for the independent review needed before public contract freeze. Test counts describe engineering checks, not a security certification.
