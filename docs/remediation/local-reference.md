# Selected local reference contract

The owner selected a self-contained local reference on September 8, 2026: operator-controlled report-export server, operator-managed identity and exact-action approvals, and local disk proof retention. The preferred production binding is the server handler. The earlier client/server experiment remains a comparison artifact.

## Concrete operating choices

| Item | Initial implementation |
|---|---|
| Consequence | One new UTF-8 report file; no overwrite |
| Runtime / protocol | Node 22+, official MCP 2.0.0, 2026-07-28 stdio; test coverage reported separately |
| Host identity | Local OS UID checked at launch; operator session bound to that principal |
| Evidence authority | Operator-owned JSON state file containing session, permission and approval; server has no approval-authoring tool |
| Approval | Exact effective action digest plus loaded policy digest; expiry and revocation checked twice |
| Retention | Existing operator-owned local directory; exclusive write, file fsync, directory fsync, parent fsync |
| Recovery claim | Process interruption and subsequent verification; no power-loss, replication or remote filesystem certification |
| Proof | Approved exact-byte v2 authorization; separate explicitly unsigned execution receipt |
| Resource precondition | `absent`, checked before dispatch and atomically enforced by exclusive creation |
| Retry | No automatic replay; reconcile unresolved attempts against the target file |
| Limits | Report ID 1–64 ASCII letters/digits/underscore/hyphen; content at most 4096 JavaScript string code units; format `text`; strict extra-argument rejection |
| Gate timeout | 30 seconds by default; bounded 1 ms–300 seconds; receipt retention at most five additional seconds |
| Build identity | Explicitly unavailable (`null`) until a candidate commit/build identifier is supplied |
| Keys | Operator-managed P-256 key files; trusted public key configured separately from proof data |

These choices define the reference implementation, not a production SLA. The owner has selected the local setup; local performance thresholds and SDK 2.0.0 / MCP 1.0.0 candidate versions are owner-selected; sustained qualification and release timing remain separate. There is no inferred staffing, commercial or delivery-date commitment.

## Pre-measurement local workload

The first baseline uses 40 independent synthetic report attempts, concurrency four, 1024-byte report contents, a local file sink, and no retries. Twenty-four calls are eligible, eight fail trusted-evidence resolution, and eight fail authorization retention. The setup uses preconstructed test actions/approvals; it is not an end-user approval service. The expected consequence count is exactly 24, with zero effects for prerequisite failures.

Collect wall time and per-stage distributions for evidence, evaluation, proof preparation/signing, verification, authorization retention, revalidation, precondition, invocation and receipt retention. Evaluation uses the SDK's microsecond timing; preparation/signing is the remaining synchronous governor time. This is a local baseline, not an acceptance threshold or a sustained-load result. Set deployment latency/error/concurrency targets with the owner before declaring A16 accepted.

## Accepted sustained workload

On September 8, 2026, the owner accepted three-minute healthy scenarios for each combination of concurrency 1/4/8 and 1024/4096 ASCII bytes. Limits: p95 <=100 ms at concurrency 1, p95 <=250 ms at concurrency 4/8, p99 <=500 ms, zero unexpected failures and zero effects when evidence, signing or authorization storage fails. Four subsequent 30-second fault scenarios exercise mixed revoked approvals, signing failure, authorization storage failure and receipt storage failure; each includes two healthy recovery waves. The accepted run plan is `integrations/mcp-server/operational/plan.json`.

A single server/client connection receives waves of different exact-approved reports. Up to 64 approvals are supported; ambiguous matches or simultaneous singular/plural forms reject. The harness replaces operator state atomically after each wave settles. Client latency excludes approval preparation, while overall scenario throughput includes it. It uses closed-loop waves with no retries; this does not establish an open-loop arrival-rate SLA.

Use `node integrations/mcp-server/operational/run.mjs --output /path/to/results.json` for the sustained qualification. `--smoke` is a short functional preflight; it records timing but does not enforce local latency targets on shared CI runners. `until_dispatch` and `total` stage fields separate execution eligibility timing from completion/receipt timing. Source hashes and plan identity accompany each result. Build identity can be supplied by the operator as `buildHash`; it is recorded, not independently attested.
