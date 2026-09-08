# Threat, claim and migration map

Draft for independent review. Scope: current authorization of local protected report calls. Seven-year retention/verification target accepted, subject to continued cryptographic assurance and operator custody; no fixed-years security guarantee. This is an engineering threat analysis, not an independent security review.

## Trust boundary

An untrusted MCP caller can supply arguments, malformed proofs to verification tools, repeated calls and concurrent requests. They cannot choose the gate's required signature suite, replace operator configuration, read local private keys, mutate protected code or bypass the operator-controlled filesystem permissions. The model and caller-supplied evidence bits are not trusted identity. Operator-controlled evidence sources can still assert false facts; signatures do not fix that assumption.

The hostile-network, compromised-operator/OS, private-key extraction, physical storage-loss and external IAM/TLS boundaries are excluded. An attacker who breaks P-256 alone must still satisfy ML-DSA-65. This desired hybrid property is conditional on review of the composition and implementation, not proved by passing test vectors.

| Threat | Required control / counterexample | Acceptance |
|---|---|---|
| Classical-only or PQ-only downgrade | Trusted required profile, both signatures mandatory, no auto-selection from envelope | PQ04 |
| Key substitution or mixed key pair | Bind both SPKI fingerprints and profile in signed descriptor; require exact trusted key set | PQ04/PQ06 |
| Same payload used in another protocol | Distinct typed message for authorization and signature policy; fixed draft/version identity | PQ02 |
| Validly signed but ambiguous record | Strict parsing, semantic validation and domain-bounded canonical digests | PQ03/PQ05 |
| Approval references old/different hash semantics | Explicit profile-specific digests at definition/action/policy/approval boundaries | PQ07 |
| Revocation or rotation during an awaited prerequisite | Capture one key-set revision; recheck active revision/validity immediately before synchronous dispatch, with no intervening await | PQ06/PQ08 |
| Expired or altered evidence | Re-resolve operator evidence after proof retention, validate the precondition and bind exact effective action | PQ07/PQ08 |
| Signer or required storage outage | No protected invocation without both signatures and retention acknowledgment | PQ08 |
| Effect completes but receipt cannot be stored | Preserve observed success/failure or unknown outcome; no automatic retry | PQ09 |
| Resource exhaustion | Validate lengths before crypto; bounded JSON traversal, key imports, admission and deadlines | PQ05/PQ12 |
| Old proof replayed as permission | Proof is an audit record; gate makes a fresh action/evidence decision and attempt; verifier success alone never dispatches | PQ08/PQ10 |
| Old signature presented after compromise | Explicit archive/current trust mode; signed timestamp is not a trusted timestamp | PQ01/PQ06/PQ10 |

## Hash migration inventory

| Binding / current source | Current meaning | New-profile treatment |
|---|---|---|
| Node/Python `proof-v2` digest and validator | SHA-256 canonical action and policy binding | Preserve v2; separate new-profile digest/validator uses SHA-384 |
| Node/Python governor | Policy snapshot and action digests in record | Select one explicit profile for both record and policy identity; no shared mutable default |
| Node execution gate | Definition syntax, action/evidence comparisons, policy identity | Profile-owned digest and format validator; compare full authenticated record bindings |
| Operator evidence provider | Exact approval action/policy digest string match | Regenerate approvals for new profile; never translate an old approval by changing its prefix |
| MCP `describeGovernedTool` and registration | Canonical JSON schema/revision/identity digest | Explicit gate-matched profile, passed to descriptor and action preparation |
| Local report action / harness | Arguments/defaults/resource bound to tool definition | Prepare SHA-384 definition and approval under same policy profile |
| Proof payload hash and key IDs | v2 typed-message SHA-256 and short key fingerprint | New typed-message SHA-384 and full SHA-384 SPKI fingerprints |
| Receipt fields and local sink acknowledgment | SHA-256 receipt digest and v2 authorization reference | New receipt version/profile; SHA-384 receipt digest and authorization reference; receipt stays unsigned |
| Public APIs/types, schemas and three verifier routes | v1/v2 names and hash shapes | Explicit new entry point/profile dispatch; no relaxation of v2 hash pattern |
| Build hash, upstream evidence IDs | Operator-provided references, not necessarily cryptographic digests | Classify as opaque references; no inherited security strength or hidden interpretation |
| CI/artifact SHA-256 manifests | Distribution/source checksums | Remain outside authorization-strength claim; do not market supply-chain PQ assurance |
| Historical v1 helpers and archives | Legacy signature and omission limitations | Preserve byte/claim interpretation; no retroactive protection |

SHA-384 improves the new external digest bindings but does not turn P-256 into a category-3 primitive or prove uniform category-3 strength of the whole system. The P-256 component retains SHA-256 as specified by its own algorithm; the ML-DSA component independently signs the entire typed message. A compromised signer, false evidence, or unmediated route remains a counterexample to a broad safety claim.

## Compatibility and rollback

Upgrade verifiers and trust configuration before enabling new producers/routes. New-profile approvals must be generated from new-profile actions/policies. Separate legacy and new profiles can coexist; do not negotiate downward per request. Rollback must leave new-format verification available and disable any hybrid-required route that the rolled-back process cannot enforce. Existing tags and package files are immutable.

## Standards comparison requiring review

FIPS 204 supplies ML-DSA, not this application envelope. The prototype's double PAE gives exact-byte typing but is not the DSSE envelope schema. IETF Composite ML-DSA draft 19 addresses X.509 keys/signatures with its own algorithm combinations, domain handling and ASN.1 encoding. Reusing that name or OID for a different envelope would be incorrect. The first review must decide whether this application-specific two-signature contract is appropriate or whether an existing composition should replace it. Any replacement requires new cross-language vectors and latency qualification.

The draft does include an ML-DSA-65/P-256 combination. It uses a SHA-512 prehash and its own message representative; its classical component uses ECDSA with SHA-256. Sharing component algorithms therefore does not make Vella's raw typed-message construction interoperable with that draft. [Algorithm definition](https://datatracker.ietf.org/doc/html/draft-ietf-lamps-pq-composite-sigs-19#section-6).
