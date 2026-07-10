# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Export and document `create_evaluator` as the public Python API for application-supplied policy evaluation.

### Changed
- Custom evaluator failures now return `DENIED` with `E_EVALUATOR_INTERNAL` at the public authority boundary.

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
