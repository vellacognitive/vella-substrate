# SDK 2.0.0 and MCP 1.0.0 — unreleased candidate

The owner selected these versions on September 8, 2026. This is a candidate for validation and handoff, not a published release. The major SDK increment reflects changed signing output and stricter input validation. The MCP package remains private until its separate publication decision.

## Supported pairing and boundaries

| Component | Candidate contract | Qualification |
|---|---|---|
| Node SDK | 2.0.0; Node >=18 | Core CI on Node 18 and 24/Linux; local Node 22/macOS. Windows proof-output smoke does not qualify the POSIX execution sink. |
| Python SDK | 2.0.0; Python >=3.10 | CI on Python 3.10 and 3.14/Linux; local Python 3.12/macOS. |
| MCP adapter | 1.0.0; exact peer SDK 2.0.0 | Node 22 and 24 on Linux/macOS; local operator-controlled stdio only. |
| MCP protocol | Official client/server 2.0.0; protocol 2026-07-28 | Lifecycle, tool calls, validation, cancellation, concurrency, fault recovery; other transports and consequential surfaces excluded. |
| Dependencies | MCP client/server 2.0.0 and Zod 4.5.4; Python rfc8785 0.1.4 and cryptography >=41 | Node lockfiles provide resolved dependency integrity. Record the actual Python dependency versions with each built candidate; an allowed range is not evidence that every version was tested. |

The SDK has no MCP dependencies. The adapter's exact SDK peer avoids claiming compatibility with the prior published SDK or untested future majors. Runtime ranges express installation requirements; the table identifies the tested combinations. Hosted operational smoke checks validate behavior, not the local performance thresholds on shared runners.

## Install and stage

Use the supplied candidate tarballs together in a fresh application environment:

```sh
npm install ./vellacognitive-vella-sdk-2.0.0.tgz ./vellacognitive-vella-mcp-server-1.0.0.tgz
python -m pip install ./vella_sdk-2.0.0-py3-none-any.whl
```

Verify artifact SHA-256 hashes against the candidate manifest first. Use an isolated Python environment and retain its resolved dependency list. The candidate source archive preserves the repository verifier layout, schemas, tests, lockfiles, examples and operating documentation.

The example requires an existing operator-owned local directory and P-256 key pair, OS UID binding, live session, exact resource permission and exact-action approval. The operator may provide one `approval` or an `approvals` array of at most 64 records, never both. Multiple matching approvals reject. Batch updates must be atomic; do not replace approvals for in-flight calls. The reference exposes no tool to grant approvals or edit identity.

Supply the validated candidate/source digest as `buildHash` in launch configuration. This records an operator assertion of build identity; it is not remote attestation. The execution gate signs it into authorization records.

## Operating limits and failure handling

Use the accepted local workload envelope: 1, 4 or 8 concurrent calls; 1,024 or 4,096 ASCII content bytes; no automatic retries. The schema separately limits content to 4,096 JavaScript string code units, so the byte envelope does not cover maximum-size non-ASCII inputs. The harness bounds in-flight calls; the server reference does not itself enforce an admission limit. Operators must apply admission control before accepting more concurrent actions than the qualified envelope. No open-loop arrival-rate guarantee is established.

`until_dispatch` measures gate entry through the start of handler dispatch. `total` measures gate entry through receipt retention. Client end-to-end latency also includes MCP transport and serialization. A missing dispatch timing means the handler was not started. Outcome and retention fields determine recovery; latency alone does not.

| Observed state | Required operator action |
|---|---|
| `not_started`, required evidence/signing/authorization retention failed | Repair the dependency and obtain a current exact-action approval before a new attempt. Do not reuse an expired approval. |
| Authorization retained; `not_started` | Keep the record. Check revocation/precondition and issue a fresh attempt only after resolving the cause. Authorization alone does not prove an effect. |
| `reported_success`, receipt not retained | Preserve the response and authorization. Reconcile the report file; repair receipt storage. Do not replay a successful report merely to create a receipt. |
| `unknown` after possible dispatch | Stop automatic action attempts. Inspect the uniquely named target and its exact expected content using the retained authorization. Record the investigation separately; do not relabel the original receipt. |
| Restart with authorization but no receipt | Reconcile the target file before any new action. Retain v2 verification capability and the configured trusted public keys. |

The guarantee is acknowledged local file/directory fsync with tested process interruption. It does not establish hardware power-loss survival, replicated retention or protection from an operator who can replace the gate or modify its files.

## Rollout and rollback

1. Preserve the current application version, deployment configuration, package hashes, public-key trust configuration and retained evidence. Do not put private keys into release artifacts.
2. Upgrade verifiers first and validate both v1 archives and v2 test records. V1 warnings remain material; verification does not authenticate omitted historical fields.
3. Stage the new producer and MCP handler with no real external consequences. Verify exact action binding, live evidence, denied-call behavior, storage faults and receipt recovery using the supplied example.
4. Admit traffic gradually within the qualified envelope. Stop admission when required signing/storage is unavailable; investigate unexpected failures or latency exceeding the selected budget.
5. On rollback, stop and drain the MCP handler; reconcile all unknown or receipt-missing attempts. Restore the prior application/producer package from the preserved artifact. SDK 1.0.3 has no mandatory gate and cannot serve as MCP 1.0.0's peer: leave that MCP adapter stopped if reverting the SDK.
6. Keep the v2-capable verifier and trust configuration available for every retained v2 record. Do not rewrite v2 authorizations to v1 or move existing release tags. Run the installed producer/verification rehearsal in `scripts/check-migration.mjs` before accepting the rollback plan.

The prior immutable SDK 1.0.3 baseline is `cbafda49ddb1682832b438498437d62de4f84d95`. The final candidate manifest supplies the new commit and artifact hashes; pin those immutable identities for adoption. Never replace a pin with an unverified `main`, mutable branch or illustrative hash.

## Publication and notice

The ICD promises a minimum 90-day notice for breaking changes affecting production integrators. No notice start date, affected-integrator acknowledgment, rollout date or waiver has been established by this build. Keep the 2.0.0 changelog entry unreleased until the owner resolves the notice and release schedule. Preparation and testing do not authorize announcing or publishing a release.

The existing stable-tag publication workflow verifies metadata, immutable tag binding and released status before registry publication. MCP 1.0.0 remains private and is not silently added to that SDK publisher. A later explicit publication decision must cover the MCP registry workflow and package access as well as SDK release timing.
