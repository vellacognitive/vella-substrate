# Review disposition — v3 candidate

Mike Wilson is the selected reviewer and acceptance owner. The implementation was prepared by Codex; Mike reviewed the owner packet and stated “Reviewed and authorized” on 2026-09-08. This records owner contract review independent of the implementation work, not outside specialist review or cryptographic/FIPS certification. The review accepted the hybrid composition, local custody/retention boundary, final wire identifiers and continuation of the SOW. Final release acceptance remains a later owner decision.

| Issue / review focus | Disposition and evidence |
|---|---|
| Bind signatures to exact payload and required interpretation | Both P-256 and ML-DSA-65 sign the typed payload plus canonical format/key descriptor. Mandatory suite and independent trust inputs reject omission/downgrade. Final vectors and adversarial conformance exercise both runtimes. |
| Archive key context could misidentify the supplied key set | Corrected before owner review: signed key-set ID and revision must agree with supplied trust context. Node/Python/shell archive tests reject mismatches. |
| Evidence can expire during an awaited action precondition | Corrected before owner review: synchronous expiry validation occurs after the precondition, directly before dispatch. Tests show no effect after expiry. |
| Key revision can change before dispatch | Capture one revision per attempt and synchronously recheck it at dispatch. Eight concurrent pending attempts stop after rotation or revocation; a fresh active key recovers. |
| Uncertain key persistence could leave stale active signers | A persistence error faults the open store. Restart reconciles durable state; old snapshots cannot continue. Live writers are excluded; crash recovery is explicit. |
| Interrupted authorization acknowledgment and post-dispatch cancellation | Tests preserve a valid unused proof when acknowledgment is interrupted and report unknown outcomes after possible dispatch without replay. |
| Oversubscribed native MCP calls | The deterministic installed-reference pressure fixture admits eight, rejects eight without effects, and completes accepted work after acknowledgment release. No waiting queue is introduced. |
| Final public-schema metadata incorrectly used a nonexistent metaschema URL | Corrected the declaration to JSON Schema Draft 2020-12 and assigned distinct public v3 schema IDs. Validator selection now checks the published metadata; executable signed bytes and validation rules are unchanged. |
| Public API declaration gaps | Added the operator helper declarations and allowed the SDK's typed Policy in verification-material retention. Type checks cover the published import paths. Executable package payload comparison accompanies the retained latency evidence. |
| Future implementation drift | Four fixed public vectors cover both key origins and producers; Node/Python verification must preserve their signed-byte interpretation in addition to fresh round-trip tests. |

The local custody model is deliberately operator-managed plaintext private material protected by POSIX ownership/mode, with no secure-deletion, host-compromise, full-filesystem rollback or encrypted-at-rest guarantee. Seven years is a retention/verification target with annual key rotation and security review, not a cryptographic lifetime guarantee. Historical signatures do not establish trusted creation time or pre-compromise existence. Remote MCP, TLS, KMS, timestamp/archive renewal and independent external security certification remain outside this release.

No known unresolved finding in these checks defeats the stated signature binding or permits downgrade/unauthorized dispatch. This is a bounded review disposition, not a guarantee of no defects. QUALIFICATION.md and ACCEPTANCE.md identify the actual tested builds, measurement limits and remaining release gates.
