# PQ production acceptance ledger — SDK and local integration checkpoint

Status: owner decisions recorded; implementation contract ready for M1 review. Review and release acceptance are not yet complete. Development branch `codex/pqc-production`. Shared SDK/gate/MCP code now supports an explicit operator-owned proof provider; the hybrid format and reference remain private review modules. v1/v2 proof algorithms and semantics are preserved.

## Local evidence

- 257 cross-language SDK-provider/proof/domain/rejection assertions passed.
- 120 schema/vector assertions passed; four public vectors cover both key origins and producers.
- 26 integration tests cover local key lifecycle, native MCP routes, public-material retention, Node/Python/shell review verifiers, admission pressure, missing signatures, dependency failures, rotation/revocation and process-lock recovery.
- Existing 98 Node SDK, 80 Python SDK and 16 native MCP tests pass; TypeScript checks cover the new provider path and Python strict typing/lint checks pass.
- The Node package file-list check includes the new internal provider module. This is not a fresh installation or registry publication result.

Node hybrid tests ran on 24.20.0, Python proof tests on 3.12.14 / cryptography 50.0.1, on the local macOS machine. Existing Node/MCP compatibility tests also ran on Node 22.22.3. No hosted PQ matrix, sustained candidate run, 30-minute soak, resource qualification, or final production performance claim is established by these checks.

| ID | State | Evidence / remaining work |
|---|---|---|
| PQ01 | Owner scope selected; review pending | Seven-year retention/verification target, annual review/key rotation, local hybrid boundary; no calendar security guarantee |
| PQ02 | Executable draft | Schema, exact bytes and bounded domain implemented; owner review and final identifiers pending |
| PQ03 | Local draft checks pass | Actual Node/Python SDK governors interoperate through the provider API; final installed entry points/matrix pending |
| PQ04 | Local draft checks pass | Both signatures mandatory in real gate; changed signatures, keys and weaker profile reject |
| PQ05 | Partial local checks pass | Bounded parsing and 8-admitted/8-rejected pressure control; full denial-of-service/resource/soak checks pending |
| PQ06 | Local implementation tested | Protected files, annual expiry, no key reuse, durable rotation/revocation, uncertain-write refusal, live-writer exclusion and explicit crash recovery; final custody/runbook review pending |
| PQ07 | Local integration tested | SHA-384 definitions/actions/approvals/policy/proofs/receipt references; key-set/revision bound in governed evidence; legacy approvals cannot authorize hybrid calls |
| PQ08 | Local integration tested | Missing either signature, unavailable signer, changed/expired evidence and authorization-storage failure stop effects |
| PQ09 | Partial integration tested | Native effects/proofs/receipts reconcile; post-effect receipt failure preserves outcome; broader candidate interruption matrix pending |
| PQ10 | Partial migration evidence | v2 rejects draft; historical retired-key verification reports trust status and no execution authority; installed mixed-archive/rollback rehearsal pending |
| PQ11 | API/type groundwork tested | Both SDK provider APIs, updated Node types and package manifest; final distribution/dependency/support qualification pending |
| PQ12 | Pending candidate qualification | Original latency limits retained; added resource plan fixed as engineering defaults before its measurement |
| PQ13 | Owner review requested | Mike Wilson selected; OWNER-REVIEW.md ready. No completed owner review or specialist certification claimed |
| PQ14 | In progress | Local evidence and review packet prepared; full handoff/migration/rollout remains pending |

M0 owner inputs are resolved. M1 format review remains open. Reversible M2/M3 implementation was advanced to make the review concrete; those milestones cannot receive final acceptance before M1 and the remaining checks. No SOW-wide completion is claimed. Publication remains a separate owner decision.
