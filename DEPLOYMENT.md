# Deployment Scope

This document explains where the VELLA SDK can be deployed, what it's designed for, and where you'd want a different VELLA component instead.

The SDK in this repository is **one of several VELLA components**. The others — the runtime service, the sidecar adapter, Helm charts, and the management plane — are not published here. They are available via commercial license from Vella Cognitive, LLC (`agent@vellacognitive.com`).

---

## The SDK is designed for

### In-process adjudication inside Node.js or Python applications

The SDK is a library. You import it and call `govern()`. The decision returns in single-digit microseconds (warm); with signed proof bundle generation, approximately 250 microseconds end to end. No network hop, no subprocess, no container.

This makes it well-suited for:

- **AI agent tool-call hooks.** Gate every tool call an agent makes with an in-process adjudicator. Works with Claude Code PreToolUse, Claude Agent SDK `canUseTool`, MCP client dispatch, LangChain / LlamaIndex tool execution, and any agent harness where the dispatcher lives in a Node or Python process.
- **Local CLI and developer-tool governance.** Git hooks, pre-commit checks, shell scripts, deploy gates invoked as a function call rather than a service.
- **CI/CD pipeline steps.** GitHub Actions, GitLab CI, Jenkins, Buildkite — any step that can run a Node script or Python script can call the SDK directly without spinning up a container.
- **Research notebooks and evaluation frameworks.** Jupyter, `uv`-managed scripts, academic eval harnesses. Runs wherever a Python or Node interpreter runs.
- **Edge compute.** Nvidia Jetson, OT gateway, ruggedized Linux, embedded devices running Python or Node without a container runtime. The SDK has zero external dependencies (Node) or a single standard dependency (Python `cryptography`).
- **Air-gapped and disconnected environments.** Full offline governance. Proof bundles produced offline are verifiable later, anywhere, by anyone with the public key.
- **Autonomous systems at mission-authority level.** Mode transitions, command commits, state changes at human-command or mission-event frequency. Not inside control loops (see below).
- **Batch and bulk processing.** Pipelines adjudicating thousands or millions of proposed actions. Single-digit microseconds per call; no container-startup or network latency.
- **Multi-agent orchestration.** Inter-agent authorization with evidence-bound proofs.
- **Desktop and native applications.** Electron apps, Python applications, or any Node/Python-hosted product that ships with governance embedded.
- **Node or Python microservices in-process.** Adjudication inside a single service's own process space.

### What "in-process" means in practice

The SDK is used like any other library. Three-line example:

```javascript
import { govern } from '@vellacognitive/vella-sdk';
const result = govern({ intent: 'EXECUTE_CHANGE', evidenceMask: 1 });
// result.decision === 'ALLOWED' or 'DENIED'
```

For signed proof bundles:

```javascript
const result = govern({
  intent: 'EXECUTE_CHANGE',
  evidenceMask: 1,
  proof: { signingKey: mySigningKey }
});
// result.proofBundle is a complete signed record
```

The proof bundle can be verified by anyone, anywhere, using the tools in `/verify/` — no contact with Vella Cognitive required.

---

## The SDK is not designed for

These deployment contexts exist, are legitimate, and are what the non-SDK VELLA components are for. If you find yourself in one of these, contact Vella Cognitive (`agent@vellacognitive.com`) for the right component.

### Polyglot environments — services written in Go, Java, .NET, Rust, etc.

The SDK is Node and Python. If you need VELLA from a Go service, the right answer is the **sidecar adapter** (not published here) — a small process that accepts ICD-conformant requests over localhost and proxies them to the evaluator. One sidecar per node, any language on either side.

### Enterprise service mesh / multi-service adjudication

Ten microservices sharing one policy set and one set of decisions are better served by a single shared adjudicator than by embedding the SDK ten times. The **sidecar** or **runtime service** (not published here) is the right component.

### Kubernetes admission control

Works as an SDK-backed sidecar but is not the native K8s integration path. The **vella-adapter Helm chart** (not published here) is the supported deployment.

### High-throughput API gateways (10K+ requests per second per instance)

The SDK handles this functionally, but at that scale operational concerns — pooling, graceful degradation, async signing queues, shared proof persistence — are better served by the **runtime service** (not published here).

### Multi-tenant shared adjudication across different applications or customers

The SDK is per-process. Multi-tenant shared adjudication — one adjudicator serving many distinct applications or customer boundaries — requires out-of-process isolation. The **runtime service** (not published here) is the right component.

### Network-boundary enforcement between trust domains

The SDK lives inside a process. Enforcement at a network or trust-domain boundary (between organizations, between a harness and an MCP server across a network, between a customer network and an external service) requires a service at that boundary. The **sidecar adapter** or **runtime service** (not published here) is the right component.

### Hosted SaaS / cloud-delivered VELLA

Not supported. VELLA is deliberately a customer-boundary product — it runs inside the customer's infrastructure, produces decisions and evidence locally, and has no external control plane. This is an architectural property, not an operational gap. If you need a hosted adjudicator, VELLA is the wrong choice.

### Mobile native applications (iOS, Android)

Not currently supported. The SDK is Node and Python. A native Swift/Kotlin port or WASM compile would be required. Contact Vella Cognitive if this is a current need.

### Safety-certified flight control, avionics, shipborne primary control

Architecturally out of scope. VELLA is a governance substrate adjudicating authority-level decisions at human-command or mission-event frequency. It is **not** designed for, and must not be placed inside, hard real-time control loops (autopilot servo, CIWS tracking, hardware safety interlocks). Those require RTOS, bare-metal implementation, hardware watchdogs, and safety certification (DO-178C, IEC 61508) that no software governance layer — VELLA or otherwise — provides.

VELLA can be used for the authority-level decisions that *gate* safety-critical subsystems (e.g., "is weapons-free authorized on this track"), provided it sits outside the safety-critical envelope. Where exactly this line falls is a system-design question specific to each deployment; integration services are available.

---

## Summary by audience

### If you are a researcher or individual developer

The SDK is the right component. Install it, use it, cite it. Proof bundles you produce are independently verifiable with the tools in `/verify/`. You do not need anything else from Vella Cognitive to use VELLA in research or individual development work.

### If you are building an open-source agent framework or developer tool

The SDK is the right component. Embed it, make it a configuration option, integrate with your dispatch layer. If you want to ship a product that includes VELLA as a named integration point, contact Vella Cognitive about brand and partnership positioning — the code is yours under MIT, the name is not.

### If you are evaluating VELLA for enterprise deployment

The SDK shows you exactly what VELLA does. For production deployment at enterprise scale, the components you will likely want — the runtime service, sidecar adapter, Helm charts, and management plane — are available via commercial license. Contact `agent@vellacognitive.com`.

### If you are a defense, intelligence, or critical-infrastructure integrator

The SDK may be sufficient if your deployment fits the "designed for" list above (edge compute, air-gapped, autonomous onboard). Commercial licensing, integration services, and certification support are available for the scenarios that require them. Contact `agent@vellacognitive.com`.

---

## Technical specifications

| | SDK (this repository) | Runtime / sidecar (commercial) |
|---|---|---|
| Latency (decision only) | 1–76 µs (warm: 1–5 µs) | p50 349 µs, p95 851 µs, p99 1.68 ms |
| Latency (with proof bundle) | ~250 µs | ~1 ms |
| Deployment model | Library, in-process | Service, out-of-process |
| Language support | Node.js ≥18, Python ≥3.10 | Any language via HTTP/gRPC |
| Network dependency | None | Localhost or cluster-internal |
| Container required | No | Typically yes |
| Multi-tenant | No | Yes |
| Policy hot-reload | Via application restart | Yes |
| Proof bundle format | Identical across components | Identical across components |
| Verification tooling | Included in this repository | Same tooling — identical bundles |

The proof bundle format is identical across all VELLA components. A bundle produced by the SDK is verifiable by the same verifier as a bundle produced by the runtime, and vice versa. There is no compatibility break between the free SDK and the commercial runtime.

---

## Contact

- SDK questions, bug reports, security disclosures: [SECURITY.md](SECURITY.md) or open a GitHub issue
- Commercial licensing, runtime / sidecar access, integration services: `agent@vellacognitive.com`
- Research collaboration and partnership inquiries: `agent@vellacognitive.com`
- Website: https://vellacognitive.com
- Research essay: https://vellacognitive.com/research/an-inspectable-substrate-for-ai-governance
