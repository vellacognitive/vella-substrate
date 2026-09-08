# MCP boundary experiment

Private, disposable SOW feasibility work. This directory is **not a supported production adapter** and its signed records are **not Vella v1 or a finalized v2 format**. The production contract is tracked in [the remediation contract](../../docs/remediation/contract.md).

The fixture uses the official MCP client and server packages at 2.0.0, Node 20 or later, and stdio with the 2026-07-28 protocol explicitly pinned. The modern server entry point is `serveStdio`; a hand-wired legacy connection does not satisfy that pinned negotiation. The experiment was run locally on Node 22.22.3 and Python 3.12.14. CI is configured for Node 24/Python 3.11; those hosted results are not yet available.

## Run

Use an isolated Python environment with Python 3.10 or later. From this directory:

```sh
npm ci --ignore-scripts
python3 -m pip install -r requirements.txt
npm test
npm run demo
```

Set `VELLA_EXPERIMENT_PYTHON` to the Python executable if it is not `python3`. The requirements support the proof comparison, not the embedded SDK or MCP protocol. The package is marked private and adds no dependencies to either core SDK.

The demo creates temporary directories, exports a small local report for allowed calls, counts reports and proof files, and deletes its temporary artifacts. Tests include:

- Client and server allow/deny paths with actual local file consequences.
- Evidence, evaluator, required-signing, and required-storage fault injection.
- Case-distinct tool mapping, invalid arguments, unknown tools, and action-bound approval.
- A client-only bypass reaching the unguarded fixture, and a raw client being denied by the server gate.
- Pre-dispatch client cancellation and a simulated lost result after invocation.
- Both proof candidates produced and verified in Node/Python, including changed signed content, nested Unicode/arrays, and Python integral floats.

## Scope of the observations

`exportReport` requires AUTHN and AUTHZ; `ExportReport` requires AUTHN. The different mappings intentionally demonstrate case-sensitive tool identity without deriving policy names by uppercasing tools.

The trusted harness supplies evidence in process configuration. An MCP caller cannot supply it through tool arguments. This is a fixture provider, not an IAM integration. `format: text` is resolved before the recorded action and execution, and an approval digest binds that effective action.

The signer uses checked-in test keys. The file sink acknowledges process-level write completion; no power-loss durability, replicated retention, or production path-hardening claim is made. Fault injection establishes insertion points, not production signer/store resilience. The fixture issues authorization records only for allowed calls and returns an observed outcome; durable denial records and execution receipts remain production-contract work.

The proof candidates compare canonical JSON and exact signed payload bytes using an authenticated payload type and DSSE-style pre-authentication encoding. Neither implementation has full production structural validation, key-trust management, parser hardening, or a normative accepted-value domain. The tests establish behavior on explicit fixtures, not full protocol or cryptographic certification. Existing public signers/verifiers remain unchanged.

HTTP authentication, stale tool-definition updates, resumed calls, remote cancellation, crash recovery, freshness/revocation integration, load limits, packaged production APIs, and full workflow completeness are not implemented by this experiment. Only the specifically tested tool-call boundary is demonstrated.
