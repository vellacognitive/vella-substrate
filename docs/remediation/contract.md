# Remediation contract and feasibility decisions

Status: release preparation, September 8, 2026. The initial implementation and hosted matrix passed through PRs #15/#16. This document distinguishes the retained feasibility experiment from the selected local server reference; final candidate evidence accompanies handoff.

## Reference workflow

The owner-selected local reference workflow exports a report into a harness-owned temporary folder. A controlled MCP server exposes case-distinct `exportReport` and `ExportReport` tools. The retained private experiment uses a less restricted case-distinct control. In the selected server reference, both case-distinct tools require all four checks: identity, permission, freshness and exact-action approval. The tool accepts a bounded report identifier, content, and a defaulted text format. The consequence is a new local file, created exclusively to prevent silent overwrite.

The runtime is Node, the protocol dependencies are official MCP client/server 2.0.0, and the experiment uses stdio at protocol revision 2026-07-28. This is an experiment support matrix, not a production support commitment. The owner subsequently selected the local reference setup. Its concrete operating choices are recorded in [local-reference.md](local-reference.md); the owner has selected SDK 2.0.0 / MCP 1.0.0 and the local workload limits; sustained measurements and final candidate validation are recorded separately.

## Enforcement decision

Recommend a reusable in-process gate immediately before an operator-controlled server's protected handler. A client binding is appropriate for a trusted host calling a server it cannot modify. The experiment verifies both and includes a bypass counterexample: a direct call bypasses the client-only gate, while the server-handler gate still denies a raw client's request.

The production claim must enumerate every covered route to the resource. Local filesystem or other non-MCP routes require their own controls. The example does not claim that SDK code can constrain a process or caller that can replace the gate.

## Proposed production contract

1. Resolve the effective action after validated defaults, coercion, and resource lookup. Bind server/tool identity, request and attempt IDs, principal/resource references, exact arguments or a defined digest, and any relevant state version.
2. Resolve evidence through a trusted application integration. Bind approvals to the action and validate expiry/revocation where required. Treat tool annotations and model-supplied assertions as untrusted.
3. Evaluate the selected immutable policy snapshot. Record its version and digest; do not identify a policy solely by a mutable label.
4. Separate the policy decision from execution eligibility. Denial, malformed input, evaluator faults, and failures in required evidence, signing, or storage prevent dispatch.
5. In the reference production mode, require an acknowledged signed authorization record before invocation. Define the acknowledgment's durability. Check cancellation and relevant state preconditions before crossing the execution boundary.
6. Invoke once per controlled attempt. Link the authorization record and observed result with an execution receipt. Preserve an unknown outcome after possible execution when the result is unavailable; retry only under the downstream reconciliation/idempotency contract.

The private fixture preserves the original comparison. The reusable Node gate and separate MCP server package now implement the local reference with v2 signing, an operator-state evidence provider, acknowledged fsync retention and correlated receipts. Process-kill tests cover the before/after-dispatch distinction; external IAM and replicated storage remain outside this reference.

## Proof comparison and recommendation

Both private candidates protect nested content and authenticated payload type in the tested fixtures. Node and Python can produce and verify each other's records. Shared fixtures cover nested arguments, arrays, Unicode including supplementary characters, numeric boundaries, and an explicitly produced Python `1.0`.

| Decision factor | Canonical JSON candidate | Exact signed bytes candidate |
|---|---|---|
| What gets verified | A precisely canonical representation plus its authenticated type | The transmitted serialized payload bytes plus their authenticated type |
| Equivalent objects with different key order | Same payload bytes in shared tests | May produce different payload bytes; both signatures remain verifiable |
| Python `1.0` and Node `1` | Canonical form is `1` | Original producer representation survives; verification does not reserialize it |
| Implementation burden | Every producer must implement the same canonicalization/value domain | Verifiers authenticate bytes, then parse and validate that verified payload |
| Remaining work | Normative domain, parser validation, schema/versioning, trust rules, migration | The same contract work; stable action digests still need a defined canonical representation |

**Owner-approved selection (September 8, 2026):** use a new versioned envelope that authenticates exact payload bytes and their interpretation; use a separate defined canonical action representation where equivalent-action digests are required. Keep legacy v1 verification explicitly separate and disclose its protection limits. Do not rewrite stored v1 records or claim that omitted historical fields were authenticated. The new format is implemented as v2 with P-256/SHA-256 and a typed exact-byte payload. SDK 2.0.0 and MCP 1.0.0 are selected as unreleased candidate versions. Rollout date and notice remain pending; no release tag or publication has changed.

The experiment remains comparative code. Production format behavior is now defined separately in [the v2 contract](../../spec/proof-v2.md); its use of DSSE pre-authentication encoding does not claim full DSSE envelope conformance. Production verification must reject unsupported types/algorithms, validate structure and encodings, establish signer trust, and parse only authenticated content.

References: [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), and [DSSE protocol](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md).

## Implemented correctness contract

Both SDKs now reject invalid evidence and malformed custom policies, reject normalized identifier collisions, and agree through bit 31. See [input validation](../../spec/input-validation.md). Both SDKs now expose isolated policy-bound governors with optional v2 signing. The three verifier entry points dispatch v2 separately from historical v1 hash rules; v1 verification reports its limitations.

The checked-in shared regression family failed 26 Node and 24 Python tests before remediation; all those cases pass after the changes. This is evidence about the specified defects, not a project-wide correctness certificate. Production gate, adapter, package, and performance acceptance remain separate.

## Milestone status and next dependencies

M0 has executable client/server experiments, owner-selected proof format and local workflow, and a concrete reference evidence/retention contract. Final supported-runtime acceptance, workload thresholds, release migration details and delivery constraints remain open. M1 input/policy corrections, v2 proofs and policy-bound signing are implemented with regression and producer/verifier checks. Acceptance is subject to review of the unreleased changes and compatibility plan. M2/M3 reference implementations passed local and hosted functional verification. M4 and production acceptance remain open. R1 release preparation remains an independent later step.

Next, complete the owner-approved sustained workload, candidate package checks, migration/rollback rehearsal and hosted checks on the final candidate. See [release-candidate.md](release-candidate.md).

A staffing-based delivery estimate cannot be defensibly fixed while the actual integration and retention obligations are unknown. The current implementation is performed within the owner's authorized development task; no external fee, staffing commitment, deadline, or production acceptance is inferred.
