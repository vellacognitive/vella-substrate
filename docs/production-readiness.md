# Production readiness

Status reviewed October 15, 2026. This is the current readiness entry point for the public repository. Historical acceptance ledgers remain immutable evidence for their named candidates; their original open items are not a current backlog.

The public SDK and local MCP reference have completed the documented engineering qualification. Acceptance of a particular production deployment remains open. The commercial remote/service components are outside this repository's qualification.

## Completed evidence

| Area | Evidence and boundary |
|---|---|
| SDK 2.1.0 / MCP 1.1.0 contract, compatibility and lifecycle | [Hybrid acceptance ledger](../spec/pqc/ACCEPTANCE.md), [qualification](../spec/pqc/QUALIFICATION.md), and [migration](../spec/pqc/MIGRATION.md). Includes eight-call admission, overload rejection, key rotation/revocation and process interruption. |
| Sustained performance and resources | [October 15 report](remediation/performance-qualification-2026-10-15.md): 239,631 measured calls across hybrid, classical and 30-minute soak; no unexpected outcomes. Applies to the identified local workstation and closed-loop workload. |
| Functional CI versus performance acceptance | [Harness interpretation](../integrations/pqc-production/operational/README.md). Smoke preserves timing diagnostics; sustained acceptance retains the unchanged numerical limits. |
| Repository change controls | Main protection was verified October 15: PRs, all 16 required checks, up-to-date branches, resolved conversations and administrator enforcement; force pushes/deletion blocked. Zero required approvals supports the current solo-maintainer workflow. These are GitHub settings and must be rechecked if administration changes. |
| Release history | [v2.1.0 release](https://github.com/vellacognitive/vella-substrate/releases/tag/v2.1.0). A GitHub release alone does not verify the bytes installed from a registry in a deployment. |

## Selected deployment target

On October 15, the owner selected **local single-host MCP** as the first production target. Use operator-controlled local stdio and local storage as the reference boundary. The intended production machine, filesystem, traffic profile, operational owner and service/recovery targets still need to be recorded; the benchmark workstation is not implicitly the production host. Remote services and embedded-only adoption are separate acceptance scopes.

The [local operations runbook](operations/local-mcp.md) defines monitoring, stop/drain, reconciliation, restore, key maintenance and rollout procedures. Deployment-specific configuration and exercised evidence remain required for PROD-03, PROD-04 and PROD-06.

## Deployment acceptance checklist

Use these stable IDs in follow-up PRs and deployment evidence. Open means evidence has not been established for the intended deployment, not that the SDK necessarily lacks a feature. Assign an accountable operator and evidence location before marking a gate complete.

| ID | Status | Required evidence before deployment acceptance |
|---|---|---|
| PROD-01 | Partial: local single-host MCP selected | Record local MCP, embedded SDK or separately scoped remote service; host/OS/runtime, transport, filesystem, identity authority, consequence boundary, workload and operator. Record latency percentiles, error budget, recovery time and acceptable evidence loss. Do not infer customer targets from local test limits. |
| PROD-02 | Open: target qualification | On the selected environment, retain immutable package/source identities and resolved dependencies; run sustained, soak, fault, overload and crash fixtures. Add representative competing load, bursts, actual payloads (including maximum supported non-ASCII content), and a duration justified by operational use. Repeat runs to characterize variability. Preserve failures and maxima. |
| PROD-03 | Open: observability and response | Demonstrate detection and routing of signing/authorization-storage failures, receipt retention failures, unknown outcomes, capacity rejection, disk pressure and key expiry. Record alert thresholds, responder, reconciliation procedure and evidence of an exercised incident. Do not automatically replay uncertain or completed effects. |
| PROD-04 | Open: retention and restore | Size actual evidence volume and retention, including unused authorizations, public-key/policy history, indexes, filesystem overhead and backup copies. Restore a backup into an isolated environment and verify retained proofs. Establish access controls and key custody, scheduled rotation and compromise response. Existing process-crash tests do not establish replicated retention or power-loss survival. |
| PROD-05 | Open: deployment security assessment | Review the actual execution boundary, bypass paths, hybrid composition, key custody and resolved dependencies against the deployment threat model. Bind findings/dispositions to immutable artifacts. Owner review is complete; external specialist certification is not claimed. Scope any specialist review according to the consequence and assurance required. |
| PROD-06 | Open: rollout rehearsal | Verify registry package identities and installation integrity; stage the exact versions/configuration, exercise denied and fault paths, rehearse rollback while retaining historical verification capability, and identify the rollout/stop decision owner. Publication is separate from deployment acceptance. |

A gate can be marked not applicable only with a recorded reason tied to the selected deployment. Remote transport, external IAM, network storage and multi-tenant enforcement require their own design and qualification; the local reference evidence does not cover them.

## Dependency maintenance

The source dependency baseline now pins MCP client 2.3.1 (with client core 2.3.1), while the server remains 2.0.0. Both local integrations use the same client pin. [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) affects HTTP OAuth credential handling in client 2.0.0; upstream explicitly excludes stdio clients and MCP servers. The shipped operator client constructs a stdio transport and exposes no HTTP OAuth path. This upgrade is dependency maintenance, not evidence of a credential leak in the local reference. Custom HTTP clients require separate assessment.

The new client/core distributions include upstream Apache-2.0 transition notices; retain their supplied license files when redistributing dependencies. Historical performance reports and published package versions retain their original dependency identities. This source update does not republish MCP 1.1.0 or qualify the new dependency set for production performance; PROD-02 and PROD-06 still require exact-artifact deployment evidence.

## Remaining engineering investigation

**PERF-01 — macOS delay attribution (open).** Phase telemetry observed delays in measured work as well as startup/warmup/recovery. High host load and low process CPU relative to elapsed time are consistent with contention or blocking, but do not prove the cause. Compare repeated runs on an idle dedicated macOS host and under controlled competing load, retaining phase/CPU/resource traces and profiling evidence. Do not tune acceptance thresholds to make failures pass. A target-environment timing failure blocks that environment's acceptance; a hosted smoke diagnostic alone is not a functional failure.

## PR completion procedure

1. Start from a clean checkout synchronized with remote main. Inventory existing changes and open PRs; preserve unrelated work.
2. Keep each PR scoped to a reviewable outcome. Record checks, evidence and remaining limits in its description; update the applicable readiness ID.
3. Inspect the final diff and run appropriate local checks. Run every required hosted check against the final PR revision; investigate failures before merge. Disclose reruns and retain timing diagnostics.
4. Merge through branch protection. Fetch and fast-forward local main, verify its commit matches remote main, and confirm `git status --porcelain` is empty before starting the next PR. Preserve evidence outside the tracked checkout; do not delete unrelated files to manufacture a clean status.

## Reading historical records

The [September classical acceptance snapshot](remediation/acceptance.md) and [SDK 2.0.0 / MCP 1.0.0 guide](remediation/release-candidate.md) describe their original candidates. Use the hybrid ledger for SDK 2.1.0 / MCP 1.1.0, the October report for the latest local performance evidence, and this checklist for deployment work. No historical report is retroactively relabeled as a new measurement.

Public claim supported by this evidence: **qualified local reference implementation with documented operating limits and reproducible test evidence**. A deployment SLA requires completion of its applicable acceptance gates.
