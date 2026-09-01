# Integration Map

VELLA belongs immediately before a consequential action becomes reachable. The open-source SDK is deliberately framework-neutral; adapters are distribution surfaces, not architectural dependencies.

## Status definitions

| Status | Meaning |
|---|---|
| **Shipped** | Public code exists in this repository or a published SDK and is covered by the repository's verification path |
| **Documented pattern** | The insertion point and enforcement contract are documented, but no framework-specific package is maintained here |
| **Planned** | A candidate adapter is on the public roadmap; it should not be represented as available |
| **Commercial** | The component exists outside this MIT-licensed repository |

## Current matrix

| Ecosystem or boundary | Status | Integration point | Enforcement owner |
|---|---|---|---|
| Node.js application | **Shipped** | Call `govern()` immediately before the side effect | Calling application |
| Python application | **Shipped** | Call `govern()` immediately before the side effect | Calling application |
| GitHub Actions | **Shipped reference adapter** | Add the VELLA authority gate before a deployment, release, or privileged change step | GitHub job; a denial fails the step |
| Generic agent or tool dispatcher | **Documented pattern** | Wrap the dispatcher before the tool handler is invoked | Agent harness |
| Claude Code `PreToolUse` | **Documented pattern** | Map the proposed tool call to a VELLA intent before returning hook permission | Hook implementation |
| Claude Agent SDK `canUseTool` | **Documented pattern** | Call VELLA inside the permission callback | Agent application |
| MCP client dispatch | **Documented pattern** | Gate the client-side call before transport to the MCP server | MCP client or host |
| LangGraph / LangChain / LlamaIndex | **Documented pattern** | Gate the framework's tool-execution middleware | Framework application |
| OpenAI Agents | **Planned adapter** | Wrap tool execution at the framework's tool boundary | Framework application |
| HTTP / gRPC / service mesh / Kubernetes | **Commercial** | Runtime service or sidecar at the network or admission boundary | Runtime or sidecar |

Framework and product names identify integration points; they do not imply endorsement or partnership.

## The generic adapter contract

Every integration, regardless of framework, has the same four obligations:

1. Construct a stable intent identifier for the exact proposed consequence.
2. Assert only evidence the calling system has actually established.
3. Call VELLA before invoking the tool or side effect.
4. Treat `DENIED`, malformed output, or an SDK failure as a mandatory halt.

```js
import { govern } from "@vellacognitive/vella-sdk";

export async function executeGoverned({ intent, evidenceMask, execute }) {
  const result = govern({ intent, evidenceMask });

  if (result.decision !== "ALLOWED") {
    throw new Error(`VELLA denied ${intent}: ${result.reasonCode}`);
  }

  return execute();
}
```

This wrapper is intentionally incomplete: production integrations must derive evidence from trusted application state, persist proof bundles when required, and prevent alternate execution paths that bypass the wrapper. See the [threat model](spec/threat-model.md) and [interface control document](spec/icd.md).

## GitHub Actions authority gate

The first maintained public adapter is [`integrations/github-action/`](integrations/github-action/README.md). It is dependency-free, fails the workflow step on `DENIED`, and optionally writes a signed proof bundle for artifact retention.

## Adapter acceptance bar

A framework-specific adapter is considered shipped only when it includes:

- an explicit insertion point before the side effect;
- deterministic intent and evidence mapping;
- a tested deny path that makes the side effect unreachable;
- fail-closed handling for malformed input and evaluator failure;
- proof persistence guidance; and
- a runnable example or conformance test.

Adapter proposals are welcome through GitHub issues and pull requests. Use the acceptance bar above and link the proposed consequence boundary to an entry in [USE_CASES.md](USE_CASES.md).
