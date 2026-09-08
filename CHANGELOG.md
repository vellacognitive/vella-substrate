# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-09-08

- Add opt-in v3 authorization proofs requiring both P-256 and ML-DSA-65, with exact signed payload bytes, a signed format/key descriptor, bounded parsing and SHA-384 action/policy bindings.
- Add explicit Node/Python proof providers, packaged v3 archive verifiers, and a protected local Node key store with durable rotation/revocation, annual active-key expiry and retained public history.
- Prepare MCP 1.1.0 with a hybrid local stdio reference and operator-side setup/approvals. The exact SDK peer is 2.1.0. Existing v2 defaults and legacy verification meanings remain unchanged.
- Recheck evidence expiry and captured key revision synchronously before dispatch. Preserve observed effects when post-execution receipt storage fails.
- Add migration/rollback guidance and candidate qualification tooling. Owner accepted the qualified candidate and authorized publication on 2026-09-08; see `spec/pqc/ACCEPTANCE.md` for evidence and release status.

## [2.0.0] - 2026-09-08

### Breaking changes

- High-level SDK signing now emits v2 typed exact-byte proofs. Nested action/evidence and loaded policy identity are authenticated; Node and Python expose isolated policy-bound governors and structured v2 verification.
- Repository verifiers dispatch v2 separately, reject unsupported formats and report legacy v1 protection limits. Historical v1 hash rules remain unchanged. V2 shell verification uses Python structural checks and OpenSSL signatures.
- This requires a versioned release and migration; published 1.0.3 packages and existing tags are unchanged. See `docs/remediation/migration.md`.


### Added

- Add a mandatory-proof Node execution gate, operator evidence reference, acknowledged local file sink, unsigned correlated receipts and process-interruption tests.
- Add an unreleased separately packaged MCP server binding with real stdio tests, effective-action approvals, cancellation and concurrency checks, and a runnable report-export example.
- Add Node declarations, Python typing metadata, clean package-install checks and a single conformance entry point.

- Add shared Node/Python evidence and custom-policy regression vectors.
- Add a private MCP client/server boundary experiment and experimental cross-language proof-format comparison; these are not a production adapter or a public proof format.

### Changed

- Update GitHub-owned workflow actions to their current Node 24-backed major versions after live example verification exposed the Node 20 runtime deprecation.
- Pin privileged publishing actions to reviewed commit SHAs and add automated GitHub Actions dependency update proposals.
- Enable repository release immutability for releases published after `v1.0.3`.

### Fixed

- Reject malformed evidence values instead of truncating or wrapping them into an allowed mask; report `E_EVIDENCE_INVALID`.
- Compare Node bit 31 as unsigned and reject invalid policy masks, evidence definitions, default scopes, and normalized-name collisions before activation.
- Align the normalized request mask limit and signing-failure null response with the interface documentation; distinguish optional signing failure from policy denial.

- Bind every registry publish job to the single commit selected by a validated stable release tag, and bind release-triggered runs to the commit captured by the release event.
- Keep release inputs out of generated shell source and reject noncanonical tag syntax before checkout.
- Reject symbolic-link, hard-link, line-break, and workspace-escape proof paths before emitting action decision outputs.
- Preserve signed denied proofs in the production workflow example and correct release-immutability guidance.
- Assert the adapter's ALLOWED decision explicitly in hosted SDK CI.
- Preserve safe signed-proof writes on Windows while retaining no-follow enforcement where the platform supports it.

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
