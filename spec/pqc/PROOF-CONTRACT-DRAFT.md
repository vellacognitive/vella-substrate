# Hybrid proof contract — review draft 1

Not frozen, not published. Executable counterpart: `integrations/pqc-production/`. The draft kind and media types intentionally differ from the feasibility experiment and every released proof format. Final identifiers require M1 review.

## Payload and digest domain

The authorization record retains all v2 fields and meanings, adds `digest_profile: "sha384-jcs-v1"`, and requires SHA-384 policy/action digests. It never feeds new-profile digests through the legacy validator. Action digest is null only for a null action. Policy digest is always a full `sha384:` plus 96 lowercase hexadecimal digits. The object must meet the same decision/reason, evidence-mask, boundary, timestamp and UTF-8 semantics as v2.

Digest input is RFC 8785 canonical JSON over the allowed domain: plain JSON data, no duplicate names (including escaped aliases), nonfinite/unsafe numbers, unpaired surrogates, BOM or trailing data. Keys sort by UTF-16 code units; equivalent supported number values canonicalize consistently. Signatures cover exact transmitted payload bytes, so digest canonicalization does not mean verification reserializes a signed payload.

Resource contract for new records: decoded payload ≤1 MiB; nesting ≤32; ≤16,384 visited JSON values including object names; ≤256 fields per object; ≤4,096 elements per array; ≤65,536 UTF-8 bytes per string, including names. Object APIs reject accessors, hidden/symbol properties, sparse arrays, nonplain objects and proxies in Node; Python accepts exact built-in JSON types. These are local API input constraints, not a sandbox against hostile code executing in the process. Limits precede key loading or signature work. Serialized and object APIs enforce the same record domain.

## Envelope and signed message

Exactly eight fields: `kind`, `payload_type`, `suite`, `digest_profile`, `payload`, `keys`, `signatures`, `payload_hash`.

- Kind: `vella_proof_bundle_pq_draft1`.
- Payload type: `application/vnd.vella.authorization.pq-draft1+json`.
- Signature-policy type: `application/vnd.vella.signature-policy.pq-draft1+json`.
- Suite: `p256+ml-dsa-65`; this draft has no PQ-only accepted profile.
- Digest profile: `sha384-jcs-v1`.
- `keys` and `signatures` have exactly `ecdsa-p256-sha256` and `ml-dsa-65`.
- Key IDs: SHA-384 of DER SPKI, full prefixed lowercase hex; they identify keys, not trust anchors by themselves.
- Signature bytes: 64-byte P1363 P-256/SHA-256 and 3,309-byte pure ML-DSA-65. ML-DSA uses the native empty context; domain separation is in the message below.
- Payload/signatures use canonical padded standard Base64. Outer JSON ≤2 MiB. Key inputs ≤8 KiB each. No additional signatures or unknown fields are accepted.

Let `P` be the exact strict UTF-8 payload bytes and `D` the RFC 8785 canonical encoding of `{kind, payload_type, suite, digest_profile, keys}`. Define `PAE(T, B)` as the length-delimited `DSSEv1 <UTF8-byte-length(T)> <T> <byte-length(B)> <B>` framing used in the existing proof design. Both signatures cover:

```
PAE(payload_type, P) || PAE(signature_policy_type, D)
```

`payload_hash` is SHA-384 of this complete message, prefixed `sha384:`. This is an application-specific hybrid envelope, not the DSSE envelope schema or an IETF Composite ML-DSA encoding. A reviewer must evaluate the composition before freeze.

## Provider and trust contract

Sign receives a validated record and a complete local private-key pair. Verify receives a proof, independently supplied public-key pair and an explicit required suite. No suite is inferred from an untrusted envelope. Both cryptographic checks and semantic validation must succeed before returning `authenticated`. Failures return `ok: false`, stable failure category and no authenticated record. Detailed local diagnostics must exclude private key contents.

Local private-key exchange uses P-256 PEM/PKCS#8 and an ML-DSA object `{format: "raw-seed", value: <32-byte canonical Base64>}`. Import through native APIs. SPKI public keys are portable across producers. This unencrypted interchange contract is not the at-rest key-store design.

The later key-store implementation must create a protected operator-owned directory and private files, reject symlinks and overly permissive ownership/mode, and validate a complete key-set manifest before activation. One single-process atomic swap publishes an immutable active revision. Each call captures that revision; if it changes or is revoked/expired before dispatch, the call stops and any retained proof remains an unused authorization. No await may separate final active-revision validation and dispatch. Cross-process coordinated rotation is excluded unless separately implemented. Historical verification uses an explicit archival trust policy and cannot prove a signing date from a self-reported timestamp.

In governed calls, `evidence.signing_key` authenticates the captured `key_set_id` and `key_revision`. The local provider rechecks this snapshot synchronously immediately before dispatch. The operator evidence provider also checks its reported session, permission and approval expiration times at that final boundary. Standalone SDK evaluation proofs may omit the execution-specific key context and do not establish that a gate dispatched an action.

## Review fixtures required

Both languages generate keys, produce and verify proofs. Controls cover swapped keys, either missing/corrupt signature, profile/hash/kind/type alteration, payload mutation, validly signed malformed records, duplicate outer and inner names, changed definition/action/policy references, noncanonical Base64, maximum sizes, over-limit objects/strings/arrays/depth, Unicode and numeric interoperability. Existing v2 must reject all draft proofs; the draft verifier must reject v2 and feasibility proofs.
