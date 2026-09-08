# Authorization proof v2 — unreleased contract

The owner selected exact signed payload bytes for the new public format on September 8, 2026. This implementation is intended for a versioned release; it has not been published. See [migration](../docs/remediation/migration.md).

## Claim and boundary

A successful v2 verification authenticates the returned authorization record under the supplied P-256 public key and validates its structure. It does not prove the truth of evidence, that the signer was entitled to grant permission, that the policy was correct, or that an action executed. Applications establish signer trust through a configured public key obtained independently of the bundle. `key_id` is a convenience fingerprint, not a trust registry or key-selection authority.

The core SDK produces an evaluation record. An application may supply action and evidence context, but remains responsible for their accuracy and the final execution gate. `external_effects` is always false: this record contains no execution-success assertion. A signed `ALLOWED` record is not a transferable capability or execution token.

## Wire envelope

Exactly seven fields are permitted. All are required; unknown fields reject.

| Field | Meaning |
|---|---|
| `kind` | Fixed `vella_proof_bundle_v2` |
| `payload_type` | Fixed `application/vnd.vella.authorization.v2+json` |
| `payload` | Canonical padded standard Base64 of exact UTF-8 JSON record bytes |
| `signature_alg` | Fixed `ecdsa-p256-sha256` |
| `signature` | Base64 of a 64-byte ECDSA P-256 SHA-256 signature, IEEE P1363 `r || s` |
| `key_id` | `key_` plus first 16 lowercase hex characters of SHA-256 over DER SubjectPublicKeyInfo |
| `payload_hash` | `sha256:` plus lowercase SHA-256 of the typed message defined below |

There is no mutable metadata area in this envelope. Store export timestamps and other mutable annotations separately. Fixed format and algorithm labels are enforced; the payload type is included in the signed message. The key ID is checked against the supplied key. Hash and signature values are derived/checkable rather than independent authenticated assertions.

For payload bytes `P` and UTF-8 type bytes `T`, the signed message is:

```text
ASCII("DSSEv1 ") || ASCII(decimal(byteLength(T))) || SP || T || SP ||
ASCII(decimal(byteLength(P))) || SP || P
```

This uses [DSSE pre-authentication encoding](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md); the Vella envelope is not the DSSE envelope schema. Verifiers must authenticate this exact message. They must not reserialize the parsed JSON to reconstruct it. Equivalent records serialized differently may have different signatures and hashes.

Verification rejects keys outside P-256, incorrect fingerprints, noncanonical Base64, unsupported labels, wrong hashes/signatures and invalid decoded records. Decoded payloads are limited to 1 MiB. These limits do not replace host limits on transport or input-file size.

## Authenticated authorization record

Exactly these fields are required:

- `envelope_id`, `request_id`, `authority_scope`, `policy_version`: nonempty strings, at most 1024 UTF-8 bytes.
- `intent`, `requested_policy_version`, `build_hash`: strings with the same limits or explicit null. The actual loaded version and requested version remain separate, including on a mismatch denial. Null build identity means unavailable.
- `policy_digest`: SHA-256 digest of the loaded policy artifact's canonical JSON representation. The digest identifies that artifact, including normalized-name spelling; it is not a claim of equivalent policy semantics.
- `evidence_mask`: normalized unsigned 32-bit integer, or null when no valid normalized mask can be established. `ALLOWED` requires a non-null intent and mask.
- `decision`, `reason_code`: the defined decision and reason enums. `POLICY_SATISFIED` occurs if and only if the decision is `ALLOWED`.
- `timestamp`: a real UTC date/time with exactly millisecond precision, `YYYY-MM-DDTHH:mm:ss.sssZ`, years 0001–9999.
- `action`: object or null; `action_digest`: its canonical digest, or null exactly when action is null. The core API accepts application-defined action content; a production gate must impose the workflow's effective-action schema.
- `evidence`: object or null, containing application-supplied references or minimized context, never implicit evidence verification.
- `boundary`: `evaluation`, `client-dispatch`, or `server-handler`, describing the signer's asserted observation point.
- `external_effects`: fixed false.

All record content is authenticated, including nested fields. Parsing happens after signature verification and must reject duplicate decoded object keys, malformed UTF-8, a UTF-8 BOM, unpaired surrogates, trailing content, unsupported values and excessive nesting. No fields are silently discarded. Maximum nesting is 32, with the root at depth zero; object keys and values count at their child depth.

## Stable action and policy digests

Digests use SHA-256 of [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) canonical JSON over a bounded JSON domain: null, booleans, valid Unicode strings, finite IEEE-754 numbers, arrays and string-keyed objects. Integral numbers must be within ±9007199254740991. Integers and integral floats such as `1` and `1.0` have the same digest. Negative zero canonicalizes to zero. Strings are not Unicode-normalized. Keys sort by UTF-16 code units. Python uses `rfc8785` 0.1.4; Node uses explicit recursive serialization and ECMAScript primitive serialization.

SDK values must be plain JSON records and dense arrays; cycles, unsupported objects and values are rejected. Node also rejects accessors, hidden properties and symbol keys rather than silently omitting them. A digest is not encryption or anonymization. Applications must keep credentials out of record content.

## Schema and verifier outputs

[proof-v2.json](schemas/proof-v2.json) defines the outer schema and `$defs.authorizationRecord`. JSON Schema content annotations are not automatic Base64 decoding or cryptographic verification. Consumers must separately validate the authenticated decoded record and enforce the semantic limits above.

The Node and Python SDK `verifyProofV2` / `verify_proof_v2` functions return `ok`, `format`, `errors`, `warnings`, and, only on success, `authenticated` plus checked hash/key information. Use `authenticated` as the interpreted record. The repository's Node dispatcher also reports v1 versus v2 and legacy warnings. The Python dispatcher retains its historical tuple API; use the SDK API for structured v2 results. CLI exit codes remain zero for success and nonzero for failure; format/claim details are printed to stderr, leaving `VERIFIED` on stdout for compatibility.

There are three executable verifier entry points but two structural implementations: Node and Python. The shell v2 path uses Python for parsing and structural checks and OpenSSL for signature verification. Its cryptographic check does not reuse Python's signature verification. V1 retains its separate historical algorithms and limitations.
