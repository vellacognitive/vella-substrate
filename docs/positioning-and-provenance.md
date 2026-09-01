# Positioning and Public Provenance

**Snapshot date:** 2026-08-31

**Status:** Public positioning note; not a legal opinion

The execution-authorization category is converging quickly. Multiple independent projects now use deterministic, pre-execution, fail-closed, policy, authority, receipt, and proof language. VELLA does not claim to have originated that broad category.

## The narrow claim

VELLA's defensible distinction is the combination:

> **A minimal, embedded, evidence-conditioned authority primitive that produces deterministic authorization decisions and portable, independently verifiable cryptographic proof without owning the agent runtime or enforcement infrastructure.**

The core shape is intentionally small:

```text
proposed action + policy + evidence
                  ↓
deterministic authority decision + portable proof
```

That smallness is architectural. A caller can put VELLA beneath an agent framework, inside an application, or at a deployment gate without moving planning, execution, or audit ownership into VELLA.

## Public landscape snapshot

The classification below records public chronology and visible overlap as reviewed on the snapshot date. Dates are public GitHub repository creation dates; they do not establish private development chronology or legal priority.

| Project | Public repo created | Public relationship to VELLA | Responsible interpretation |
|---|---:|---|---|
| [Faramesh](https://github.com/faramesh/faramesh-core) | 2026-01-14 | Predates VELLA's public repo | Prior public work and independent convergence in deterministic pre-tool-call policy, fail-closed behavior, and audit evidence |
| [OxDeAI](https://github.com/oxdeai/oxdeai) | 2026-02-26 | Predates VELLA's public repo | Prior public work and independent convergence in proposal → authorization → execution and a non-bypassable execution boundary |
| [EMILIA Protocol](https://github.com/emiliaprotocol/emilia-protocol) | 2026-03-13 | Predates VELLA's public repo | Prior public work and independent convergence in exact-action authority, protected execution, and portable receipts |
| **VELLA** | **2026-04-21** | Baseline | Public reference implementation and research record |
| [AGA](https://github.com/attestedintelligence/aga-mcp-server) | 2026-06-08 | Postdates VELLA's public repo | Strong later convergence around policy-before-tool-call, signed evidence, offline verification, and fail-closed behavior; no current VELLA-specific implementation fingerprint identified |
| [EVE AI Core / CoreGuard](https://github.com/jamaurice/eveaicore) | 2026-07-15 | Postdates VELLA's public repo | Strong later messaging convergence around deterministic pre-execution governance and signed evidence; current public evidence is insufficient for a copying claim |

The VELLA public reference release and companion research record are available through [GitHub Releases](https://github.com/vellacognitive/vella-substrate/releases) and the [archived DOI record](https://doi.org/10.5281/zenodo.19738376).

## Claims VELLA avoids

VELLA does not base its differentiation on having invented:

- pre-execution AI governance;
- deterministic allow/deny decisions;
- fail-closed enforcement;
- policy checks before tool use;
- signed logs or authorization receipts; or
- the general idea of an authority boundary for agents.

Those are category primitives. Similarity in those primitives, standing alone, is not evidence of copying.

## Evidence threshold for a stronger provenance claim

A stronger claim would require public, attributable evidence such as copied source, VELLA-specific schema fields, reason codes, proof-envelope identifiers, test-vector fingerprints, or uniquely matching implementation defects. No such evidence was identified in the snapshot summarized here.

This note should be updated when public implementations, chronology, or evidence materially changes. Corrections supported by public sources are welcome through a GitHub issue or pull request.
