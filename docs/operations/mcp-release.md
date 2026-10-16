# MCP patch release record and procedure

MCP 1.1.1 was published and verified on October 16, 2026, paired with SDK 2.1.0. It delivers the client 2.3.1 dependency maintenance already on main. SDK 2.1.0 is not republished. Published MCP 1.1.0 retains its original bytes and dependencies.

## Publication record — October 16, 2026

- Source: immutable [`mcp-v1.1.1`](https://github.com/vellacognitive/vella-substrate/tree/mcp-v1.1.1), commit `6c5d0c212e689880b5d687b8b0b5e601844f0298` (October 15 release metadata).
- Publication: [workflow run 38807955979, attempt 2](https://github.com/vellacognitive/vella-substrate/actions/runs/38807955979/attempts/2) succeeded after configuring the MCP package's trusted publisher. The first attempt failed at npm authorization; it did not publish the package.
- Registry: [`@vellacognitive/vella-mcp-server@1.1.1`](https://www.npmjs.com/package/@vellacognitive/vella-mcp-server/v/1.1.1), `latest=1.1.1` when checked. Tarball SHA-1: `b227080a59210395caf3588d1ebf4936fe225c6b`, matching the publishing log. [Registry provenance attestation](https://registry.npmjs.org/-/npm/v1/attestations/@vellacognitive%2fvella-mcp-server@1.1.1).
- Installed dependencies: SDK peer `2.1.0`, MCP client `2.3.1`, MCP server `2.0.0`, Zod `4.5.4`.
- Fresh registry installation on Node 24.20.0: governed-tool demo passed (denied before approval, one report after approval); synthetic restore passed for 12 files across two key sets, with six negative cases rejected and no private keys restored. `npm audit signatures` verified 17 registry signatures and 10 attestations.

No separate GitHub Release was created for this adapter patch. MCP publication uses explicit workflow dispatch; the tag alone is not evidence of registry delivery. The successful run, registry artifact and installed checks above are the delivery evidence. SDK 2.1.0 was not republished. PERF-01 remains open; these checks do not close macOS timing attribution or qualify arbitrary hardware.

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
