# PQ production implementation record

Status: M0/M1 working contract, not a released format. Owner authorized work against the desktop SOW on 2026-09-08. The SOW's local hybrid, opt-in, legacy-preserving design is the implementation direction. Evidence lifetime and independent reviewer remain owner inputs; no calendar security guarantee or external review is inferred.

## Baseline

Released runtime: `d5716f2cd624ae04c1ee0ed0350e00bac01f1d66`. Feasibility code: `0f431d421f3875582cb3c2ffe73b6fca43fe35da`. Starting branch head: `42e6dcb` (results documentation only after feasibility code). At kickoff, all changes from released baseline were under `integrations/pqc-experiment/`. Development branch: `codex/pqc-production`.

The new review implementation lives under the private `integrations/pqc-production/` boundary until M1. No experimental envelope is accepted by the SDK's v1/v2 entry points. This permits executable review vectors without prematurely freezing public bytes or changing installation support.

## Decisions carried forward

- Controlled Node MCP server-handler boundary, stdio, two existing report routes, native crypto, operator-owned local keys/evidence, file-and-directory-fsync retention.
- Hybrid requires P-256 and ML-DSA-65, both over one typed message. Explicit required profile and trusted keys; no envelope-provided trust and no weaker fallback.
- New identifiers use SHA-384. Existing v1/v2 bytes and their SHA-256 semantics stay fixed.
- New profile opt-in. Runtime qualification target Node 24.20.0 (minimum and current 24.x are currently the same patch), Python 3.12/3.13/3.14 with cryptography 50.0.1; Linux x64/macOS arm64. Only the local versions measured so far are qualified experimentally.
- No new versions/tags/publication are authorized by choosing the implementation direction.

## Contract decisions still open

1. Intended evidence lifetime and preservation need. A local signature check establishes neither trusted creation time nor guaranteed future security. Until selected, the proposed claim is current verification of new authorization proofs under configured trust, with no years-of-preservation guarantee.
2. Independent reviewer and review arrangements. Self-tests and same-author analysis cannot close PQ13. Review the executable contract before public format freeze, and the integrated implementation before release acceptance.
3. Final proof identifier, provider API, supported ranges and release numbers after contract review. Draft identifiers must be replaced deliberately, with fresh vectors and measurements.

## Delivery planning estimate

Planning allowance, not measured productivity or a commercial quote: M0/M1 contract/review preparation 3–5 engineer-days; M2 SDK/key/verifier implementation 6–10; M3 gate/MCP migration 3–5; M4 resource/platform/package qualification 4–7; M5 documentation/handoff 2–3. Total 18–30 engineer-days before review-driven changes. Independent review fees and queue time are excluded. Re-estimate after M1; do not convert benchmark runtimes into a delivery promise.

Useful work while owner/reviewer inputs are pending: baseline reconciliation, dependency/hash inventory, normative contract draft, resource plan, portable-key and cross-language fixtures. Public contract freeze, production assurance claims and final release acceptance remain open.

## Resource plan (engineering proposal, freeze at M0)

The copied `local-acceptance-plan.json` preserves every earlier owner-selected duration and limit. Additional proposed limits: 30-minute healthy soak at concurrency 8 / 4096-byte ASCII reports; same p95 ≤250 ms and p99 ≤500 ms; zero unexpected failures/effects on prerequisite failure. Bound each server to 8 admitted calls, no waiting queue, 30-second deadline; at 16 simultaneous attempts, excess requests must return an explicit busy outcome without effects or retries. Do not infer an open-loop rate SLA.

Monitor Node server RSS ≤512 MiB, p99 event-loop delay ≤50 ms and late-soak median RSS no more than 64 MiB above the settled first five-minute median. Measure rather than infer leaks from a single sample. Cap temporary run artifacts at 8 GiB; check at least 10 GiB free before starting; exceeding the cap stops the run and fails resource qualification. Keep key generation and operator preparation timing separately identified. Capture maxima and per-stage distributions. These thresholds are proposed engineering choices, not already-passed tests.

## Source checks

Verified 2026-09-08: [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) is final and lists potential errata; review applicability before contract freeze. [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) currently documents 24.20.0. [Python cryptography ML-DSA](https://cryptography.io/en/stable/hazmat/primitives/asymmetric/mldsa/) documents 50.0.1. [Composite ML-DSA draft 19](https://datatracker.ietf.org/doc/draft-ietf-lamps-pq-composite-sigs/) targets X.509 PKI and is not a final standard or this envelope's encoding.
