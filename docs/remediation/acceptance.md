# SOW acceptance ledger — local review candidate

Date: September 8, 2026. Base commit: `7af5a878ed002271f74a0c1d1a0b3071d7e66985`. Branch: `codex/sow-contract-and-validation`. This ledger is a **pre-commit local evidence snapshot**, not a published-release acceptance. The associated pull request records the immutable candidate and subsequent hosted checks; publication remains a separate decision.

The owner approved exact signed payload bytes for v2, separate legacy interpretation, and the local operator-controlled MCP reference. Local checks ran on macOS with Node 22.22.3 and Python 3.12.14. “Local pass” below means the listed fixtures passed in that environment; it does not mean owner acceptance or complete deployment coverage.

## Evidence by requirement

| ID | Local status | Fixture / expected result | Observed result and remaining boundary |
|---|---|---|---|
| A01 | Local pass | `test-vectors/policy-validation.json`; both SDK validation suites reject invalid masks without wrapping | Shared numeric/symbolic limits pass. Additional whitespace parity and non-text identifier coercion cases now pass. |
| A02 | Local pass | Both validation/proof suites: all 32 bits, malformed policies, normalized collisions, separate instances | Required-bit decisions agree and policy snapshots remain isolated. ASCII policy identifiers are the interoperability recommendation across Unicode-table versions. |
| A03 | Local pass | `scripts/proof-conformance.test.mjs`: Node/Python producers, nested JSON, Unicode, numbers, three verifier entry points | 50 conformance tests pass, including 174 CLI checks. Shell shares Python structural validation and uses OpenSSL for signatures; these are not three independent parsers. |
| A04 | Local pass | Proof suites and conformance: mutate every record field; valid signatures over malformed records; key/algorithm/type/encoding checks | Alterations and unsupported records reject. Noncanonical but valid exact bytes verify. No mutable metadata area exists inside v2. |
| A05 | Local pass, archival limits retained | Original valid/tampered vectors through Node, Python and shell | All 18 historical outcomes retained. Legacy warnings and migration notes identify omitted metadata/nested fields and historical language differences. |
| A06 | Local reference pass | Gate and MCP tests compare executed arguments with verified action, applied defaults, action/policy approvals and resource version | Exact executed arguments match the record. Changed arguments, identity, target, policy or definition prevent stale approval reuse. Exclusive report creation enforces the absent-resource precondition. |
| A07 | Local reference pass | `sdk/node/test/execution.test.js`: missing/expired/revoked/mismatched session, permission and approval; revalidation after retention | Required evidence faults produce zero handler invocations. Operator-owned local state is trusted; no external IAM connector or remote identity claim. |
| A08 | Local reference pass | Gate and real MCP faults: invalid action/tool/schema, evaluator error, signing failure, storage failure, false acknowledgment | Zero protected invocations. Signing/storage faults preserve a valid policy ALLOWED result while execution is ineligible. Retention cannot mutate the verified proof. |
| A09 | Local reference pass | Source and installed MCP demos; gate correlation test | Approved request creates one report after proof acknowledgment and links authorization, attempt and receipt. No automatic replay. |
| A10 | Local reference pass | MCP server tests: case-distinct names, same names on different servers, duplicate registration, changed schema/revision | Identity stays distinct. Exported schema changes stop dispatch. Handler/hidden semantic changes require an operator-declared revision; arbitrary code replacement is outside the boundary. |
| A11 | Local reference pass; deployment acceptance open | `sdk/node/test/interruption.test.js`: kill child after retained authorization, before/after effect; verify from a new process | Retained proof survives the tested process interruptions. No false receipt appears. File/directory fsync is acknowledged; hardware power-loss, replication and other filesystems are untested. |
| A12 | Local reference pass | Core deadline/cancellation tests and real stdio cancellation/timeout tests | Pre-dispatch cancellation prevents invocation. After possible dispatch the retained receipt says unknown; no replay occurs. |
| A13 | Local reference pass | Private client/server experiment plus controlled server tests, including raw calls and concurrent requests | Both demonstrators work; raw client bypasses client-only protection but cannot bypass the registered server gate. Non-MCP filesystem routes remain operator responsibilities. |
| A14 | Partial | Actual official SDK 2.0.0 / 2026-07-28 stdio lifecycle, tool calls, schema errors and cancellation | Local combination passes. CI is configured for MCP Node 22/24 on Linux/macOS but has not run. HTTP, remote authentication and other consequential MCP surfaces are excluded. |
| A15 | Partial | `scripts/check-package-install.mjs`, public declarations, Python typing metadata, release checks | Built Node tarballs and Python wheel install into clean environments; installed v2 verification, declarations and installed MCP demo pass. Immutable candidate commit, hosted matrix, release versions and adoption pins remain open. |
| A16 | Open; baseline measured | `scripts/reference-baseline.mjs`, parameters fixed in `local-reference.md` before measurement | 40 calls, concurrency four, 1024-byte content: 24 effects and 16 stopped prerequisite-failure calls. Stage timings recorded. This component baseline is not sustained MCP transport load or an agreed performance acceptance threshold. A subsequent [latency comparison](latency-review.md) measured 600 governed MCP calls: medians 18.91 ms at 1024 bytes and 19.98 ms at 4096 bytes, with 100 missing-evidence calls stopped. Warm SDK adjudication retains microsecond latency; sustained acceptance remains open. |

## Local checks completed

- Node SDK: 97 tests, including policy/proof correctness, gate failure paths and process interruption.
- Python SDK: 80 tests, including input parity, v2 proofs and schema contracts.
- Production proof conformance: 50 tests across generated proofs and adversarial records.
- Private client/server and proof-format experiments: 30 tests.
- Selected MCP server binding: 15 tests, including native cancellation and concurrent calls.
- Existing GitHub Action boundary: 11 tests; release-consistency regression suite: 4 tests.
- Total: **287 automated tests passed**, plus 18 legacy verifier outcomes, clean installed-package checks, declaration/type/lint checks, schema workflow and YAML parsing checks.

These are engineering checks, not independent reviews, certification or statistical coverage claims. The new CI configuration targets core minimum/current Node 18/24 and Python 3.10/3.14; the completed local run is Node 22/Python 3.12. Hosted jobs remain pending.

## Reproduce the checks

Prepare a Python environment with the SDK development extras and packaging tools, and install each private integration's locked Node dependencies:

```sh
python -m pip install -e 'sdk/python[dev]' setuptools wheel
npm ci --ignore-scripts --prefix integrations/mcp-experiment
npm ci --ignore-scripts --prefix integrations/mcp-server
node scripts/conformance.mjs --report /path/to/conformance-results.json
node scripts/check-package-install.mjs
node scripts/reference-baseline.mjs /path/to/reference-baseline.json
```

Set `VELLA_VERIFY_PYTHON` to the prepared Python interpreter when it differs from `python3`. `--packages` adds clean artifact installation to the conformance command. Package installation resolves declared dependencies from their registries; no publication occurs. A report path causes per-check logs to be retained beside it. Local filesystem tests require the documented POSIX environment.

## Milestones and next acceptance work

M1 correctness changes and the M2/M3 local reference implementations are ready for review against the evidence above. M0's public format and local workflow choices are recorded; workload targets and remaining delivery/release constraints still need acceptance. M4 is not complete.

Next steps are to create a reviewable immutable candidate and run hosted CI, agree deployment performance thresholds and sustained MCP load tests, reconcile the final compatibility/version/notice plan, and prepare immutable adoption pins and rollback instructions for that candidate. The private package's broad development peer range must be replaced with a tested release compatibility range before publication.

The existing main-branch hardening track remains separate. Current release/Action regression checks pass, but this branch's v2 output is a breaking development change. Existing stable tags must not move. Publication requires the owner's release authorization; the established “push” workflow covers commit, branch push, PR checks, merge and clean-main synchronization, not package publication.

## Release-preparation update

The initial implementation was merged through PR #15 and the deterministic deadline-test correction through PR #16; all checks passed on final main `5a076d833e9dfd13e981cc4d34fc6a3e131b7272`. The table above is the preserved initial local snapshot, not the final candidate acceptance record.

The owner subsequently selected SDK 2.0.0 / MCP 1.0.0 and the [sustained operating limits](local-reference.md). The next candidate adds bounded exact-action approval sets for concurrent distinct reports, time-until-dispatch/total instrumentation, a reproducible healthy/fault/recovery harness, exact MCP peer compatibility, installed producer rollback verification, and [release/rollback guidance](release-candidate.md). The separate handoff report binds final packages, hosted checks, workload results, source hashes and residual owner release decisions to the exact candidate. A16 is not closed by a smoke run or by the earlier microbenchmarks.
