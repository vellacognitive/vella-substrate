# SDK 2.0.0 and MCP 1.0.0 — release guide

The owner selected these versions and explicitly authorized publication on September 8, 2026. The major SDK increment reflects changed signing output and stricter input validation. The SDK and MCP runtime passed the accepted local workload and hosted compatibility checks before release preparation.

## Supported pairing and boundaries

| Component | Version contract | Qualification |
|---|---|---|
| Node SDK | 2.0.0; Node >=18 | Core CI on Node 18 and 24/Linux; local Node 22/macOS. Windows proof-output smoke does not qualify the POSIX execution sink. |
| Python SDK | 2.0.0; Python >=3.10 | CI on Python 3.10 and 3.14/Linux; local Python 3.12/macOS. |
| MCP adapter | 1.0.0; exact peer SDK 2.0.0 | Node 22 and 24 on Linux/macOS; local operator-controlled stdio only. |
| MCP protocol | Official client/server 2.0.0; protocol 2026-07-28 | Lifecycle, tool calls, validation, cancellation, concurrency, fault recovery; other transports and consequential surfaces excluded. |
| Dependencies | MCP client/server 2.0.0 and Zod 4.5.4; Python rfc8785 0.1.4 and cryptography >=41 | Node lockfiles provide resolved dependency integrity. Record the actual Python dependency versions with each built candidate; an allowed range is not evidence that every version was tested. |

The SDK has no MCP dependencies. The adapter's exact SDK peer avoids claiming compatibility with the prior published SDK or untested future majors. Runtime ranges express installation requirements; the table identifies the tested combinations. Hosted operational smoke checks validate behavior, not the local performance thresholds on shared runners.

## Install and stage

Install the exact paired versions in a fresh application environment after registry publication:

```sh
npm install @vellacognitive/vella-sdk@2.0.0 @vellacognitive/vella-mcp-server@1.0.0
python -m pip install vella-sdk==2.0.0
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

The owner explicitly authorized SDK 2.0.0 and MCP 1.0.0 publication on September 8, 2026. This authorizes making the new versions available; it does not establish that production integrators received the ICD's minimum 90-day breaking-change notice. No prior notice date or integrator acknowledgment is recorded here. Existing 1.x versions remain available and unchanged. Production integrators must retain their existing pins until their applicable notice and migration arrangements are satisfied; publication does not initiate an automatic production rollout.

The stable-tag publisher verifies aligned versions, the released changelog and immutable tag binding. All registry jobs check out that verified commit. SDK npm and PyPI publishing use existing trusted publishers. MCP npm publishing requires its own trusted publisher for repository `vellacognitive/vella-substrate`, workflow `publish.yml`, environment `release`, with direct publishing enabled. The first MCP publication requires an authenticated npm maintainer to bootstrap the new package, then configure that trust; do not create a placeholder version or reuse another package's token. The workflow's `mcp` target supports later adapter publication from the verified SDK release tag. Registry publication results and artifact hashes are recorded separately from source approval.
