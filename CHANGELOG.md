# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Update GitHub-owned workflow actions to their current Node 24-backed major versions after live example verification exposed the Node 20 runtime deprecation.

## [1.0.3] - 2026-09-01

### Added

- Add the fail-closed GitHub Actions authority-gate reference adapter with optional signed-proof output.
- Add CI coverage for allowed, denied, signed-proof, invalid-key, and invalid proof-path adapter behavior.
- Add a runnable protected-deployment workflow that verifies the signed decision before a simulated consequence.
- Add public integration, use-case, roadmap, and positioning/provenance documentation.

### Changed

- Improve the README front door with the VELLA authority-boundary hero, contextual execution visualization, and an immediately visible install path.
- Expand release validation so the tag, Node package, lockfile, Python package, exported Python version, citation metadata, and changelog must agree.

### Fixed

- Correct stale `1.0.2` changelog and citation release metadata.
- Withhold action decision outputs when requested proof creation fails validation.
- Modernize Python package license metadata for warning-free release builds.
- Align Python source with the repository's current lint rules without changing SDK behavior.

### Note

- The default policy, decision semantics, SDK interfaces, proof-bundle schema, and verifier compatibility are unchanged from `1.0.2`.

## [1.0.2] - 2026-07-10

- Export and document `create_evaluator` as the public Python API for application-supplied policy evaluation.
- Document custom policy evaluator usage.
- Preserve existing `govern(...)` behavior and proof/signing behavior.

## [1.0.1] - 2026-05-07

### Added
- Published to npm as `@vellacognitive/vella-sdk` (with provenance) and to PyPI as `vella-sdk`. Trusted Publisher OIDC release pipeline replaces ad-hoc credentials.
- DOI badge and CI status badges in README.
- `benchmarks/` reproducible latency harness for both SDKs, with reference results on Apple M2 Pro.
- `AI_INTEGRATION_PROMPTING.md` — prompting patterns for AI-assisted integration.

### Changed
- Install instructions in README are now package-first (`npm install` / `pip install`); from-source steps remain available under "Local development" for contributors.
- `homepage` on both packages now points at the companion essay.
- README cites the Zenodo archive directly; CITATION.cff carries machine-readable DOI metadata.

### Note
- No SDK behavior changed between 1.0.0 and 1.0.1. Decision semantics, proof bundle format, evaluator output, and verifier compatibility are byte-identical.

## [1.0.0] - 2026-04-21

### Added
- Initial public release. Embedded Node and Python SDKs, reference verifiers, specification, policy taxonomy, test vectors.
