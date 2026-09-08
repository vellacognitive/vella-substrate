# VELLA Interface Control Document

**Version:** v1.3
**Status:** Published v1 contract with unreleased v2 development amendments
**Issuer:** Vella Cognitive, LLC
**Contact:** agent@vellacognitive.com
**Repository:** github.com/vellacognitive/vella-substrate

**Development amendment:** current source emits the owner-selected v2 proof when high-level signing is enabled. The [v2 proof contract](proof-v2.md) governs that format; [migration notes](../docs/remediation/migration.md) describe its breaking release requirements and retained v1 limits. No new version has been published.

---

## 1. Purpose and Scope

This document defines the canonical interface between the VELLA embedded SDK and external systems. It is the authoritative normative reference for integrators, system architects, and compliance reviewers working with the SDK published in this repository. The machine-readable schema companion to this document is `spec/schemas/icd.json`.

**Scope of this document.** This ICD specifies the in-process interface exposed by the embedded SDK (`sdk/node/` and `sdk/python/`). Specifically:

- The decision lifecycle from intent submission through proof issuance
- The trust boundary between VELLA and calling applications
- Enforcement obligations of the calling application
- Verification procedures for proof bundle authenticity
- Error and failure semantics
- Version compatibility policy

**Out of scope.** This document does not cover:

- The commercial VELLA runtime and sidecar (HTTP/gRPC interfaces, deployment topology, transport security) — those are licensed separately and documented separately
- Internal evaluator implementation
- Calling-application mission logic or action execution
- Policy authoring or scenario configuration

**SDK vs. commercial runtime.** VELLA exists in two deployment forms. The embedded SDK in this repository runs in-process, as a library imported into a Node.js or Python application. The commercial runtime (not published here) runs as a standalone service with HTTP and gRPC surfaces, persistence, and multi-tenant operation. Compatibility of a commercial producer with the new v2 format must be established separately; this repository does not test that implementation. The interface defined in this ICD applies to the SDK. See `DEPLOYMENT.md` for guidance on when each form is appropriate.

**Policy instances.** The default governor compiles `min-v1` at module initialization. It supports `EXECUTE_CHANGE`, `ESCALATE_PRIVILEGE`, and `DATA_EXPORT`. The unreleased `createGovernor` (Node) and `create_governor` (Python) APIs snapshot a validated custom policy and provide evaluation with optional signing. `createEvaluator` / `create_evaluator` remain evaluation-only. A new instance activates a new policy; no mutable global reload is introduced.

---

## 2. Version History

| Version | Status | Notes |
|---|---|---|
| v0 | Pre-release (deprecated) | Schema artifact from internal development. Do not use in integration. |
| v1.0 | Superseded | Initial authoritative release. |
| v1.1 | Superseded | Added error semantics and proof retrieval specification. |
| v1.2 | Superseded | DecisionResponse fields aligned with current implementation. |
| v1.3 | **Current — Authoritative** | Scoped to the embedded SDK interface. Runtime-specific sections moved to the commercial-runtime documentation set. All production SDK integrations target v1. |

The `$id` field in `spec/schemas/icd.json` is canonicalized to v1 as of this release. Any prior reference to `vella://contracts/v0/...` schema identifiers should be treated as pre-release and non-binding.

---

## 3. Trust Boundary

The VELLA SDK is a pre-execution decision authority. Its role in the integration is precisely bounded:

**VELLA is responsible for:**

- Evaluating an intent against the compiled policy
- Issuing a deterministic decision with a reason code
- Producing a cryptographically signed proof bundle when signing is enabled

**The calling application is responsible for:**

- Halting proposed action execution on `DENIED`
- Proceeding with or abandoning proposed action on `ALLOWED` (application's discretion)
- Maintaining integrity of the intent parameters prior to the SDK call
- Persisting proof bundles wherever the application requires them for audit

**Enforcement obligation — `DENIED`:**
A `DENIED` outcome is a mandatory halt. The calling application must not execute the proposed action. There is no override, retry, or escalation path within the VELLA interface. If the calling application executes a denied action, that execution is outside the VELLA decision chain and unattested.

**Enforcement obligation — `ALLOWED`:**
An `ALLOWED` outcome is an authorization finding, not a command. VELLA authorizes; the calling application decides whether to proceed. The calling application owns execution.

Traceability requires the application to bind the effective action and retain the decision. A proof record cannot enforce a denial by itself; the controlled execution boundary must prevent dispatch.

---

## 4. Decision Lifecycle

The complete interface flow, from intent to proof:

```
Application                                   VELLA SDK
  |                                                |
  |--- govern({intent, evidenceMask, ...}) ------->|
  |                                                |--- evaluate against compiled policy
  |                                                |--- build envelope
  |                                                |--- sign (if signing key provided)
  |<-- { decision, reasonCode, latencyUs,     -----|
  |      proofBundle? }                            |
  |                                                |
  |  [if DENIED: halt execution]                   |
  |  [if ALLOWED: application decides]             |
  |                                                |
  |  [if proofBundle present: persist it wherever  |
  |   the application keeps audit evidence]        |
```

No network round trip occurs. The SDK call is a synchronous function invocation in the calling application's process.

### 4.1 Intent parameters

Parameters supplied to the SDK's `govern(...)` call.

| Parameter | Node key / Python key | Required | Description |
|---|---|---|---|
| Intent | `intent` / `intent` | Yes | Action intent identifier (e.g., `EXECUTE_CHANGE`) |
| Evidence mask | `evidenceMask` / `evidence_mask` | Yes | Bitmask asserting which evidence types the application has satisfied. See §4.4 for bit definitions. |
| Authority scope | `authorityScope` / `authority_scope` | No | Named scope in the compiled policy; defaults to the policy's declared `defaultScope` |
| Policy version | `policyVersion` / `policy_version` | No | Must match the compiled policy's version string; if omitted, the compiled version is used |
| Proof signing | `proof.signingKey` / `proof_signing_key` | No | P-256 PEM private key. Signing failure yields a null bundle and diagnostic. |
| Action context | `action` / `action` | No | JSON object describing the effective action; default null |
| Evidence context | `evidence` / `evidence` | No | JSON object of application-supplied references; default null |
| Request identity | `requestId` / `request_id` | No | Application correlation ID; generated when absent |
| Boundary | `boundary` / `boundary` | No | `evaluation` (default), `client-dispatch`, or `server-handler` |
| Build identity | `buildHash` / `build_hash` | No | Available build identity; null when unavailable |

**Integrity requirement.** The calling application must not modify the intent parameters after the `govern(...)` call returns. VELLA's proof chain is anchored to the envelope constructed from the parameters as submitted.

### 4.2 Decision result

Returned by the SDK synchronously.

| Field | Node key / Python key | Present | Description |
|---|---|---|---|
| Decision | `decision` / `decision` | Always | `ALLOWED` or `DENIED` — the enforcement outcome |
| Reason code | `reasonCode` / `reason_code` | Always | Machine-readable reason for the decision (see §5.2) |
| Latency | `latencyUs` / `latency_us` | Always | Microsecond elapsed time through evaluation, before optional signing |
| Proof bundle | `proofBundle` / `proof_bundle` | When signing key provided | Signed proof record (see §4.3) |
| Proof error | `proofError` / `proof_error` | When signing failed | Diagnostic string; `proofBundle` / `proof_bundle` is `null` |

A denial must halt execution. An allow only satisfies the policy prerequisite; required proof, retention and other operational checks must also succeed. `reasonCode` does not grant an override.

### 4.3 Proof Bundle

Current development SDKs return the [v2 exact-byte authorization proof](proof-v2.md), defined by `spec/schemas/proof-v2.json`, when signing succeeds. Its typed payload authenticates the complete nested record, loaded policy identity and supplied action context. IDs, timestamps and signatures vary between calls.

Retained v1 records use `spec/schemas/proof.json` and their original verification rules. Their visible fields are not all authenticated; see [legacy limitations](../docs/remediation/migration.md).
**Persistence.** The SDK does not persist proof bundles. The calling application is responsible for writing bundles to whatever storage its audit regime requires (file, database, object store, append-only log). Applications operating in regulated or defense environments must persist the complete proof bundle at decision time.

**Retention.** The calling application must retain proof bundles for the duration required by its applicable records retention policy.

### 4.4 Evidence Mask

The `evidenceMask` parameter is an unsigned integer bitmask asserting which classes of evidence the calling application has satisfied prior to the decision request. Bit definitions in the default policy:

| Bit | Value | Evidence class |
|---|---|---|
| 0 | 1 | `AUTHN` — principal authentication established |
| 1 | 2 | `AUTHZ` — authorization decision attached |
| 2 | 4 | `FRESHNESS` — evidence is within its freshness window |
| 3 | 8 | `ATTESTATION` — platform or artifact attestation present |

Custom policies may define additional bits through bit 31. The numeric range is 0 through 4294967295. SDK decimal strings and symbolic convenience forms are validated against the loaded policy; invalid values return `E_EVIDENCE_INVALID` when evidence validation is reached. See [input validation](input-validation.md) for the exact accepted domain and policy compilation rules. The JSON request schema describes the normalized numeric form.

The calling application is responsible for establishing the truth of each bit it asserts. VELLA evaluates the assertion; it does not independently verify the underlying evidence.

### 4.5 Export Evidence

The export evidence schema (`spec/schemas/export.json`) defines a flat evidence record format suitable for transmission to external audit systems. An export is a snapshot of a decision event. The `ok` field indicates whether the export completed successfully; `external_effects` indicates whether the decision had effects beyond the VELLA boundary. Exports are produced by application-side tooling, not by the SDK itself.

---

## 5. Error and Failure Semantics

VELLA's error model is fail-closed by design. Absence of a valid decision does not imply authorization.

### 5.1 SDK Error Model

The SDK is a synchronous function call. It does not throw exceptions across the boundary to the calling application under normal error conditions. Instead, evaluator-level failures are caught internally and surfaced as `DENIED` with a specific reason code:

| Condition | Behavior |
|---|---|
| Malformed intent parameters (missing intent, wrong types) | Returns `DENIED` with `reasonCode` = `E_INTENT_REQUIRED` or equivalent specific code |
| Unknown intent under a scope that disallows unknowns | Returns `DENIED` with `reasonCode` = `DENY_FAST` |
| Policy version mismatch | Returns `DENIED` with `reasonCode` = `E_POLICY_VERSION_MISMATCH` |
| Insufficient evidence mask | Returns `DENIED` with `reasonCode` = `E_EVIDENCE_MISSING` |
| Invalid evidence value | Returns `DENIED` with `reasonCode` = `E_EVIDENCE_INVALID` |
| Unexpected evaluator exception | Returns `DENIED` with `reasonCode` = `E_EVALUATOR_INTERNAL` |
| Signing failure (signing key provided but invalid) | Returns the decision unchanged, with `proofBundle` set to `null` and `proofError` populated |

**Fail-closed evaluation.** Evaluator errors produce `DENIED`. Optional signing failures leave the policy decision unchanged. A calling application must halt on a denial, an unexpected result, or a failure of any mandatory proof or execution prerequisite. Policy permission and operational eligibility to execute are separate conditions. Invalid custom policy configuration raises at evaluator creation and must not be activated.

### 5.2 Reason Codes

| Reason code | Decision | Meaning |
|---|---|---|
| `POLICY_SATISFIED` | `ALLOWED` | All policy requirements for the intent are met. |
| `DENY_FAST` | `DENIED` | Unknown intent or unknown authority scope under fail-closed defaults. |
| `E_INTENT_REQUIRED` | `DENIED` | Request did not include a usable intent identifier. |
| `E_POLICY_VERSION_MISMATCH` | `DENIED` | Requested policy version does not match the compiled policy version. |
| `E_EVIDENCE_MISSING` | `DENIED` | Evidence mask does not satisfy the intent's required-evidence mask. |
| `E_EVIDENCE_INVALID` | `DENIED` | Evidence is outside the supported unsigned integer or known-symbol domain. |
| `E_EVALUATOR_INTERNAL` | `DENIED` | Internal evaluator error path. Treat as infrastructure fault. |

---

## 6. Concurrency and Execution Model

### 6.1 Call Model

- Each `govern(...)` call is independent. The SDK holds no session, no stateful connection, no per-caller context.
- The evaluator is synchronous. The calling application must wait for the result before proceeding with or halting the proposed action.
- The SDK is safe to call from multiple threads or async contexts concurrently. The evaluator is a pure function over the compiled policy and the supplied parameters.

### 6.2 Performance Reference

Historical benchmark figures from the published SDK, not acceptance measurements for v2 or MCP:

| Measurement | Observed Latency |
|---|---|
| Evaluation only (warm) | 1–5 µs |
| Evaluation only (cold, first call) | Up to ~76 µs |
| With proof bundle generation | ~250 µs end-to-end |

Figures reflect in-process SDK invocation. They do not apply to the commercial runtime, which operates over a network or IPC boundary and has a different latency profile.

### 6.3 Retry and Idempotency

Do not implement retry-on-`DENIED` logic. A `DENIED` outcome is a policy decision, not a transient error. Retrying with identical inputs produces an identical outcome. Retry-on-`DENIED` indicates a misunderstanding of the authorization contract.

`govern(...)` is idempotent with respect to policy evaluation: identical inputs produce identical `decision` and `reasonCode`. `proofBundle` fields that depend on time or UUID generation (`envelope_id`, `request_id`, `timestamp`; legacy `exported_at`) will vary between calls with otherwise identical inputs.

---

## 7. Verification Procedure

The `verify/verify.js`, `verify/verify.py`, and `verify/verify.sh` scripts are normative verification procedures for proof bundle authenticity. They are not test artifacts — they are specified interface commitments. Integrators in regulated and defense environments must run one of these procedures as part of their audit workflow.

**Node.js verifier** (built-in crypto; keep the repository modules available):

```
node verify/verify.js <bundle.json> <public-key.pem>
```

**Python verifier** (v2 requires the SDK modules, `cryptography`, and `rfc8785`):

```
python verify/verify.py <bundle.json> <public-key.pem>
```

**Shell verifier** (requires `jq`, `openssl`, Base64/hex/hash utilities; v2 additionally uses the Python structural helper and its dependencies):

```
verify/verify.sh <bundle.json> <public-key.pem>
```

### Verification chain

1. Obtain the proof bundle JSON for the decision under audit from the calling application's proof store.
2. Obtain the public key corresponding to the signing key that produced the bundle. (For bundles signed by an integrator, the integrator manages this key. For bundles signed with the repository's example keypair, see `examples/example-signing.pub`.)
3. Run one of the three verifiers with the proof bundle and public key as arguments.
4. V2 checks the declared format/algorithm, key identity, encodings, typed-message hash, signature over exact bytes, and authenticated record structure and action digest. V1 uses separate historical hash/signature rules and emits limitation warnings.
5. Successful verification identifies the format and its claim. V2 authenticates the interpreted record under the supplied key. Neither format proves evidence truth, authority of the signer or external execution. V1 success must not be described as protection of all visible or nested fields.
**Verification failure** means the proof bundle cannot be relied upon. Do not treat an unverified proof bundle as an authoritative audit record.

### Cross-form compatibility

New v2 proofs from both SDKs are tested across the repository verifier entry points. The shell v2 entry point shares Python structural validation and uses OpenSSL for signature checking. Commercial-runtime compatibility is outside this implementation test matrix.

---

## 8. Compatibility and Breaking Change Policy

### v1 Stability Commitments

The following are stable in v1 and will not change without a major version increment:

- `decision` enum values: `ALLOWED`, `DENIED`
- Required fields in the intent parameters: `intent`, `evidenceMask` / `evidence_mask`
- Required fields in the decision result: `decision`, `reasonCode` / `reason_code`
- Required fields in the proof bundle: all fields marked required in `spec/schemas/proof.json`
- The verifier interface contract (inputs, outputs, exit codes)
- The canonicalization and signing procedures that produce verifiable bundles

### Breaking Changes

A breaking change is any modification that would require an integrator to update their integration code or compliance posture. Breaking changes increment the major version (v1 → v2) and are announced with a minimum 90-day notice period for production integrators.

Breaking changes include, but are not limited to:

- Removal of a required field
- Change to `decision` enum values
- Change to signature algorithm
- Change to proof bundle structure that invalidates existing verification procedures

### Non-Breaking Changes

The following are non-breaking and may occur within v1:

- Addition of optional parameters
- Addition of informational fields to the decision result
- Addition of fields to the proof bundle that do not affect verification
- Documentation clarifications

---

## 9. Schema Reference

| Schema File | `$id` | Description |
|---|---|---|
| `spec/schemas/icd.json` | `vella://contracts/v1/icd.json.schema.json` | Canonical interface contract |
| `spec/schemas/proof-v2.json` | `vella://contracts/v2/proof.json.schema.json` | Unreleased exact-byte proof structure and decoded record |
| `spec/schemas/proof.json` | `vella://contracts/v1/proof.json.schema.json` | Proof bundle structure |
| `spec/schemas/export.json` | `vella://contracts/v1/export.json.schema.json` | Export evidence record |
| `spec/threat-model.md` | — | Threat model and protection scope |
| `spec/reason-codes.md` | — | Reason code enumeration with semantics |
| `policy/POLICY_MATRIX.md` | — | Governance domain taxonomy |

All schemas are JSON Schema Draft 2020-12 compliant.

---

## 10. Examples

Working examples are provided in `examples/`:

| File | Description |
|---|---|
| `node-quickstart.js` | Minimal SDK usage example (Node.js) |
| `python-quickstart.py` | Minimal SDK usage example (Python) |
| `verify-a-bundle.js` | Standalone verification example |
| `allowed-bundle.json` | Example `ALLOWED` proof bundle |
| `denied-bundle.json` | Example `DENIED` proof bundle |
| `tampered-bundle.json` | Example bundle that fails verification |
| `walkthrough.md` | Step-by-step walkthrough |

Examples are non-normative. In any conflict between an example and this document, this document governs.

---

## 11. Normative Precedence

For v2 proof interpretation, `spec/proof-v2.md` and its schema govern. Published v1 interface commitments and legacy interpretation remain separate. For the remaining interface, in descending order of authority:

1. This document (ICD.md, v1)
2. `spec/schemas/icd.json` (machine-readable schema)
3. `spec/schemas/proof.json`, `spec/schemas/export.json`
4. `verify/verify.js`, `verify/verify.py`, `verify/verify.sh` (normative verification procedures)
5. `examples/` (illustrative, non-normative)
6. All other `spec/` documents
