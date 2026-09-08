# PQ production contract review implementation

Private, unpublished working implementation for M0/M1 of the PQ SOW. It differs from the completed feasibility experiment: one explicit hybrid-required suite, SHA-384 record bindings, a protected version/profile descriptor, bounded JSON/object inputs, stable verification failure categories, draft schemas, and public review vectors.

No released SDK or MCP entry point imports this directory. This is not the final provider API or an alternate MCP overlay. `proof.cjs` and `proof.py` use native cryptographic primitives; the shared SDK/gate now accepts the explicit provider; the private key store, reference MCP server and review verifier routes are implemented. Public format freeze, final package entry points and deployment qualification follow owner review. Existing v1/v2 semantics are unchanged.

## Reproduce

Use Node 24.20.0 and Python 3.12–3.14 with cryptography 50.0.1, rfc8785 0.1.4, and jsonschema for schema checks. Other combinations are qualification work, not implied support. The proof module's Python dependency is exact for this draft.

From this directory:

```sh
PQC_PYTHON=/absolute/path/to/python PQC_PUBLIC_VECTORS=/absolute/path/to/public-vectors.json node conformance.mjs
/absolute/path/to/python schema_check.py /absolute/path/to/public-vectors.json
```

The runner sets its child Python import path to the repository SDK. All signing keys are generated for the run and travel only through process memory/private stdin/stdout pipes. The optional vector output includes public keys only. The bridge is a private test helper, not a packaged verification CLI. Public-vector files are safe synthetic test artifacts, not operator data.

See `spec/pqc/PROOF-CONTRACT-DRAFT.md` for exact bytes, `THREAT-AND-HASH-MAP.md` for migration dependencies, and `REVIEW-REQUEST.md` for the independent review needed before public contract freeze. Test counts describe engineering checks, not a security certification.

## Additional integration checks

With the same Node/Python environment, run `PQC_PYTHON=/absolute/path/to/python node --test *.test.mjs`. This exercises the actual SDK governor/gate, operator evidence provider and native MCP registration; no generated overlay substitutes their source. The private reference resolves the MCP package's existing pinned dependencies.

`openLocalKeyStore` creates protected local state, rotates/revokes complete key pairs and exposes only public metadata through `status()`. `capture()` gives a bounded-lifetime signing/verification session with a synchronous final validity check. Stop the reference server before using another writer process to rotate/revoke its keys, then restart it. A live writer lock is never stolen. After a crash, `recoverLocalKeyLock` requires confirmation of the stopped PID and expected durable revision. Application-controlled rotation within a running process invalidates its pending snapshots before dispatch.

The reference server retains immutable policy/public-trust artifacts in `verification-material/` under its proof directory. Keep them with the proofs and the applicable verifier/source versions for the accepted seven-year target. Annual key expiry restricts new signing, not historical signature verification. No automatic deletion or historical creation-time guarantee is implemented.

Review CLI syntax is `node verify-cli.mjs PROOF PUBLIC_TRUST KEY_SET_ID p256+ml-dsa-65`, with equivalent Python and `sh verify-cli.sh` routes. The public trust path must be operator-owned and not group/world writable. The shell route explicitly uses the selected Python crypto backend. Results report the supplied trust snapshot and never grant execution authority. These private routes will be moved into the supported verifier/package paths only after contract review.
