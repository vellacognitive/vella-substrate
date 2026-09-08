# Hybrid migration and rollback — SDK 2.1.0 / MCP 1.1.0 candidate

Status: unpublished candidates. Owner contract accepted 2026-09-08. Installed artifacts, resource/latency runs and hosted matrix must pass before release acceptance. Publication is a separate decision.

## Compatibility

| Path | Default / supported selection | Runtime target |
|---|---|---|
| Node SDK 2.1.0 default imports | Existing v2 proof semantics | Existing Node >=18 baseline |
| Python SDK 2.1.0 default imports | Existing v2 proof semantics | Existing Python >=3.10 baseline |
| Node `@vellacognitive/vella-sdk/pqc/index.js` | Explicit v3 hybrid only | Node >=24.20.0 <25, Linux/macOS |
| Python `vella.pqc` | Explicit v3 hybrid only | Python 3.12–3.14, cryptography 50.0.1, rfc8785 0.1.4 |
| MCP 1.1.0 default example | v2 | Node 22/24, Linux/macOS |
| MCP 1.1.0 `example/pqc/reference-server.mjs` | v3 hybrid | Node >=24.20.0 <25, POSIX local stdio |
| Existing `verify/verify.js`, `verify.py`, `verify.sh` | Existing v1/v2 interpretation | Existing dependencies |
| Packaged `vella-verify-v3` (Node or Python) | Explicit v3 plus supplied public registry/key-set | Same hybrid runtime as its SDK |
| `verify/verify-v3.sh` | Python v3 CLI; set `VELLA_PYTHON` if needed | Installed Python SDK with `pqc` extra |

Ranges describe the candidate's intended compatibility; the acceptance ledger identifies actual qualified combinations. Package versions are minor increments because v3 is additive and opt-in. Applications cannot use MCP 1.1.0 with SDK 2.0.0 for the new provider path. The exact peer and acceptance pairing is SDK 2.1.0 / MCP 1.1.0. Future SDK versions require a new compatibility qualification. Native ML-DSA failure is explicit; no single-signature fallback exists.

Node SDK introduces no external crypto library dependency. Python's optional `pqc` extra pins cryptography; applications adopting it must reconcile this dependency in their lockfile. The v3 Python provider imports native ML-DSA only when the operation is selected. The MCP package keeps its pinned official MCP/zod dependencies. Install from candidate artifacts until publication is authorized and verified; no registry availability is implied.

## Rollout

1. Inventory each proof producer, verifier, approval issuer and governed route. Keep a backup of the current application/package lockfiles and the existing v1/v2 public verification material. Record which operator configuration selects each format; do not let a received envelope choose execution trust.
2. Install the candidate SDK and MCP tarballs together in a staging application; install the Python wheel with `[pqc]` into a qualified interpreter. Verify package checksums against the handoff manifest. Keep the old verifiers for old archives.
3. As the operator, create a protected key directory with `openLocalKeyStore({directory, initialize: true})`, then `rotate()` to create the first active hybrid pair. Close the store before starting a separate reference server. Never expose key initialization, rotation, approvals or evidence editing as agent-accessible tools.
4. Create private report/proof directories. Configure `operatorUid`, `serverId`, `reportDirectory`, `proofDirectory`, `keyDirectory`, and `evidenceStatePath`; use the packaged hybrid reference launcher with this config file. Launch configuration and all ancestors must be operator-controlled. The report schema permits at most 4096 characters; workload acceptance specifically measures 1024/4096 ASCII bytes.
5. Reissue approvals using the v3 SHA-384 action, tool-definition and policy digests. v2 SHA-256 approvals cannot carry over. Both case-sensitive report routes need exact approvals. Use the same HYBRID_PROFILE in approval computation, governor, gate and proof sink.
6. Run the staging smoke checks: approved call creates exactly one report, authorization and unsigned receipt; missing evidence or either signer produces no effect; authorization storage failure produces no effect. A receipt failure after dispatch must preserve the observed outcome.
7. Retain each authorization and receipt with its policy artifact and independently trusted public registry. Verify representative proofs using both installed language verifiers. Activate only the routes whose operator profile and dependency checks passed. Monitor failure reasons and resource/latency limits; never convert a cryptographic dependency failure into an execution allowance.

The provided Node API README contains a key initialization/governor example. The local reference server is the controlled handler boundary. Direct filesystem access, unwrapped tools, hostile administrator/code in the same process, remote MCP and transport encryption are outside the proof guarantee.

## Rotation, revocation and archives

Rotate active keys at least annually and review security/dependencies annually. The provider refuses expired keys and rechecks the captured revision just before dispatch. For a separate maintenance process, stop the server, open the store, rotate/revoke, close it, and restart. Startup durably retains the new public registry and policy snapshot. In-process embedding can rotate through the same open store, but the application must also retain every resulting public registry. Never continue with an old cached signer after a mutation failure.

A crash can leave `.writer-lock`. Confirm the writer stopped, inspect the expected PID and state revision as the operator, then call `recoverLocalKeyLock({directory, expectedPid, expectedRevision, confirmStopped: true})`. Recovery refuses a live PID or mismatched state. Investigate uncertain persistence and reopen from disk; do not delete locks blindly.

Keep proofs and their verification material for seven years after proof creation. Key history extends seven years beyond the last permitted signing date and is never pruned automatically. Backups, restore testing, long-term storage capacity and lifecycle enforcement belong to the operator. Local fsync acknowledges file/directory flush, not remote replication or a seven-year preservation service. The key store permits at most 256 historical key sets; reaching capacity stops further rotation and needs planned custody migration, not deletion of needed history.

A current public registry reports active/retired/revoked keys. A historical snapshot reports only what that snapshot recorded; choose trust material deliberately and carry revocation updates separately. Signatures do not establish a trusted creation time or prove pre-compromise existence. Preserve revoked public keys for analysis but never reactivate them. Trusted timestamp/archive-renewal services are outside this release.

## Rollback

Stop new hybrid dispatch before changing the application. Reconcile in-flight attempts by attempt ID and retained artifacts; absence of a receipt is not proof of no effect. Preserve all v3 proofs, public registries and policy artifacts plus a functioning qualified v3 verifier environment.

Rollback the application to its saved classical configuration only through an explicit operator decision. Reinstall the saved package versions/lockfiles, use a separate classical key configuration and reissue classical approvals. This resumes a classical protection boundary and must not be described as hybrid. Do not accept a v3/draft envelope in the v2 verifier or strip a signature to force acceptance. A classical application rollback does not make old v3 archives unreadable when the independent v3 verifier is retained.

Do not restore an older hybrid key-state revision, reuse retired keys or remove revocations to make the old application start. Suspected key compromise requires immediate revocation and investigation; the system cannot prove old proofs predate compromise without an independent trusted time service.

## Claims

v3 protects the authorization proof boundary with mandatory P-256 and ML-DSA-65 plus SHA-384 bindings. It is an application-specific composition, not IETF Composite ML-DSA encoding or certification. It does not upgrade TLS, encrypt stored private keys, or make the host/identity infrastructure quantum safe. Deterministic policy evaluation remains separate from full proof/signing/storage/MCP latency. Only the final measured candidate can support updated performance statements.
