# Local single-host MCP operations

Scope: operator-controlled local stdio, local filesystem, SDK 2.1.0 and the hybrid MCP reference. This is optional adopter guidance for this reference adapter, not a repository release checklist. Use the [acceptance template](local-mcp-acceptance.md) only when qualifying your own installation. This runbook supplies procedures; it does not establish that a production operator, monitoring service or backup system is configured.

## Deployment record

Before admitting consequential work, record the host and OS, filesystem and mount options, Node version, exact SDK/MCP package hashes and lockfile, operator UID, server identity, configuration digest, policy digest and current public trust revision. Keep the configuration itself private. Specify the expected arrival pattern, payload distribution, concurrency, latency/error targets, retention volume, recovery time and acceptable evidence loss. Name the operator and incident contact. Unknown fields remain the adopter's acceptance questions; they do not block SDK release.

The hybrid reference admits eight concurrent calls with no waiting queue and uses a 30-second gate deadline. Excess requests receive `CAPACITY_EXCEEDED`; admission is not a retry service. Keep public trust, policy history and a qualified verifier separately recoverable. The demo approval issuer is a fixture, not a production approval service.

## Observations and alerts

The client receives governance metadata in `_meta["com.vellacognitive/governance"]`. Record allowlisted fields: request/attempt ID, decision, eligibility, outcome, reason, authorization/receipt retention and stage timings. Some early validation responses have no attempt ID or timing. A transport failure may leave no response; reconcile against retained artifacts. Do not log report contents, action arguments, private keys, entire evidence state or raw proof payloads by default. Telemetry must not go to protocol stdout. Restrict access and retention for operational IDs too.

An operator-owned client/supervisor must collect these observations and host disk/process health. The reference launcher does not implement a persistent alerting service, metrics endpoint or notification delivery. A dependency health check must not submit an automatically approved consequential action. Exercise alerts using synthetic staging work and record the receiver, trigger, detection time, response and recovery evidence.

| Observation | Initial response and release condition |
|---|---|
| `SIGNING_UNAVAILABLE` or `KEYS_CHANGED` | Stop admission to the affected route; inspect key validity/revision and provider health. Resume only after operator repair and a fresh approved staging call. Do not fall back to a single signature or older trust state. |
| `RETENTION_UNAVAILABLE` | Stop admission; inspect permissions, filesystem health and free space. Preserve any partially retained artifacts. Resume after storage repair and verified authorization/receipt retention. |
| Authorization retained, receipt not retained | Reconcile by attempt ID even if outcome says success. Preserve the response separately; do not replay an effect to manufacture a receipt. |
| `unknown`, transport loss, or termination with in-flight calls | Stop new attempts for the affected actions. Compare retained authorization with the exact target and content. Missing receipt does not prove missing effect. Record investigation separately without rewriting original records. |
| `EVIDENCE_UNAVAILABLE`, `EVIDENCE_CHANGED`, or policy denial | Inspect approval/session/revocation and exact action binding. Denials can be expected; alert on unexplained changes or deployment-defined rates. Never relax policy as a health workaround. |
| `CAPACITY_EXCEEDED` | Record rejection rate and workload. Apply caller backpressure; no automatic replay of unresolved calls. Any new attempt needs current exact-action approval. |
| Disk pressure or process exit | Stop admission before retention capacity is exhausted; reconcile unfinished work. Define disk headroom from measured artifact volume and response time, not the harness's temporary 8 GiB cap. |
| Key approaching expiry | Schedule operator maintenance before expiry; alert if no responsible operator acknowledges. Track dates from public trust metadata without exposing private state. |

Unknown outcomes and missing receipts require immediate investigation. Rate, latency, disk and expiry-warning thresholds must be selected for the deployment and exercised; this document does not invent a customer error budget. Receipts are unsigned observations, and an `ALLOWED` policy decision alone does not establish an effect or execution eligibility.

## Stop, drain and restart

1. Stop the upstream operator/client from admitting new actions or issuing new approvals. Keep an inventory of pending request/attempt IDs.
2. Wait for calls to settle within the configured gate and receipt windows. A timed-out handler may still have performed an effect; timeout does not establish that arbitrary application work was undone. Reconcile unknown outcomes before issuing new attempts.
3. Close the client connection and terminate the server only after settlement/reconciliation where possible. The current launcher exits immediately on `SIGTERM`; the signal itself is not a drain mechanism. Forced termination requires the interruption procedure below.
4. Preserve configuration/package identities and evidence. Restart only with the selected immutable artifacts and current key state. Verify the UID and private directory ownership, then perform an explicitly approved synthetic staging check before resuming admission.

## Interruption and uncertain effects

Use the retained attempt ID and verified authorization to identify the exact report path and expected content. Compare the actual file, authorization and any response/receipt. Distinguish unused authorization, observed effect and unresolved outcome. Keep an append-only operator investigation record with evidence hashes and the resolution; do not change an unsigned receipt into a signed or successful historical claim.

For a stale key writer lock, first establish that the recorded writer has exited and capture its PID and durable state revision. Use `recoverLocalKeyLock({directory, expectedPid, expectedRevision, confirmStopped: true})` from the qualified SDK as described in [migration](../../spec/pqc/MIGRATION.md). Never delete a lock blindly, restore an older revision to make startup succeed, or reuse retired/revoked keys.

## Backup and restore rehearsal

Stop admission and settle work before taking a consistent snapshot, unless the backup system supplies and has validated equivalent consistency. Inventory and hash reports, authorizations, receipts, retained policy artifacts and all required public trust history. Keep the manifest and trusted public-key fingerprints in a separately controlled location; a checksum stored only beside an attacker-modifiable backup does not establish authenticity.

Protect signing-key recovery separately under the operator's custody controls. The key directory contains private material: do not include it in public evidence, issue attachments or verifier-only archives. A restore of private state must preserve revocations and the latest durable revision; archive verification never requires private keys.

Restore into a new isolated directory with no production client or automatic action execution. Check completeness and hashes against the independent inventory, verify every authorization with the explicit hybrid suite and independently selected public trust, and reconcile receipts/reports with their attempts. Report missing, altered and unrecognized files. A valid signature authenticates authorization, not successful execution, receipt authenticity or a trusted signing time. Preserve revocation information even when verifying older snapshots.

Measure restore duration and compare evidence loss with the selected recovery objectives. Exercise a missing file, corrupted proof and missing trust material as negative cases. Record backup identity, manifest identity, verifier/package identities, file counts, failures, elapsed time and operator review. Do not point the running producer at an archival restore or reactivate old signing state. Local copy tests do not establish off-host redundancy, power-loss durability or the actual backup service's recoverability.

## Key maintenance and compromise

Review dependencies/algorithms and rotate active keys at least annually under the accepted hybrid contract. For separate-process maintenance: stop/drain, open the store as the operator, rotate or revoke, close it, then restart and retain the new public registry. Retain historical verification material for the documented period; do not prune it to recover capacity. The store's 256-key-set bound requires planned migration.

Suspected compromise requires immediate admission stop, revocation/rotation and investigation. Do not claim that a signed timestamp proves a proof predates compromise. Record the affected revision and verification limitations; preserve revoked public keys for analysis. Rehearse these steps in staging, never by intentionally compromising production keys.

## Release verification and rollback

Record registry package URL/version, downloaded artifact digest, resolved dependency lockfile and source/release identity in a private deployment manifest. Verify against independently retained release evidence. A tag, install success or matching version string alone does not establish identical package bytes. Source main can differ from a previously published package even when its package.json version has not yet changed; never overwrite a published version to deliver a patch.

Build/install the exact candidate in an isolated staging application. Run the [installed qualification fixtures](../../integrations/pqc-production/operational/README.md), retaining their reports and source/installation identities. Complete target-environment performance acceptance separately. Record the rollout owner, stop conditions and known-good package/configuration backup. Package publication requires its own release decision.

Rehearse rollback with admission stopped and unresolved attempts reconciled. Preserve a v3-capable verifier, public trust and historical records. A classical rollback needs explicit selection, its own key configuration and fresh approvals; it does not permit accepting v3 in a v2 verifier or stripping a signature. Do not roll back durable hybrid key revisions or revocations. Resume only after a fresh staging validation and operator decision.
