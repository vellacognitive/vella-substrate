# Public Roadmap

**Last updated:** 2026-09-01

This roadmap tracks the public reference implementation and its adoption surface. It is directional, not a release-date commitment. Items are marked shipped only when public code, documentation, and a verification path exist.

## Shipped

- Node.js and Python embedded SDKs for deterministic, in-process adjudication.
- Signed proof-bundle generation and standalone Node.js, Python, and shell verification.
- Public interface contract, schemas, reason codes, threat model, test vectors, and benchmark harness.
- npm and PyPI distribution with trusted publishing; npm provenance attestations.
- GitHub Actions reference adapter for protected changes and deployments.
- Runnable protected-deployment example with allowed and denied paths, signed-proof retention, and independent verification.
- Public integration map, use-case registry, and positioning/provenance posture.

## Next

- Runnable consequence-boundary examples for dangerous tool calls, data export, privilege escalation, and external publication.
- A framework-neutral tool-dispatch wrapper with proof persistence and deny-path conformance tests.
- Dedicated adapter candidates for MCP client dispatch, Claude Code / Claude Agent SDK hooks, LangGraph, and OpenAI Agents.
- Easier verifier packaging for CI and downstream audit pipelines.
- A public downstream-use registry for projects that choose to disclose their VELLA integration.
- Node.js custom-policy API parity with the stable Python `create_evaluator` surface.

## Later or exploratory

- Community-driven adapters for additional agent frameworks and CI/CD systems.
- WASM or additional language bindings where an embedded library is preferable to a sidecar.
- Additional cross-language proof-vector and canonicalization coverage.
- Reproducible integration benchmarks at common agent and deployment boundaries.

## Repository non-goals

- Owning an agent runtime, planner, model loop, or tool ecosystem.
- Replacing the enforcement point in the calling application.
- Treating post-hoc logging as pre-execution authorization.
- Publishing the commercial runtime service, sidecar, Helm charts, or management plane in this repository.
- Claiming a framework integration is shipped before adapter code and a tested deny path are public.

## How to participate

- Propose an adapter using the acceptance bar in [INTEGRATIONS.md](INTEGRATIONS.md).
- Add a concrete consequence boundary to [USE_CASES.md](USE_CASES.md).
- Submit issues for SDK, schema, verifier, or documentation gaps.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md) for tests and pull-request expectations.

Security issues must follow [SECURITY.md](SECURITY.md), not a public issue.
