# PQ production acceptance ledger — public v3 candidate

Status: Mike Wilson accepted and authorized M1 on 2026-09-08. The public v3 contract is frozen. Release acceptance is not yet complete. Development branch `codex/pqc-production`. Shared SDK/gate/MCP code now supports an explicit operator-owned proof provider; hybrid modules now have supported SDK, verifier and MCP package entry points. v1/v2 proof algorithms and semantics are preserved.

## Local evidence

- 281 cross-language SDK-provider/proof/domain/rejection assertions passed.
- 120 schema/vector assertions passed; four public vectors cover both key origins and producers.
- 26 integration tests cover local key lifecycle, native MCP routes, public-material retention, Node/Python/shell review verifiers, admission pressure, missing signatures, dependency failures, rotation/revocation and process-lock recovery.
- Existing 98 Node SDK, 80 Python SDK and 16 native MCP tests pass; TypeScript checks cover the new provider path and Python strict typing/lint checks pass.
- The Isolated Node/Python package installations pass native MCP route and archive verification checks. Both languages expose explicit opt-in v3 entry points; Node/Python/shell v3 routes are separate from existing v1/v2 verifiers. No registry publication is claimed.

Node hybrid tests ran on 24.20.0, Python proof tests on 3.12.14 / cryptography 50.0.1, on the local macOS machine. Existing Node/MCP compatibility tests also ran on Node 22.22.3. No hosted PQ matrix, sustained candidate run, 30-minute soak, resource qualification, or final production performance claim is established by these checks.

| ID | State | Evidence / remaining work |
|---|---|---|
| PQ01 | Owner accepted | Seven-year retention/verification target, annual review/key rotation, local hybrid boundary; no calendar security guarantee |
| PQ02 | Contract frozen | Owner-approved final v3 identifiers, schemas, exact bytes and bounded domain implemented; 401 conformance/schema assertions pass |
| PQ03 | Local public-format checks pass | Actual Node/Python SDK governors and isolated installed packages interoperate; hosted matrix pending |
| PQ04 | Local public-format checks pass | Both signatures mandatory in real gate; changed signatures, keys and weaker profile reject |
| PQ05 | Partial local checks pass | Bounded parsing and 8-admitted/8-rejected pressure control; full denial-of-service/resource/soak checks pending |
| PQ06 | Local implementation tested | Protected files, annual expiry, no key reuse, durable rotation/revocation, uncertain-write refusal, live-writer exclusion and explicit crash recovery; final custody/runbook review pending |
| PQ07 | Local integration tested | SHA-384 definitions/actions/approvals/policy/proofs/receipt references; key-set/revision bound in governed evidence; legacy approvals cannot authorize hybrid calls |
| PQ08 | Local integration tested | Missing either signature, unavailable signer, changed/expired evidence and authorization-storage failure stop effects |
| PQ09 | Partial integration tested | Native effects/proofs/receipts reconcile; post-effect receipt failure preserves outcome; broader candidate interruption matrix pending |
| PQ10 | Partial migration evidence | v2 rejects draft; historical retired-key verification reports trust status and no execution authority; installed mixed-archive/rollback rehearsal pending |
| PQ11 | API/type groundwork tested | Both SDK provider APIs, updated Node types and package manifest; final distribution/dependency/support qualification pending |
| PQ12 | Pending candidate qualification | Original latency limits retained; added resource plan fixed as engineering defaults before its measurement |
| PQ13 | Owner contract accepted | Mike Wilson reviewed and authorized M1; no external specialist certification claimed |
| PQ14 | In progress | Local evidence and review packet prepared; full handoff/migration/rollout remains pending |

M0 owner inputs are resolved. M1 owner format review is closed. Reversible M2/M3 implementation was advanced to make the review concrete; those milestones still require remaining candidate checks for final acceptance. No SOW-wide completion is claimed. Publication remains a separate owner decision.

## Candidate versions and remaining release gates

SDK 2.1.0 (Node/Python) and MCP 1.1.0 are unpublished candidates with an exact SDK/MCP peer pairing. MIGRATION.md defines opt-in rollout, fresh approvals, mixed archives, custody/retention and explicit classical rollback. DEPENDENCY-REVIEW.md records NIST errata applicability and native-backend limits. The six Python/platform hosted combinations, full local workloads, matched classical diagnostic and 30-minute hybrid soak remain pending. Smoke results are only harness checks, not acceptance measurements.
