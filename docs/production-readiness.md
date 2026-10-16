# Public substrate quality and release readiness

Status reviewed October 16, 2026. VELLA is a framework-neutral, embedded authority primitive: proposed action, policy and evidence produce a deterministic authorization decision and portable proof. Node/Python SDKs and independent verifiers are the core. MCP and GitHub Actions are reference adapters. See the [interface contract](../spec/icd.md), [integration map](../INTEGRATIONS.md) and [deployment scope](../DEPLOYMENT.md).

This page tracks quality of the reusable public repository and its packages. It does not assume a Vella Cognitive production installation, require a customer host, or make one adapter the substrate's deployment architecture. Applications own enforcement, evidence truth, policy, storage and operation within the documented contracts.

## Repository quality criteria

| Area | Release expectation |
|---|---|
| Decision and proof contracts | Deterministic evaluation, fail-closed input/error behavior, exact documented signing/verification semantics and tamper rejection; preserve versioned compatibility. |
| SDKs and verifiers | Supported runtime tests, cross-language conformance, package/API/type compatibility and independent verification from installed artifacts. |
| Reference adapters | Explicit consequence boundary, tested deny/fault paths and honest supported-platform limits. Adapters do not become core architectural dependencies. |
| Reliability and performance | Reproducible fixtures; distinguish evaluator, signing, gate/storage and transport costs. Retain failures and timing diagnostics. Reference measurements are not universal latency guarantees. |
| Security | Evidence-backed review of the relevant source and dependency boundaries, explicit trust assumptions and responsible disclosure. A scoped adapter scan does not certify the whole substrate. |
| Distribution and maintenance | Immutable releases, provenance/integrity checks, dependency maintenance, accurate release notes and protected PR checks. |
| Documentation | Separate shipped capabilities, optional profiles, reference measurements, adopter obligations and commercial components. |

A generic library can meet its release criteria without knowing each adopter's workload or infrastructure. Supporting that use requires explicit compatibility and limits, not a universal deployment SLA.

## Completed evidence

| Area | Evidence and boundary |
|---|---|
| SDK 2.1.0 / MCP 1.1.0 contract, compatibility and lifecycle | [Hybrid acceptance ledger](../spec/pqc/ACCEPTANCE.md), [qualification](../spec/pqc/QUALIFICATION.md), and [migration](../spec/pqc/MIGRATION.md). Includes eight-call admission, overload rejection, key rotation/revocation and process interruption. |
| Sustained performance and resources | [October 15 report](remediation/performance-qualification-2026-10-15.md): 239,631 measured calls across hybrid, classical and 30-minute soak; no unexpected outcomes. Applies to the identified local workstation and closed-loop workload. |
| Functional CI versus performance acceptance | [Harness interpretation](../integrations/pqc-production/operational/README.md). Smoke preserves timing diagnostics; sustained acceptance retains the unchanged numerical limits. |
| Repository change controls | Main protection was verified October 15: PRs, all 16 required checks, up-to-date branches, resolved conversations and administrator enforcement; force pushes/deletion blocked. Zero required approvals supports the current solo-maintainer workflow. These are GitHub settings and must be rechecked if administration changes. |
| Release history | [v2.1.0 release](https://github.com/vellacognitive/vella-substrate/releases/tag/v2.1.0). A GitHub release alone does not verify the bytes installed from a registry in a deployment. |

## Reference profiles and adopter guidance

The local single-host MCP selection made during the October review is treated as a **reference qualification profile**, not a commitment to operate a particular production installation. It does not narrow embedded Node/Python use or other supported integration surfaces.

The [local MCP operations runbook](operations/local-mcp.md) and [optional acceptance template](operations/local-mcp-acceptance.md) are guidance for adopters choosing that adapter. Their PROD-01–06 identifiers cover an adopter's host, workload, operations, recovery, security and rollout decisions. They are not unresolved product requirements or prerequisites to SDK publication. No host, operator, alert service or backup system is assumed to have been commissioned.

## Dependency maintenance

The source dependency baseline now pins MCP client 2.3.1 (with client core 2.3.1), while the server remains 2.0.0. Both local integrations use the same client pin. [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) affects HTTP OAuth credential handling in client 2.0.0; upstream explicitly excludes stdio clients and MCP servers. The shipped operator client constructs a stdio transport and exposes no HTTP OAuth path. This upgrade is dependency maintenance, not evidence of a credential leak in the local reference. Custom HTTP clients require separate assessment.

The new client/core distributions include upstream Apache-2.0 transition notices; retain their supplied license files when redistributing dependencies. Historical performance reports and published package versions retain their original dependency identities. This source update does not republish MCP 1.1.0 or qualify the new dependency set for production performance; adopters must qualify the exact artifacts they use.

## Restore and registry evidence

The [installed restore rehearsal](../integrations/pqc-production/operational/README.md#verifier-only-restore-rehearsal) verifies a synthetic archive after removal of its producer and private keys, across active/retired signing keys and maximum-length Unicode reports. CI runs it in all six hybrid jobs. Local source-built SDK 2.1.0/MCP 1.1.0 and separately downloaded registry versions both passed on Node 24.20.0 on October 15. Three reports, three authorizations, three receipts and three verification-material files restored successfully; six negative cases rejected. This validates a reference fixture; adopters remain responsible for their own backups and recovery requirements.

The October 15 registry installation's `npm audit signatures` returned no invalid or missing signatures. That MCP 1.1.0 package pins client 2.0.0; the current source build pins 2.3.1. Registry identity/signature verification is not a vulnerability scan or a deployment approval. The dependency maintenance was subsequently delivered in MCP 1.1.1 (below); no existing registry version was overwritten or republished. Any adopter rollout remains separate from package release.

## MCP 1.1.1 publication

MCP 1.1.1 was published and independently downloaded from npm on October 16, 2026. It retains the exact SDK 2.1.0 peer and packages client 2.3.1. The [release record](operations/mcp-release.md#publication-record--october-16-2026) links the successful workflow, immutable source and registry identity. A fresh registry installation passed the governed-tool demo and synthetic restore rehearsal on Node 24.20.0; `npm audit signatures` verified all 17 installed packages' registry signatures and 10 attestations. These checks establish package delivery and reference behavior, not a universal performance guarantee. No named customer host is required to qualify the reusable package.

The October 15 static security scan at `31bfba777cba266bacbe23ab53f0a2d41e1a9fb5` reviewed all 23 tracked files under `integrations/mcp-server`, with supporting gate/storage/key code traced as needed. Independent baseline and focused exact-action/filesystem reviews identified no reportable vulnerability. This is scoped source evidence, not a full SDK, dependency or deployed-host assessment. Operator custody, protected directory ancestors and local stdio are assumptions; adopters must assess their own execution boundary.

## Remaining repository work

- **PERF-01 — macOS delay attribution:** investigate repeatable idle-versus-controlled-load behavior and preserve phase/CPU/resource traces. This is harness/performance characterization, not a request for a customer deployment. Do not relax acceptance thresholds to make failures pass.
- **Maintain the quality criteria above:** expand review or tests where concrete gaps are found. Existing evidence is scoped; it is not an exhaustive whole-repository security certification or a guarantee across arbitrary environments.

## PR completion procedure

1. Start from a clean checkout synchronized with remote main; preserve unrelated work.
2. Scope each PR to a reviewable outcome and identify affected SDK, verifier, adapter or documentation contracts.
3. Inspect the final diff and run appropriate local checks plus every required hosted check against the final revision. Investigate failures; disclose reruns and retain diagnostics.
4. Merge through protection, fast-forward local main, confirm its commit matches remote main, and verify an empty working-tree status. Keep evidence outside the tracked checkout.

## Reading historical records

Historical ledgers describe their named artifacts and workloads. Preserve their results without relabeling them as new measurements. The [classical acceptance snapshot](remediation/acceptance.md), [hybrid ledger](../spec/pqc/ACCEPTANCE.md) and [October performance report](remediation/performance-qualification-2026-10-15.md) remain evidence for those scopes.

The public claim is a reusable embedded authority substrate with versioned contracts, tested reference integrations and reproducible evidence. Each adopter owns acceptance of its surrounding application and operational environment.
