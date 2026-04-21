# VELLA Threat Model

**Version:** v1  
**Status:** Authoritative  
**Issuer:** Vella Cognitive, LLC  
**Contact:** agent@vellacognitive.com  
**Companion document:** `spec/icd.md`

---

## 1. Purpose

This document defines what VELLA is designed to protect against, what it
explicitly does not claim to protect against, and what risks remain even
under correct operation. It exists to prevent ambiguous trust claims and
to give integrators, security reviewers, and compliance officers an honest
basis for their own risk assessments.

---

## 2. What VELLA Protects

### 2.1 Unauthorized action execution

VELLA's primary protection is the enforcement gate. A `DENIED` decision is
a mandatory halt — the calling system must not execute the proposed action.
VELLA's proof chain provides a verifiable record that the gate was reached
and what decision was issued.

**Protection claim:** An agent operating under VELLA cannot execute a
denied action through the VELLA interface and have that execution appear
as authorized in the audit record.

### 2.2 Tampering with decision artifacts

Evidence exports and proof bundles are hash-bound and replay-verifiable.
A tampered artifact will fail structural verification under `verify.sh`.

**Protection claim:** Modification of a proof bundle after issuance is
detectable by any party with access to the bundle and the corresponding proof-signing public key.

### 2.3 Misrepresentation of outputs

VELLA's outputs are explicitly typed. A `DecisionResponse` is an
authorization finding, not an execution record. An evidence export is a
descriptive artifact, not a compliance certification. The ICD formally
defines what each output means and prohibits treating audit artifacts as
executed actions.

**Protection claim:** An integrator who reads the ICD cannot claim VELLA
authorized something that VELLA denied, nor represent an audit artifact as
evidence of execution.

### 2.4 Authority drift

VELLA's capability boundary is declared and sealed. Capability does not
expand through integration configuration or language drift. The policy set
governs what intents are admissible; unknown intents are denied by default.

**Protection claim:** An agent cannot acquire authority it was not
explicitly granted through the policy set.

---

## 3. What VELLA Does Not Protect Against

These are explicit, accepted limits — not gaps to be hidden.

### 3.1 Caller-side enforcement failures

VELLA decides. The caller enforces. If the calling system executes a
denied action by ignoring the `DENIED` response, that execution is outside
the VELLA decision chain and unattested. VELLA has no mechanism to prevent
a caller from bypassing the enforcement gate.

**Mitigation:** This is a deployment and integration governance problem.
Regulated and defense integrators must ensure the enforcement gate is not
bypassable by design. See ICD.md §3.

### 3.2 Compromised caller infrastructure

If the system submitting IntentRequests is compromised, VELLA evaluates
what it receives. It cannot detect that the IntentRequest was constructed
by a malicious actor operating within the caller's trust boundary.

### 3.3 Policy misconfiguration

A misconfigured policy set — one that permits intents it should deny — is
not a VELLA vulnerability. Policy authoring is the deploying institution's
responsibility. See `policy/POLICY_MATRIX.md`.

### 3.4 Trusted insider misuse

A trusted operator with legitimate access can misrepresent VELLA's outputs
to a third party. VELLA cannot prevent a human from lying about what an
audit artifact says. This is governed by institutional controls, not
technical ones.

### 3.5 Public-key non-repudiation (v1)

In v1, the proof bundle signature is a software-integrity mechanism. It is
not a court-grade non-repudiation instrument backed by a hardware security
module or a public CA. It detects tampering reliably. It does not provide
institutional-grade accountability on its own.

### 3.6 Persistent tamper-evident storage

VELLA does not guarantee long-term storage of proof records. Callers are
responsible for retaining proof bundles for the duration required by their
applicable records retention policy. See ICD.md §4.3.

### 3.7 Third-party timestamping and external provenance

v1 proof bundles carry VELLA-issued timestamps. There is no external
timestamping authority or third-party provenance chain in v1. Provenance
is internal and must be stated as such in any compliance narrative.

---

## 4. Residual Risks

These risks remain true even under correct, uncompromised operation:

- A trusted operator can misuse authority and misrepresent outputs to
  third parties. Institutional oversight is the control.
- Ephemeral custody cannot substitute for long-lived tamper-evident audit
  trails in environments with multi-year retention requirements.
- A system can be correctly deployed and still be used irresponsibly.
  VELLA provides the governance substrate; it does not substitute for
  governance.

---

## 5. Adversary Classes

VELLA's design addresses the following adversary classes:

| Adversary | Threat | VELLA's response |
|-----------|--------|-----------------|
| External attacker | Tamper with proof bundles or swap artifacts | Hash-bound exports, `verify.sh` verification chain |
| Malicious insider | Misuse credentials or misrepresent outputs | Explicit output typing, ICD prohibitions, audit record |
| Process attacker | Force premature authority escalation | Deferral doctrine — unknown intents denied by default |
| Integration drift | Expand capability through configuration | Sealed policy set; capability does not expand without explicit policy change |
| Curious observer | Infer restricted information from artifacts | Minimization posture; exports do not include caller internals |

---

## 6. Scope of This Document

This document covers the VELLA decision substrate as specified in
`spec/icd.md`. It does not cover:

- Caller-side systems, infrastructure, or access controls
- Network transport, authentication, or session management
- Policy authoring correctness (see `policy/POLICY_MATRIX.md`)
- Deployment environment security
- Downstream systems that consume VELLA decisions

---

## 7. Relationship to Other Documents

| Document | Relationship |
|----------|-------------|
| `spec/icd.md §3` | Trust boundary — formal definition of caller vs. VELLA responsibilities |
| `spec/icd.md §4.3` | Proof bundle scope and retention obligations |
| `spec/icd.md §5` | Verification procedure — normative proof bundle verification |
| `policy/POLICY_MATRIX.md` | Policy misconfiguration risk |
| `verify/verify.sh` | Normative verification implementation |

---

*VELLA — Pre-execution decision authority for agentic AI*  
*Vella Cognitive, LLC — agent@vellacognitive.com — github.com/vellacognitive/vella-substrate*
