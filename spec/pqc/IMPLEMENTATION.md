# PQ production implementation record

Status: M1 contract and final qualified candidate accepted; publication authorized. Owner authorized work against the desktop SOW on 2026-09-08. The SOW's local hybrid, opt-in, legacy-preserving design is the implementation direction. Owner accepted a seven-year retention/verification target, annual security review, annual active-key rotation and immediate rotation after suspected compromise. Mike Wilson is the reviewer and acceptance owner; he reviewed and authorized the M1 contract on 2026-09-08. No calendar security guarantee or specialist certification is inferred.

## Baseline

Released runtime: `d5716f2cd624ae04c1ee0ed0350e00bac01f1d66`. Feasibility code: `0f431d421f3875582cb3c2ffe73b6fca43fe35da`. Starting branch head: `42e6dcb` (results documentation only after feasibility code). At kickoff, all changes from released baseline were under `integrations/pqc-experiment/`. Development branch: `codex/pqc-production`.

The initial review implementation lived under `integrations/pqc-production/`. The public implementation now resides in the SDK packages and the packaged local MCP reference; the private directory retains conformance/qualification tools. No experimental envelope is accepted by the SDK's v1/v2 entry points. This permits executable review vectors without prematurely freezing public bytes or changing installation support.

## Decisions carried forward

- Controlled Node MCP server-handler boundary, stdio, two existing report routes, native crypto, operator-owned local keys/evidence, file-and-directory-fsync retention.
- Hybrid requires P-256 and ML-DSA-65, both over one typed message. Explicit required profile and trusted keys; no envelope-provided trust and no weaker fallback.
- New identifiers use SHA-384. Existing v1/v2 bytes and their SHA-256 semantics stay fixed.
- New profile opt-in. Runtime qualification target Node 24.20.0 (minimum and current 24.x are currently the same patch), Python 3.12/3.13/3.14 with cryptography 50.0.1; Linux x64/macOS arm64. Completed hosted and local combinations are recorded in the acceptance ledger.
- Candidate SDK 2.1.0 and MCP 1.1.0 are additive opt-in versions; publication was separately authorized on 2026-09-08.

## Owner decisions and completed contract review

The owner accepted the seven-year recommendation and selected himself as reviewer. Retention begins with each proof's creation; no automatic deletion is implemented. Public-key history is kept until at least seven years after the key's final permitted signing date, so a one-year signing key created in September 2026 has verification material retained through September 2034. This is a design/operations target, not a promise that its signatures remain secure for a fixed number of years. Historical verification and current execution trust remain separate.

Annual algorithm/dependency review and annual signing-key rotation are operating requirements; suspected compromise requires immediate revocation/rotation and investigation. A retained signed timestamp does not prove that a proof predates compromise. Trusted timestamp/archive renewal services remain separately scoped.

Mike Wilson completed owner review and authorized the implementation contract. No external firm is required by this selection and no independent specialist certification is claimed. The public v3 signed-byte contract is frozen; qualification and release handoff continue on the development branch.

Mike Wilson accepted and authorized M1 on 2026-09-08. The final v3 identifiers are frozen in PROOF-CONTRACT.md. Candidate versions are SDK 2.1.0 (Node/Python) and MCP 1.1.0, additive opt-in releases whose qualification passed and publication was authorized on 2026-09-08. Existing v1/v2 format semantics remain fixed; shared SDK implementation now has an explicit profile boundary and is regression-tested.

## Delivery planning estimate

Planning allowance, not measured productivity or a commercial quote: M0/M1 contract/review preparation 3–5 engineer-days; M2 SDK/key/verifier implementation 6–10; M3 gate/MCP migration 3–5; M4 resource/platform/package qualification 4–7; M5 documentation/handoff 2–3. Total 18–30 engineer-days before review-driven changes. Independent review fees and queue time are excluded. Re-estimate after M1; do not convert benchmark runtimes into a delivery promise.

Current work includes actual SDK provider APIs in both languages, a protected local key store, persisted rotation/revocation, explicit historical verifier routes, and native hybrid MCP integration. Public contract freeze is complete; completed runtime/package qualification and release acceptance are recorded in ACCEPTANCE.md.

## Resource plan (selected engineering test defaults)

The copied `local-acceptance-plan.json` preserves every earlier owner-selected duration and limit. Additional engineering acceptance limits selected before candidate measurement: 30-minute healthy soak at concurrency 8 / 4096-byte ASCII reports; same p95 ≤250 ms and p99 ≤500 ms; zero unexpected failures/effects on prerequisite failure. Bound each server to 8 admitted calls, no waiting queue, 30-second deadline; at 16 simultaneous attempts, excess requests must return an explicit busy outcome without effects or retries. Do not infer an open-loop rate SLA.

Monitor Node server RSS ≤512 MiB, p99 event-loop delay ≤50 ms and late-soak median RSS no more than 64 MiB above the settled first five-minute median. Measure rather than infer leaks from a single sample. Cap temporary run artifacts at 8 GiB; check at least 10 GiB free before starting; exceeding the cap stops the run and fails resource qualification. Keep key generation and operator preparation timing separately identified. Capture maxima and per-stage distributions. These are engineering test defaults within the authorized SOW; they are not prior measured passes or separately quoted owner numerical choices. The full candidate soak/resource runs passed; QUALIFICATION.md records the measured results.

## Source checks

Verified 2026-09-08: [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) is final and lists potential errata; DEPENDENCY-REVIEW.md records applicability to the chosen native APIs. [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) currently documents 24.20.0. [Python cryptography ML-DSA](https://cryptography.io/en/stable/hazmat/primitives/asymmetric/mldsa/) documents 50.0.1. [Composite ML-DSA draft 19](https://datatracker.ietf.org/doc/draft-ietf-lamps-pq-composite-sigs/) targets X.509 PKI and is not a final standard or this envelope's encoding.
