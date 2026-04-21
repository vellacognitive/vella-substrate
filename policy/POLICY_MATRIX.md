# VELLA Policy Matrix

**Version:** 1.0 | **Last updated:** 2026-04-21 | **Status:** Public reference

This matrix maps the policy domains where VELLA provides pre-execution authority adjudication. Each row identifies the tactical owner, the VELLA insertion point, the adapter pattern used to integrate, the canonical decision call, and the deny-path behavior on a `DENIED` result.

Cross-references:
- Interface contract: [`spec/icd.md`](../spec/icd.md)
- Policy taxonomy and intent coverage: [`policy/POLICY_MATRIX.md`](./POLICY_MATRIX.md)
- Threat scope: [`spec/threat-model.md`](../spec/threat-model.md)
- Example integration references: `examples/` and `verify/`

---

## Evidence Mask Reference

| Bit | Flag | Decimal | Hex |
|-----|------|---------|-----|
| 0 | `AUTHN` | 1 | `0x01` |
| 1 | `AUTHZ` | 2 | `0x02` |
| 2 | `FRESHNESS` | 4 | `0x04` |
| 3 | `ATTESTATION` | 8 | `0x08` |
| — | `AUTHN+AUTHZ` | 3 | `0x03` |
| — | `AUTHN+AUTHZ+ATTESTATION` | 11 | `0x0B` |
| — | `AUTHZ+ATTESTATION` | 10 | `0x0A` |

Domain-specific mask extensions (e.g., `APPROVAL`, `DLP_SATISFIED`, `SIGNED_ARTIFACT`) are policy-defined fields carried in the evidence envelope. See this matrix for extension conventions.

---

## Matrix

> **Column guide**
> - **Adapter pattern** — how the calling system connects to VELLA (see [spec/icd.md §3](../spec/icd.md))
> - **Evidence mask** — required evidence flags; absence of any required flag produces `DENIED` deterministically
> - **Deny-path** — required system behavior when VELLA returns `DENIED`; VELLA does not enforce this — the calling system must implement it

---

### 1 · Identity & Authentication

| Field | Value |
|---|---|
| **Policy owner** | IAM Lead / Identity Engineer |
| **Secondary owners** | CISO; Security Architect |
| **Policy lives in** | Okta / Azure AD / ADFS; Conditional Access |
| **Policy artifacts** | CA rules; MFA requirements; session policies; device posture rules |
| **Today's enforcement point** | Login / token issuance |
| **VELLA insertion point** | At token issuance boundary (IdP hook) OR first privileged action boundary in app/API |
| **Adapter pattern** | IdP post-authentication hook → VELLA SDK inline call; or API gateway pre-filter |
| **`intent_id`** | `AUTHN_SESSION_START` |
| **`authority_scope_id`** | `<tenant/env>` |
| **Evidence mask** | `AUTHN` + `DEVICE_POSTURE` — mask `0x01` + policy extension |
| **Evidence bound** | SAML/OIDC claims; MFA satisfied flag; device posture attestation ref; session risk score |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `policy_version` + `decision_id` |
| **Deny-path** | Block token issuance; return auth error to caller; do not establish session |

---

### 2 · Authorization (RBAC/ABAC)

| Field | Value |
|---|---|
| **Policy owner** | App Security / Authorization Owner |
| **Secondary owners** | Platform Lead; Compliance |
| **Policy lives in** | App role systems; API gateway authorizers; custom ABAC/RBAC services |
| **Policy artifacts** | Roles/groups; entitlements; attribute rules; policy bundles |
| **Today's enforcement point** | In-service authZ checks / gateway authorizer |
| **VELLA insertion point** | Replace scattered `allow()` checks at action boundary (service/API) |
| **Adapter pattern** | SDK inline call at service action boundary; or gateway authorizer plugin calling VELLA |
| **`intent_id`** | `<ACTION>` (service-defined, e.g. `READ_RECORD`, `WRITE_CONFIG`) |
| **`authority_scope_id`** | `<app/domain>` |
| **Evidence mask** | `AUTHN+AUTHZ` — `0x03` |
| **Evidence bound** | Caller identity claims; entitlement proofs; attribute snapshot hash; authZ context id |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + obligations (optional) |
| **Deny-path** | Return `403` to caller; do not execute action; log `decision_id` for audit |

---

### 3 · Privileged Access (PAM)

| Field | Value |
|---|---|
| **Policy owner** | PAM Admin / Privileged Access Manager |
| **Secondary owners** | CISO; IT Ops |
| **Policy lives in** | CyberArk / BeyondTrust / Delinea |
| **Policy artifacts** | Elevation workflows; approvals; time-bound roles; break-glass flags |
| **Today's enforcement point** | Privileged session launch / command allow |
| **VELLA insertion point** | Before elevation grant OR before privileged command execution |
| **Adapter pattern** | PAM platform webhook / pre-session hook → VELLA SDK call |
| **`intent_id`** | `PRIV_ELEVATE` or `PRIV_COMMAND` |
| **`authority_scope_id`** | `<env>` |
| **Evidence mask** | `AUTHZ+APPROVAL+TICKET` — `0x02` + policy extensions |
| **Evidence bound** | Ticket/approval id; elevation token id; time window; break-glass justification ref |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `required_evidence_missing` list |
| **Deny-path** | Block session/command; require ticket or approval before retry; alert PAM admin |

---

### 4 · Device / Service Identity (PKI / Attestation)

| Field | Value |
|---|---|
| **Policy owner** | PKI Admin / Device Security Engineer |
| **Secondary owners** | Security Architect |
| **Policy lives in** | Venafi/PKI; TPM attestation services; device identity registries |
| **Policy artifacts** | Cert profiles; rotation policy; attestation requirements |
| **Today's enforcement point** | mTLS handshake / device registration |
| **VELLA insertion point** | At device registration gateway OR before accepting device-originated command |
| **Adapter pattern** | Registration gateway adapter → VELLA SDK call before issuing identity credential |
| **`intent_id`** | `DEVICE_REGISTER` or `DEVICE_COMMAND` |
| **`authority_scope_id`** | `<site/fleet>` |
| **Evidence mask** | `ATTESTATION+AUTHN` — `0x09` |
| **Evidence bound** | Cert chain hash; attestation report hash; device posture snapshot; firmware/boot measurements |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `device_posture_required` |
| **Deny-path** | Reject registration; quarantine device; do not issue identity credential |

---

### 5 · Network Segmentation (Macro)

| Field | Value |
|---|---|
| **Policy owner** | Network Security Engineer |
| **Secondary owners** | CISO; Zero Trust Architect |
| **Policy lives in** | Firewalls (Palo Alto etc.); NAC; routers/ACLs |
| **Policy artifacts** | Zones; rulesets; change requests |
| **Today's enforcement point** | Packet path / L3–L4 enforcement |
| **VELLA insertion point** | Not inline on packets — gate rule changes and high-impact network actions |
| **Adapter pattern** | Change management pipeline step → VELLA SDK call before rule commit |
| **`intent_id`** | `NET_RULE_CHANGE` |
| **`authority_scope_id`** | `<env>` |
| **Evidence mask** | `APPROVAL+CHANGE_TICKET+ATTESTATION` — `0x08` + policy extensions |
| **Evidence bound** | Ticket id; diff hash of proposed rules; approver chain; maintenance window |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `change_constraints` |
| **Deny-path** | Block rule commit to firewall; require CAB re-approval; alert network security |

---

### 6 · Microsegmentation / Service-to-Service AuthZ (Mesh)

| Field | Value |
|---|---|
| **Policy owner** | Service Mesh / Platform Security Owner |
| **Secondary owners** | App owners |
| **Policy lives in** | Istio/Linkerd; service mesh auth policies |
| **Policy artifacts** | Service allowlists; JWT/mTLS authZ policies |
| **Today's enforcement point** | Sidecar / mesh policy engine |
| **VELLA insertion point** | Gate high-risk route enablement or policy changes; optionally gate sensitive calls |
| **Adapter pattern** | Mesh control-plane adapter (sidecar pattern) → VELLA call before route/policy activation |
| **`intent_id`** | `SVC_ROUTE_ENABLE` or `SVC_CALL_<X>` |
| **`authority_scope_id`** | `<cluster/env>` |
| **Evidence mask** | `AUTHN+AUTHZ` + `SVC_ID+ATTESTATION` — `0x03` + policy extensions |
| **Evidence bound** | Service identity; workload attestation; route target; policy version ref |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` |
| **Deny-path** | Block route activation; revert to prior allowlist state; alert platform security |

---

### 7 · API Mediation / Edge Policies

| Field | Value |
|---|---|
| **Policy owner** | API Gateway Owner |
| **Secondary owners** | Security Architect |
| **Policy lives in** | Apigee / Kong / ALB / WAF / API GW |
| **Policy artifacts** | Rate limits; schema validation; allow/deny rules |
| **Today's enforcement point** | Gateway request admission |
| **VELLA insertion point** | Behind/alongside gateway — gateway calls VELLA before forwarding high-impact intents |
| **Adapter pattern** | Gateway pre-filter plugin → VELLA HTTP call (`POST /sdk/v1/decision`) |
| **`intent_id`** | `API_<ROUTE>` (e.g. `API_ADMIN_EXPORT`) |
| **`authority_scope_id`** | `<api/env>` |
| **Evidence mask** | `AUTHN+RATE_LIMIT_STATE` — `0x01` + policy extension |
| **Evidence bound** | Gateway auth context; rate-limit counters; request classification; schema validation result |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + optional throttling obligation |
| **Deny-path** | Return `429` or `403` to client; do not forward to upstream; log `decision_id` |

---

### 8 · Application Business Gates

| Field | Value |
|---|---|
| **Policy owner** | Service Owner / Engineering Lead |
| **Secondary owners** | Product Owner; Security |
| **Policy lives in** | Service code; config; feature flags |
| **Policy artifacts** | If/else checks; config toggles; flag rules |
| **Today's enforcement point** | In-service logic |
| **VELLA insertion point** | Replace the specific if/else gate with a VELLA pre-check at the decision boundary |
| **Adapter pattern** | SDK inline call (direct library integration) at application decision point |
| **`intent_id`** | `<BUSINESS_ACTION>` (service-defined, e.g. `SUBMIT_ORDER`, `APPROVE_TRANSFER`) |
| **`authority_scope_id`** | `<service/env>` |
| **Evidence mask** | `AUTHN+AUTHZ` + `APPROVAL` when required — `0x03` + policy extension |
| **Evidence bound** | User/session claims; business context hash; approval/ticket ref when required |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `policy_version` |
| **Deny-path** | Return business-layer error to caller; do not execute action; surface `reason_code` to UX if appropriate |

---

### 9 · Workflow Approvals (Human-in-Loop)

| Field | Value |
|---|---|
| **Policy owner** | Process Owner (Change Mgmt / Ops) |
| **Secondary owners** | CAB; Compliance |
| **Policy lives in** | ServiceNow / Jira workflows |
| **Policy artifacts** | Approval states; change windows; runbooks |
| **Today's enforcement point** | Workflow transitions |
| **VELLA insertion point** | At workflow transition step before approval is considered final/executable |
| **Adapter pattern** | Workflow platform webhook → VELLA SDK call at state transition |
| **`intent_id`** | `APPROVAL_STEP_<X>` |
| **`authority_scope_id`** | `<process>` |
| **Evidence mask** | `APPROVAL+TICKET` — `0x00` base; policy-defined extensions only |
| **Evidence bound** | Ticket id; approver set; approval timestamps; change window |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` |
| **Deny-path** | Block state transition; hold ticket in pending state; notify approvers of gap |

---

### 10 · Change Control / Release Governance

| Field | Value |
|---|---|
| **Policy owner** | Release Manager / SRE Lead |
| **Secondary owners** | CAB; AO/ATO (gov) |
| **Policy lives in** | CI/CD (GitHub); branch protection; pipelines |
| **Policy artifacts** | Required checks; signoffs; env constraints |
| **Today's enforcement point** | Merge/deploy gates |
| **VELLA insertion point** | At pipeline gate before deploy promotion OR before merge to protected branch |
| **Adapter pattern** | CI/CD pipeline step → VELLA SDK call (GitHub Action, Jenkins step, etc.) |
| **`intent_id`** | `DEPLOY_PROMOTE` or `MERGE_PROTECTED` |
| **`authority_scope_id`** | `<env>` |
| **Evidence mask** | `SIGNED_ARTIFACT+TESTS_GREEN+APPROVAL` — `0x08` + policy extensions |
| **Evidence bound** | Build attestations; test results digest; approval/ticket id; environment posture |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `required_checks_missing` |
| **Deny-path** | Fail pipeline step; block merge/deploy; surface `required_checks_missing` to PR/pipeline |

---

### 11 · Artifact Signing / Supply Chain

| Field | Value |
|---|---|
| **Policy owner** | AppSec / Build & Release Security |
| **Secondary owners** | CISO |
| **Policy lives in** | Cosign; SBOM tooling; registries |
| **Policy artifacts** | Signatures; SBOMs; attestations |
| **Today's enforcement point** | Admission controller / deploy stage |
| **VELLA insertion point** | At cluster admission (before workload runs) OR release promotion step |
| **Adapter pattern** | Kubernetes admission webhook → VELLA SDK call; or registry promotion hook |
| **`intent_id`** | `ADMIT_IMAGE` |
| **`authority_scope_id`** | `<cluster/env>` |
| **Evidence mask** | `ATTESTATION+SIGNATURE_VERIFIED` — `0x08` + policy extension |
| **Evidence bound** | Image digest; signature verification result; SBOM digest; provenance attestation |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` |
| **Deny-path** | Reject admission; do not schedule workload; alert security and platform teams |

---

### 12 · Data Classification / Handling

| Field | Value |
|---|---|
| **Policy owner** | Data Owner / Data Steward |
| **Secondary owners** | Compliance; Legal |
| **Policy lives in** | Data catalog (Collibra); labels (MIP); DLP |
| **Policy artifacts** | Classification taxonomy; label rules; export controls |
| **Today's enforcement point** | Access checks / export paths |
| **VELLA insertion point** | At data egress boundary (export/share) or before generating external report/package |
| **Adapter pattern** | Egress service adapter → VELLA SDK call before data leaves boundary |
| **`intent_id`** | `DATA_EXPORT` or `DATA_SHARE` |
| **`authority_scope_id`** | `<data_domain>` |
| **Evidence mask** | `AUTHZ+CLASSIFICATION+APPROVAL` — `0x02` + policy extensions |
| **Evidence bound** | Classification label; data set id; approval id; recipient context; export justification |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `handling_obligations` |
| **Deny-path** | Block export; return error with `handling_obligations` for compliant path; log `decision_id` |

---

### 13 · DLP / Exfiltration Controls

| Field | Value |
|---|---|
| **Policy owner** | DLP Program Owner |
| **Secondary owners** | CISO |
| **Policy lives in** | DLP tools (Microsoft/Symantec); CASB |
| **Policy artifacts** | DLP rules; inspection policies |
| **Today's enforcement point** | Proxy/endpoint agent |
| **VELLA insertion point** | Before egress action is executed — proxy calls VELLA with DLP context |
| **Adapter pattern** | CASB/proxy adapter → VELLA HTTP call with DLP inspection results in evidence envelope |
| **`intent_id`** | `EGRESS_UPLOAD`, `EGRESS_EMAIL`, or `EGRESS_SHARE` |
| **`authority_scope_id`** | `<org/env>` |
| **Evidence mask** | `AUTHN+AUTHZ+DLP_SATISFIED` — `0x03` + policy extension |
| **Evidence bound** | DLP match results; content fingerprint hash; user/device context; channel |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `block_reason` |
| **Deny-path** | Drop/block egress action; surface `block_reason` to user; alert DLP program owner |

---

### 14 · Retention / Records

| Field | Value |
|---|---|
| **Policy owner** | Records Manager / Compliance Lead |
| **Secondary owners** | Legal |
| **Policy lives in** | Retention systems; SIEM retention; storage lifecycle |
| **Policy artifacts** | Retention schedules; legal holds |
| **Today's enforcement point** | Storage lifecycle / deletion jobs |
| **VELLA insertion point** | Gate destructive actions (delete/purge); stamp retention class at write time |
| **Adapter pattern** | Storage lifecycle hook → VELLA SDK call before delete/purge operation executes |
| **`intent_id`** | `DELETE` or `PURGE` |
| **`authority_scope_id`** | `<records_class>` |
| **Evidence mask** | `RETENTION_CLASS+HOLD_CHECK` — `0x00` base; policy-defined extensions only |
| **Evidence bound** | Retention schedule id; legal hold status; object identifiers; audit classification |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `retention_class` |
| **Deny-path** | Block delete/purge; preserve object; alert records manager and legal if hold active |

---

### 15 · Audit Logging Requirements

| Field | Value |
|---|---|
| **Policy owner** | SOC Lead / Audit Lead |
| **Secondary owners** | CISO; Compliance |
| **Policy lives in** | SIEM (Splunk/Elastic); log pipelines |
| **Policy artifacts** | Logging standards; required fields; retention |
| **Today's enforcement point** | Log ingestion |
| **VELLA insertion point** | VELLA emits canonical decision + evidence envelopes for every gated intent (automatic) |
| **Adapter pattern** | Native — every VELLA decision produces a signed, immutable decision record by design |
| **`intent_id`** | `<ANY_GATED_ACTION>` |
| **`authority_scope_id`** | `<env>` |
| **Evidence mask** | `MIN_AUDIT_FIELDS` — `0x00` base; policy-defined extensions only |
| **Evidence bound** | `request_id`; actor; rationale; `policy_version`; correlation ids; envelope hashes |
| **VELLA returns** | Decision envelope + evidence envelope ids + hashes |
| **Deny-path** | N/A — audit records are emitted on both `ALLOWED` and `DENIED`; failure to emit is itself a policy violation |

---

### 16 · Immutable Audit / Tamper Evidence

| Field | Value |
|---|---|
| **Policy owner** | Security Architect / Audit Engineering |
| **Secondary owners** | CISO; AO/ATO |
| **Policy lives in** | WORM/object lock/append-only ledgers; git-signed proofs |
| **Policy artifacts** | Object lock config; hash chain configs |
| **Today's enforcement point** | Evidence store write |
| **VELLA insertion point** | At evidence sink interface — persist before/after decision as policy requires |
| **Adapter pattern** | Evidence sink adapter → VELLA SDK call to stamp + seal envelope before write |
| **`intent_id`** | `EVIDENCE_WRITE` |
| **`authority_scope_id`** | `<env>` |
| **Evidence mask** | `IMMUTABILITY_TARGET` — `0x00` base; policy-defined extension only |
| **Evidence bound** | Object lock settings; bucket/object ids; hash chain prev pointer; signature/attestation |
| **VELLA returns** | `ACK/FAIL` + `evidence_location` + hash chain pointer |
| **Deny-path** | Fail write; alert audit engineering; do not proceed without confirmed immutable persistence |

---

### 17 · Safety Constraints (Robotics / Autonomy)

| Field | Value |
|---|---|
| **Policy owner** | Safety Officer / Autonomy Safety Lead |
| **Secondary owners** | Program Manager; Airworthiness |
| **Policy lives in** | Autopilot params; mission manager; safety modules |
| **Policy artifacts** | Geofence config; abort thresholds; modes |
| **Today's enforcement point** | Mission state transitions |
| **VELLA insertion point** | At mission manager boundary before mode transition / command commit |
| **Adapter pattern** | Mission manager adapter sidecar → VELLA SDK call at state machine transition point |
| **`intent_id`** | `ACT_<X>` (mission-defined, e.g. `ACT_ENGAGE`, `ACT_LOITER`) |
| **`authority_scope_id`** | `<mission_mode>` |
| **Evidence mask** | `SENSOR_POSTURE+MODE_STATE` — policy extensions; `ATTESTATION` = `0x08` for hardware-attested posture |
| **Evidence bound** | Sensor posture flags; geofence status; comms state; confidence band; mode snapshot hash |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `constraints_applied` |
| **Deny-path** | Reject command/transition; hold in current mode; apply safe-state fallback per autonomy design |

---

### 18 · ROE / Operational Constraints (Gov / Defense)

| Field | Value |
|---|---|
| **Policy owner** | Commander / Ops Authority |
| **Secondary owners** | Legal Advisor; AO |
| **Policy lives in** | SOPs/TTPs; ops orders; mission rules |
| **Policy artifacts** | Rulesets; escalation criteria |
| **Today's enforcement point** | Operator decision / mission planner |
| **VELLA insertion point** | At decision boundary where ROE applies — before action commit |
| **Adapter pattern** | Mission planner adapter → VELLA SDK call; result feeds operator decision support UI |
| **`intent_id`** | `ROE_<X>` (ops-defined) |
| **`authority_scope_id`** | `<op_order>` |
| **Evidence mask** | `AUTHORITY_GRANTED+APPROVAL+ESCALATION` — `0x00` base; policy-defined extensions only |
| **Evidence bound** | Mission authority refs; escalation record; approval chain; operating context snapshot |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `escalation_required` |
| **Deny-path** | Block action commit; require escalation per `escalation_required` field; produce signed denial record |

---

### 19 · Degraded Mode Handling

| Field | Value |
|---|---|
| **Policy owner** | Ops Lead / Resilience Lead |
| **Secondary owners** | Safety + Security |
| **Policy lives in** | Runbooks; mode logic in systems |
| **Policy artifacts** | "If comms degraded then…" procedures |
| **Today's enforcement point** | Mode transitions |
| **VELLA insertion point** | At mode transition boundary — decision keyed on mode/scope |
| **Adapter pattern** | Mode controller adapter → VELLA SDK call before transition executes |
| **`intent_id`** | `MODE_TRANSITION` |
| **`authority_scope_id`** | `<mode>` |
| **Evidence mask** | `COMMS_STATE+CONFIDENCE_BAND` — `0x00` base; policy-defined extensions only |
| **Evidence bound** | Sensor confidence; comms health; fallback posture; operator acknowledgement when required |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `safe_mode` |
| **Deny-path** | Block transition; remain in current mode; surface `safe_mode` recommendation to operator |

---

### 20 · Incident Response Actions

| Field | Value |
|---|---|
| **Policy owner** | IR Lead / SOC Manager |
| **Secondary owners** | CISO |
| **Policy lives in** | SOAR (Cortex XSOAR); playbooks |
| **Policy artifacts** | Playbook steps; approval requirements |
| **Today's enforcement point** | SOAR execution |
| **VELLA insertion point** | Pre-gate high-impact actions (isolate host, revoke creds, kill process) |
| **Adapter pattern** | SOAR playbook step adapter → VELLA SDK call before destructive action executes |
| **`intent_id`** | `IR_ACTION_<X>` (e.g. `IR_ACTION_ISOLATE`, `IR_ACTION_REVOKE`) |
| **`authority_scope_id`** | `<env>` |
| **Evidence mask** | `INCIDENT_TICKET+APPROVAL+SCOPE` — `0x00` base; policy-defined extensions only |
| **Evidence bound** | Ticket id; severity; approvals; affected assets list hash; time window |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `scope_limited` |
| **Deny-path** | Block action; halt playbook step; require analyst confirmation; alert IR lead |

---

### 21 · IoT / OT Command Authorization

| Field | Value |
|---|---|
| **Policy owner** | OT Security Lead / Plant Ops Lead |
| **Secondary owners** | Safety Officer |
| **Policy lives in** | SCADA/PLC policy layers; device gateways |
| **Policy artifacts** | Command allowlists; maintenance windows |
| **Today's enforcement point** | Gateway/PLC write |
| **VELLA insertion point** | At OT gateway before issuing command to PLC/device |
| **Adapter pattern** | OT gateway adapter → VELLA SDK call; gateway holds command pending decision |
| **`intent_id`** | `COMMAND_<X>` (device-defined) |
| **`authority_scope_id`** | `<site>` |
| **Evidence mask** | `DEVICE_ATTESTATION+OP_AUTH+MAINT_WINDOW` — `0x08` + policy extensions |
| **Evidence bound** | Device attestation; operator identity; maintenance window id; command parameters hash |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `window_required` |
| **Deny-path** | Drop command; do not write to PLC; alert OT security and plant ops; require maintenance window before retry |

---

### 22 · Fleet Firmware Update Policy

| Field | Value |
|---|---|
| **Policy owner** | Fleet Ops Lead / Device Security |
| **Secondary owners** | CISO |
| **Policy lives in** | MDM/OTA update systems |
| **Policy artifacts** | Staged rollout rules; signature requirements |
| **Today's enforcement point** | OTA deployment |
| **VELLA insertion point** | Before rollout promotion (ring escalation) and before device install |
| **Adapter pattern** | MDM/OTA platform adapter → VELLA SDK call at ring promotion and at device install gate |
| **`intent_id`** | `FIRMWARE_PROMOTE` or `FIRMWARE_INSTALL` |
| **`authority_scope_id`** | `<fleet/site>` |
| **Evidence mask** | `SIGNED_FIRMWARE+DEVICE_ELIGIBLE+WINDOW` — `0x08` + policy extensions |
| **Evidence bound** | Firmware digest + sig; eligibility set hash; ring state; maintenance window |
| **VELLA returns** | `ALLOWED/DENIED` + `reason_code` + `rollout_constraints` |
| **Deny-path** | Block ring promotion or device install; hold firmware in staging; alert fleet ops |

---

## Design Notes

### Deterministic deny-on-absence

VELLA's default behavior is `DENIED` when any required evidence flag is absent from the envelope. This is not a fallback — it is the nominal path. Systems integrating VELLA must be designed to handle `DENIED` as a first-class, expected outcome, not an exception.

### VELLA does not execute

VELLA adjudicates and records. It does not issue commands, enforce deny-paths, or participate in control loops. Every deny-path listed in this matrix is the responsibility of the calling system or adapter. See [`spec/threat-model.md`](../spec/threat-model.md) for the formal scope boundary.

### Adapter sidecar pattern

For systems that cannot be modified to call VELLA inline, the adapter sidecar pattern intercepts proposed actions at the boundary and proxies the decision call. Helm charts for production sidecar deployment are part of the commercial runtime and not published in this repository; contact `agent@vellacognitive.com` for access. See [`spec/icd.md §3`](../spec/icd.md) for adapter interface requirements.

### Evidence envelope immutability

Decision records produced by VELLA are cryptographically signed and immutable by design. The `decision_id` referenced in deny-paths is the authoritative audit anchor. See [`spec/icd.md §5`](../spec/icd.md) for envelope schema.

---

*VELLA is a pre-execution decision authority substrate. It is non-executing by design.*
*MIT License · Vella Cognitive, LLC · agent@vellacognitive.com*
