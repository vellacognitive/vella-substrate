# PQ production acceptance ledger — kickoff

Status: first contract implementation prepared; no production acceptance. Development branch `codex/pqc-production`. All new code is in the private review directory; released SDK/MCP source remains unchanged. The ledger distinguishes executable draft results from final release requirements.

Kickoff verification: 243 draft interoperability/domain/rejection assertions and 120 schema/vector assertions passed. Node 24.20.0, Python 3.12.14 / cryptography 50.0.1 on the local machine only. Four public vectors cover both key origins and both producers. The unchanged legacy SDK suites passed 98 Node tests and 80 Python tests. Node 22.22.3 explicitly rejected draft PQ key generation. These counts are not final acceptance of PQ03–PQ12.

| ID | State | Current evidence / remaining work |
|---|---|---|
| PQ01 | Drafted; owner/reviewer input pending | Threat/claim/hash map complete for review; evidence lifetime and final strength claim remain open |
| PQ02 | Review draft implemented | Separate kind, typed-message contract, bounded record domain and schemas; no public format freeze |
| PQ03 | Draft checks pass | Node/Python keys, producers, verifiers and public vectors; public CLI and platform matrix still required |
| PQ04 | Draft proof checks pass | Missing/altered signatures, wrong keys and weaker required profile reject; new production gate not integrated |
| PQ05 | Draft domain checks pass | Byte/string/array/field/node/depth and unsafe object controls; admission/overload and integrated resource tests pending |
| PQ06 | Design drafted | Seed portability checked; protected local storage, persistent trust state, rotation/revocation/recovery implementation pending |
| PQ07 | Inventory drafted | New SHA-384 record digests implemented; approval/definition/gate/receipt migration pending |
| PQ08 | Pending | Existing feasibility results are not final production integration acceptance |
| PQ09 | Pending | Production effect/proof/receipt and interruption reconciliation required |
| PQ10 | Partial draft check | v2 rejects draft format; installed mixed-archive migration and rollback pending |
| PQ11 | Pending | Node 22 explicitly rejects draft PQ generation; supported matrix, public types and clean package installs pending |
| PQ12 | Plan copied; additions proposed | Prior owner-selected limits unchanged; resource/soak proposal awaits M0 freeze and candidate measurements |
| PQ13 | Reviewer unassigned | Review brief prepared; same-author analysis cannot close this requirement |
| PQ14 | In progress | SOW snapshot, contract and evidence packet prepared; final claims, migration and release handoff pending |

## Milestone state

- M0: engineering baseline and drafts ready; evidence lifetime/reviewer inputs remain open. Resource limits are proposed, not historical owner-approved numbers.
- M1: executable contract and review material ready; external review and public contract freeze pending.
- M2–M5: not complete. Do not roll feasibility measurements forward as release-candidate evidence.

Owner authorization to begin the SOW permits reversible development of this review implementation. It does not waive the SOW's independent-review requirement or authorize new package publication. No external messages have been sent.
