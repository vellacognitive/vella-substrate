# MCP patch release preparation

MCP 1.1.1 release metadata is finalized and paired with SDK 2.1.0. Registry publication and verification are separate release steps. It delivers the client 2.3.1 dependency maintenance already on main. SDK 2.1.0 is not republished. Published MCP 1.1.0 retains its original bytes and dependencies.

## Candidate verification

Run the release consistency tests, adapter tests/typecheck/demo, and all protected PR checks. The hybrid matrix builds tarballs using their actual `npm pack` filenames, installs outside the checkout, and records installed package versions. It exercises cross-language verification, restore, crash, pressure and functional smoke on Linux/macOS. Smoke timing is diagnostic; candidate production performance still requires sustained target-environment qualification.

Inspect the packed file inventory and retain package hashes, dependency lock and qualification reports. Scope the source security review to its named revision; do not relabel historical measurements as candidate results.

## Publication procedure

Publication requires a separate owner decision after candidate review. No tag or publication is created by the preparation PR.

1. Finalize the MCP changelog date and remove the README's unpublished-candidate notice in a small PR. Preserve its exact SDK peer and dependency pins. Run every required check and merge through protection; record the final main SHA.
2. Create a new immutable `mcp-v1.1.1` tag at that approved SHA. Never move the SDK's existing `v2.1.0` tag or overwrite either published package.
3. Dispatch `publish.yml` from the reviewed main workflow with `tag=mcp-v1.1.1` and `registry=mcp`. The workflow binds the checkout to the tag commit, verifies matching adapter package/lock versions and dated adapter notes, runs adapter tests/typecheck/demo, and uses the MCP package's configured trusted publisher with provenance. Verify that publisher/environment configuration before dispatch.
4. MCP tags reject SDK registry targets and release-event publication. SDK jobs also require the SDK component. A GitHub release for an MCP tag does not publish packages; the manual dispatch is the publication action.
5. Download the exact registry pair into a fresh directory, inspect integrity/provenance and resolved dependencies, and repeat installed qualification. Retain the registry identities and results. If publication succeeds but verification fails, stop rollout; do not republish that version.
6. Follow the [local runbook](local-mcp.md) for deployment acceptance and rollback. Historical verification keys and policy material survive rollback. Registry publication does not accept a production deployment or establish an SLA.

The consistency checker refuses MCP publication while its version is marked `Unreleased`. It rejects mismatched versions, noncanonical tags, a tag not identifying HEAD and a supplied release event commit differing from HEAD. The workflow requires an explicit MCP tag/target combination; CI tests execute its routing shell against valid and invalid combinations without publishing.
