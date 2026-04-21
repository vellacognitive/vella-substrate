# VELLA Interface Control Document
**Version:** v1.2  
**Status:** Authoritative  
**Issuer:** Vella Cognitive, LLC  
**Contact:** agent@vellacognitive.com  
**Repository:** github.com/vellacognitive/vella-substrate

---

## 1. Purpose and Scope

This document defines the canonical interface between VELLA and external systems. It is the authoritative normative reference for all integrators, system architects, and compliance reviewers. The machine-readable schema companion to this document is `spec/schemas/icd.json`.

**This document covers:**
- The decision lifecycle from intent submission through proof issuance
- The trust boundary between VELLA and calling systems
- Enforcement obligations of the caller
- Verification procedures for decision authenticity
- Transport and authentication guidance
- Error and failure semantics
- Version compatibility policy

**This document does not cover:**
- Internal VELLA policy engine implementation
- Caller-side mission logic or action execution
- Policy authoring or scenario configuration

> **v1 Policy Note:** In v1, the decision policy is compiled at startup from
> a policy object defined in the runtime. The default policy (`min-v1`) supports
> three intents: `EXECUTE_CHANGE`, `ESCALATE_PRIVILEGE`, and `DATA_EXPORT`.
> Custom policy sets are deployed by providing a custom policy object at
> runtime initialization. A runtime policy API is planned for a future version.

---

## 2. Version History

| Version | Status | Notes |
|---------|--------|-------|
| v0 | Pre-release (deprecated) | Schema artifact from internal development. Do not use in integration. |
| v1.0 | Superseded | Initial authoritative release. Superseded by v1.1. |
| v1.1 | Superseded | Added error semantics, transport/auth guidance, concurrency guidance, proof retrieval spec. |
| v1.2 | Current — Authoritative | DecisionResponse fields aligned with runtime (outcome→decision, rationale→reason_code). Envelope property added. All production integrations target v1. |

The `$id` field in `spec/schemas/icd.json` is canonicalized to `v1` as of this release. Any prior reference to `vella://contracts/v0/...` schema identifiers should be treated as pre-release and non-binding.

---

## 3. Trust Boundary

VELLA is a **pre-execution decision authority**. Its role in the integration is precisely bounded:

**VELLA is responsible for:**
- Evaluating an `IntentRequest` against the applicable policy set
- Issuing a cryptographically signed `DecisionResponse`
- Producing a tamper-evident proof bundle for audit

**The caller is responsible for:**
- Halting proposed action execution on `DENIED`
- Proceeding with or abandoning proposed action on `ALLOWED` (caller's discretion)
- Maintaining integrity of the `IntentRequest` prior to submission
- Storing and producing proof bundles upon audit request

**Enforcement obligation — DENIED:**  
A `DENIED` outcome is a **mandatory halt**. The calling system must not execute the proposed action. There is no override, retry, or escalation path within the VELLA interface. If the calling system executes a denied action, that execution is outside the VELLA decision chain and unattested.

**Enforcement obligation — ALLOWED:**  
An `ALLOWED` outcome is an authorization finding, not a command. VELLA authorizes; the caller decides whether to proceed. The caller owns execution.

This boundary is the foundation of VELLA's audit model: every action taken under VELLA's authority is traceable to a specific decision, and every denial is enforceable by inspection of the proof record.

---

## 4. Decision Lifecycle

The complete interface flow from intent to proof:

```
Caller                          VELLA
  |                               |
  |--- IntentRequest ------------>|
  |    (intent, proposed,         |
  |     evidence, authority)      |
  |                               |--- evaluate against policy
  |                               |--- sign response
  |<-- DecisionResponse ----------|
  |    (decision, reason_code,    |
  |     envelope, trace)          |
  |                               |
  |  [if DENIED: halt execution]  |
  |  [if ALLOWED: caller decides] |
  |                               |
  |--- request proof bundle ----->|
  |<-- ProofBundle ---------------|
  |    (envelope_id, hash,        |
  |     signature, urls)          |
  |                               |
  |  [store proof for audit]      |
```

### 4.1 IntentRequest

Submitted by the caller to initiate a decision. Defined in `spec/schemas/icd.json#/definitions/IntentRequest`.

| Field | Required | Description |
|-------|----------|-------------|
| `intent` | Yes | Action intent identifier (e.g., `EXECUTE_CHANGE`) |
| `proposed.action` | Yes | The action string the caller proposes to execute |
| `proposed.params` | No | Structured parameters for the proposed action |
| `evidence.sources` | No | Array of supporting evidence references |
| `evidence.attachments` | No | Array of attached evidence objects |
| `authority.domain` | Yes | Authority domain under which the decision is requested |
| `authority.mode` | No | Operational mode (e.g., `live`, `exercise`, `simulation`) |
| `authority.policySet` | No | Named policy set override; defaults to domain default |

**Integrity requirement:** The caller must not modify the `IntentRequest` after submission. VELLA's proof chain is anchored to the envelope as submitted.

### 4.2 DecisionResponse

Returned by VELLA synchronously upon evaluation. Defined in `spec/schemas/icd.json#/definitions/DecisionResponse`.

| Field | Required | Description |
|-------|----------|-------------|
| `decision` | Yes | `ALLOWED` or `DENIED` — the enforcement decision |
| `reason_code` | No | Machine-readable reason code for the decision (e.g., `POLICY_SATISFIED`, `E_EVIDENCE_MISSING`) |
| `envelope` | No | Signed proof envelope, present when signing is enabled |
| `trace.id` | No | Trace identifier for correlation with proof bundle |
| `trace.at` | No | ISO 8601 timestamp of decision issuance |

**`decision` is the only field with enforcement weight.** `reason_code` is informational and must not be used as the basis for appeal or override.

### 4.3 Proof Bundle

Issued by VELLA following a decision. Defined in `spec/schemas/proof.json`.

The proof bundle is the tamper-evident record of the decision. It includes the `envelope_id`, `envelope_hash`, cryptographic `signature`, and retrieval URLs for audit access. The `sha256_bundle` field is the authoritative hash of the complete bundle.

**Proof Bundle Retrieval**

Proof bundles are retrievable via three endpoints on the VELLA runtime:

| Endpoint | Description |
|----------|-------------|
| `GET /sdk/v1/proof/:envelope_id` | Machine-readable JSON proof bundle. Suitable for automated audit workflows. |
| `GET /sdk/v1/proof/:envelope_id/view` | Human-readable HTML decision record. |
| `GET /sdk/v1/proofs` | Listing of the 20 most recent proof bundles. |

Callers operating in regulated or defense environments MUST store the complete proof bundle locally at decision time. Do not rely on endpoint retrieval as the primary audit mechanism.

**Retention:** Callers operating in regulated or defense environments must retain proof bundles for the duration required by their applicable records retention policy. VELLA does not guarantee long-term storage of proof records accessible via `console_url` or `inspect_url`.

### 4.4 Export Evidence

The export evidence schema (`spec/schemas/export.json`) defines the flat evidence record format. An export is a snapshot of a decision event suitable for transmission to external audit systems. The `ok` field indicates whether the export completed successfully; `external_effects` indicates whether the decision had effects beyond the VELLA boundary.

---

## 4.5 Runtime Request Mapping

The `POST /sdk/v1/decision` endpoint accepts a flat JSON body. The following
table maps ICD `IntentRequest` fields to their runtime equivalents accepted
by the min evaluator:

| IntentRequest field | Runtime field | Notes |
|---------------------|---------------|-------|
| `intent` | `intent_id` or `intent` or `action` | Evaluator accepts any of the three; `intent_id` is preferred |
| `authority.domain` | `authority_scope_id` | Maps to a named scope in the compiled policy |
| `authority.policySet` | `policy_version` | Must match the compiled policy version string (default: `min-v1`) |
| `evidence` | `evidence_mask` | Integer bitmask; `1` = AUTHN, `2` = AUTHZ, `4` = FRESHNESS, `8` = ATTESTATION |
| `proposed` | _(not evaluated)_ | Structural field in the IntentRequest schema; not consumed by the min evaluator in v1 |

**Minimal conformant request to `POST /sdk/v1/decision`:**
```json
{
  "intent_id": "EXECUTE_CHANGE",
  "authority_scope_id": "sdk_v1_default",
  "evidence_mask": 1,
  "policy_version": "min-v1"
}
```

**Response shape from the min runtime:**
```json
{ "decision": "ALLOWED", "reason_code": "POLICY_SATISFIED", "envelope": { ... } }
{ "decision": "DENIED",  "reason_code": "E_EVIDENCE_MISSING", "envelope": { ... } }
```

The `decision` and `reason_code` fields match the ICD `DecisionResponse`
schema directly. When signing is enabled, the `envelope` field contains the
signed proof bundle. HTTP status is `200` on ALLOWED, `403` on DENIED.



---

## 5. Error and Failure Semantics

VELLA's error model is fail-closed by design. Absence of a valid decision does not imply authorization.

### 5.1 HTTP Status Codes

| HTTP Status | Meaning |
|-------------|---------|
| 200 OK | Decision issued. Inspect `decision` field for ALLOWED or DENIED. A 200 does not imply ALLOWED. |
| 400 Bad Request | Malformed IntentRequest. Required fields missing or schema validation failed. Decision was not evaluated. Caller must fix the request before retrying. |
| 422 Unprocessable Entity | IntentRequest is well-formed but semantically invalid (e.g., unknown intent, missing required evidence). Decision outcome is DENIED with a `reason_code`. |
| 500 Internal Server Error | Evaluator fault. Decision was not issued. Treat as DENIED. Do not proceed with proposed action. |
| 503 Service Unavailable | VELLA is unavailable or not ready. Decision was not issued. Treat as DENIED. Apply fallback behavior per authority context. |

### 5.2 Fail-Closed Guarantee

> **Critical:** In all error conditions (400, 422, 500, 503, network timeout, connection refused), the caller MUST treat the condition as DENIED and apply the deterministic fallback behavior defined for the intent. There is no implicit ALLOWED path. If VELLA cannot be reached, the proposed action must not proceed.

### 5.3 Reason Codes

When `decision` is DENIED, the `reason_code` field contains a machine-readable reason:

| Reason Code | Description |
|-------------|-------------|
| `POLICY_SATISFIED` | Decision is ALLOWED. All policy requirements met. |
| `DENY_FAST` | Unknown intent or authority scope not found in policy. Default deny. |
| `E_INTENT_REQUIRED` | No intent field in request. |
| `E_POLICY_VERSION_MISMATCH` | Requested policy version does not match loaded policy. |
| `E_EVIDENCE_MISSING` | Evidence mask insufficient for this intent's policy requirements. |
| `E_EVALUATOR_INTERNAL` | Internal evaluator error. Treat as infrastructure fault. |

---

## 6. Transport and Authentication

Transport security and authentication are intentionally caller-defined in VELLA v1.

### 6.1 Transport

VELLA exposes a single decision endpoint:
POST /sdk/v1/decision
Content-Type: application/json

The runtime listens on port 5000 by default. In production, a TLS-terminating reverse proxy or service mesh sidecar SHOULD be placed in front of the VELLA runtime. VELLA does not terminate TLS in v1.

| Deployment Pattern | Description |
|-------------------|-------------|
| Kubernetes sidecar | VELLA adapter runs as a sidecar in the same pod. Calls are made over localhost. No transport encryption required within the pod boundary. |
| Internal service tier | VELLA runs as a separate service. mTLS strongly recommended via service mesh (Istio, Linkerd) or ingress policy. |
| Air-gapped / classified enclave | VELLA runs fully offline. Transport security enforced at enclave boundary by the integrating system. |

### 6.2 Authentication

VELLA v1 does not implement built-in caller authentication. Recommended patterns:

- **Network-layer isolation:** Restrict access by IP allowlist or Kubernetes NetworkPolicy.
- **API key header:** Shared secret in a request header validated by a proxy in front of VELLA.
- **mTLS:** Client certificates validated at the TLS layer. Strongest option for regulated environments.

> **Warning:** The VELLA decision endpoint must not be exposed on a public network interface without authentication controls.

---

## 7. Concurrency and Throughput

### 7.1 Request Model

- Each call to `POST /sdk/v1/decision` is independent. No session, no stateful connection, no batch API in v1.
- The evaluator is synchronous. Callers must wait for the response before proceeding with or halting the proposed action.
- Bulk or batch decision patterns are not supported in v1. Each proposed action requires a separate decision request.

### 7.2 Performance Reference

Observed decision adjudication latency in benchmark runs (adapter sidecar configuration):

| Percentile | Observed Latency |
|------------|-----------------|
| p50 (median) | 0.349 ms |
| p95 | 0.851 ms |
| p99 | 1.681 ms |
| Max observed | 5.476 ms |

Figures reflect decision adjudication only and are provided as a reference baseline.

### 7.3 Connection Pooling

For high-throughput systems, the adapter SHOULD maintain a persistent HTTP connection pool to the VELLA runtime. The runtime supports HTTP keep-alive.

> **Warning:** Do not implement retry-on-DENIED logic. A DENIED outcome is a policy decision, not a transient error. Retrying a DENIED request with identical inputs produces an identical DENIED outcome.

## 8. Verification Procedure

VELLA uses two distinct verification paths for two distinct artifacts:

| Artifact | Public Key | Tool | Purpose |
|----------|-----------|------|---------|
| Container image | `cosign.pub` (repo root) | `cosign verify` | Confirms the runtime image was built by Vella Cognitive |
| Proof bundle | `examples/example-signing.pub` | `verify.sh` or `verify.js` | Confirms the decision bundle was issued by VELLA and is untampered |

### 8.1 Proof Bundle Verification

The `verify/verify.sh` and `verify/verify.js` scripts are **normative verification procedures** for proof bundle authenticity. They are not test artifacts — they are specified interface commitments.

Integrators in regulated and defense environments must run one of these procedures as part of their audit workflow.

**Shell (requires jq and openssl):**
```bash
verify/verify.sh <bundle.json> examples/example-signing.pub
```

**Node.js (requires only Node.js built-in crypto):**
```bash
node verify/verify.js <bundle.json> examples/example-signing.pub
```

**Verification chain:**
1. Obtain the proof bundle JSON for the decision under audit (from `GET /sdk/v1/proof/:envelope_id` or from the local proof store at `local proof storage/`)
2. Retrieve `proof-signing.pub` from `github.com/vellacognitive/vella-substrate` (verify against the commit SHA in the audit record)
3. Run `verify.sh` or `verify.js` with the proof bundle and public key
4. The verifier checks:
   - **Envelope hash** — SHA-256 of canonical envelope JSON matches `envelope_hash`
   - **Signature** — ECDSA-P256 signature over `envelope_hash` is valid against `proof-signing.pub`
   - **Bundle hash** — SHA-256 of the complete signed bundle matches `sha256_bundle`
5. A passing verification confirms the proof bundle was issued by VELLA and has not been modified

**Verification failure** means the proof bundle cannot be relied upon. Do not treat an unverified proof bundle as an authoritative audit record.

### 8.2 Container Image Verification

Container image verification uses `cosign.pub` at the repository root and the `cosign verify` tool. This verifies that the runtime container image was built and published by Vella Cognitive. This is separate from proof bundle verification and uses a different key.

```bash
cosign verify --key cosign.pub <runtime-image-ref>
```

---

## 9. Compatibility and Breaking Change Policy

### v1 Stability Commitments

The following are **stable** in v1 and will not change without a major version increment:
- `decision` field values: `ALLOWED`, `DENIED`
- Required fields in `IntentRequest`: `intent`, `proposed`, `authority.domain`
- Required fields in `DecisionResponse`: `decision`
- Required fields in `ProofBundle`: all fields marked required in `proof.json`
- The `verify.sh` interface contract (inputs, outputs, exit codes)

### Breaking Changes

A breaking change is any modification that would require a caller to update their integration code or compliance posture. Breaking changes increment the major version (`v1` → `v2`) and are announced with a minimum 90-day notice period for production integrators.

Breaking changes include, but are not limited to:
- Removal of a required field
- Change to `decision` enum values
- Change to signature algorithm
- Change to proof bundle structure that invalidates existing verification procedures

### Non-Breaking Changes

The following are non-breaking and may occur within v1:
- Addition of optional fields to any schema
- Addition of informational fields to `DecisionResponse`
- Addition of retrieval URLs to proof bundles
- Documentation clarifications

---

## 10. Schema Reference

| Schema File | `$id` | Description |
|-------------|-------|-------------|
| `spec/schemas/icd.json` | `vella://contracts/v1/icd.json.schema.json` | Canonical interface: IntentRequest, DecisionResponse |
| `spec/schemas/proof.json` | `vella://contracts/v1/proof.json.schema.json` | Proof bundle structure |
| `spec/schemas/export.json` | `vella://contracts/v1/export.json.schema.json` | Export evidence record |
| `spec/threat-model.md` | — | Threat model and protection scope |
| `policy/POLICY_MATRIX.md` | — | Policy authoring and custom policy deployment |

All schemas are JSON Schema Draft 2020-12 compliant.

---

## 11. Examples

Working examples are provided in `examples/`:

| File | Description |
|------|-------------|
| `intent-request.example.json` | Conformant IntentRequest |
| `evidence-envelope.example.json` | Evidence bundle structure |
| `decision-response.example.json` | DecisionResponse for ALLOWED and DENIED |
| `adapter-skeleton.js` | Integration adapter scaffold |

Examples are non-normative. In any conflict between an example and this document, this document governs.

---

## 12. Normative Precedence

In descending order of authority:

1. This document (`ICD.md`, v1)
2. `spec/schemas/icd.json` (machine-readable schema)
3. `spec/schemas/proof.json`, `export.json`
4. `verify/verify.sh`, `verify.js` (normative verification procedures)
5. `examples/` (illustrative, non-normative)
6. All other `spec/` documents

---

*VELLA Interface Control Document v1 — Vella Cognitive, LLC — agent@vellacognitive.com*
