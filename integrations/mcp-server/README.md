# Vella governed MCP server — unreleased local reference

This separate package wraps registered MCP tool handlers with the Node SDK's mandatory-proof execution gate. It implements the owner-selected local report-export reference workflow. The package is private and unreleased; its development peer range is not a claim that published 1.0.3 supports these APIs. Release versions and compatibility pins must be set together before publication.

## Run from this repository

```sh
cd integrations/mcp-server
npm ci --ignore-scripts
npm test
npm run typecheck
npm run demo
```

The demo starts a real stdio MCP server. A request without operator evidence creates no report. The harness then writes an exact-action approval, and the server creates one report and retains its authorization and receipt. The harness generates a temporary keypair and cleans up its files. It acts as the operator; the MCP server cannot mint its own approval through a tool call.

The reusable exports are `describeGovernedTool` and `registerGovernedTool`. The [example server](example/report-server.mjs) shows complete registration. Core execution, evidence and storage APIs come from `@vellacognitive/vella-sdk`; MCP dependencies stay in this package.

## Supported reference boundary

- Controlled server handlers registered through this binding; exact case-sensitive server/tool identities map to explicit intent and scope.
- Official MCP server/client family 2.0.0, protocol revision 2026-07-28, stdio only. Legacy negotiation is rejected by the example launcher.
- Initial local runtime: Node 22 on macOS, with Linux/macOS and Node 22/24 coverage configured in CI. Only completed runs establish tested coverage.
- Local POSIX filesystem, operator-owned directories, launch configuration, private key and evidence files. The example checks its OS UID and binds the configured session to that local principal. This is not remote-user authentication.
- Ordinary `tools/call`. Discovery supports explicit registration. Resources, prompts, sampling, elicitation, tasks, HTTP/OAuth and resumed input flows have no governance claim here; resumed input flows explicitly reject. The underlying SDK handles native lifecycle and request cancellation.

The operator must route every protected operation in the claimed boundary through the wrapper. Calling the underlying handler, filesystem or another unwrapped tool is outside it. No library can constrain an operator who replaces its gate. The retained client experiment demonstrates why client-only enforcement cannot protect a controlled server from raw clients.

## Effective action and approvals

The schema validates and applies defaults. The application resolves the principal and resource; its effective arguments are validated again and frozen before evaluation. The signed action includes server, exact tool name, definition digest, principal, resource ID/version and effective arguments.

The definition digest covers the declared revision, JSON input schema, intent and scope. Registration refuses duplicates and exposes no mutable SDK handle. A changed exported schema stops calls until re-registration. Change the revision when handler semantics, hidden coercions or resource resolution change; no generic library can infer those changes. Custom transformations outside the declared contract are unsupported.

The reference provider requires a current, unrevoked operator session; an exact principal/server/tool/resource permission; and a current, unrevoked approval matching the action and loaded policy digest. It supplies fixed bits AUTHN=1, AUTHZ=2, FRESHNESS=4, APPROVAL=8 for the reference policy. Do not reuse this provider with differently assigned policy bits. The provider reads operator-controlled state before signing and again immediately before the resource precondition. Tool arguments and annotations cannot supply trusted evidence.

The report resource must be absent. The handler uses exclusive creation to enforce that condition atomically at the file operation. The application owns state races beyond these checks; the provider does not offer a distributed revocation transaction or general exactly-once execution.

## Retention, receipts and recovery

The gate requires a valid v2 proof verified under the configured public key and a matching sink acknowledgment before dispatch. `createLocalProofSink` exclusively creates a mode-0600 file, flushes it with `fsync`, then flushes the directory and its parent. The directory must already exist under operator-controlled ancestors. Never put secrets in action or evidence payloads; the reference report content is intentionally retained in its proof.

The acknowledgment is `file-and-directory-fsync` on the tested local filesystem. Process-kill tests cover interrupted execution and subsequent proof verification. This is not tested protection against hardware power loss, a lying storage device, network-filesystem failure or machine loss; it is not replication.

The result distinguishes policy `decision`, `eligible`, `outcome`, `authorizationRetained`, and `receiptRetained`. Signing or storage failure can leave the policy `ALLOWED` while execution remains ineligible. A receipt links request and attempt IDs, authorization ID/hash, action digest and observed outcome. Receipts are unsigned local observations, clearly marked `signed: false`; they do not inherit the authorization signature.

- `not_started`: no handler dispatch through the gate.
- `reported_success` / `reported_failure`: the handler returned that result.
- `unknown`: dispatch may have happened but the result is unavailable, including cancellation or timeout after possible execution.

A receipt-write failure preserves the observed result and sets `receiptRetained: false`. After restart, an authorization without a retained receipt must be treated as an unresolved/unknown execution attempt. Its presence alone cannot distinguish a crash before dispatch from a crash after the effect. Reconcile the target file before any retry. The adapter never automatically replays consequential calls, and the example never overwrites an existing report.

Cancellation before dispatch prevents invocation. In-flight dependencies or handlers may finish after cancellation; their completion cannot retroactively authorize a new dispatch or turn an unknown return into a false no-effect assertion. The default gate deadline is 30 seconds, configurable from 1 ms to 300 seconds; receipt retention gets a separate bounded attempt of at most five seconds.

## Packaging and remaining acceptance

The Node declaration test covers a consumer using both packages. Python exposes its v2 verifier and policy-bound governor with typing metadata. Repository verifiers still support separate archival v1 interpretation; see [migration](../../docs/remediation/migration.md).

The build is a review candidate. Hosted CI, final release versions/pins, operating workload acceptance and owner acceptance remain separate from local test passes. See the [acceptance ledger](../../docs/remediation/acceptance.md).
