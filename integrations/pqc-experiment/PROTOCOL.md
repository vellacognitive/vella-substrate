# Experimental proof contract

This document describes the feasibility implementation, not a proposed final public standard. No v1/v2 verifier is changed to accept it.

## Trust and signed bytes

A verifier receives a required suite and public-key map from its caller's trusted configuration. The untrusted envelope cannot choose a weaker acceptable suite, add a trusted key, or enable fallback. The two allowlisted suites are `ml-dsa-65` and `p256+ml-dsa-65`. The latter requires both ECDSA-P256-SHA256 (64-byte P1363 encoding) and ML-DSA-65 (3,309 bytes) to verify.

The seven envelope fields are exactly `kind`, `payload_type`, `suite`, `payload`, `keys`, `signatures`, and `payload_hash`. Unknown or missing fields reject. `keys` and `signatures` have exactly the algorithm names selected by trusted configuration. There is one signature per algorithm. Key values are full SHA-384 fingerprints of DER SubjectPublicKeyInfo, not self-issued trust assertions.

Let P be the exact UTF-8 JSON authorization payload bytes. Let D be the RFC 8785 canonical JSON encoding of `{suite, keys}`. Let PAE be the same length-delimited DSSE pre-authentication encoding used by the released reference. Every required signer signs:

```
PAE("application/vnd.vella.experimental.authorization.pqc-v1+json", P)
|| PAE("application/vnd.vella.experimental.signature-policy.pqc-v1+json", D)
```

`kind` is fixed `vella_pqc_feasibility_v1`, `payload_type` is the first type above, and `payload_hash` is SHA-384 of this complete message, prefixed `sha384:`. Payload and signatures use canonical padded standard Base64. ML-DSA is the pure FIPS 204 signing mode with the library's empty context; application domain separation is supplied by the typed message above. This is not HashML-DSA and not the DSSE envelope schema. The custom hybrid composition needs independent review before any production use.

Payload limits and semantic record validation reuse the released v2 contract: 1 MiB decoded payload, strict UTF-8, no BOM, duplicate keys, trailing content, unpaired surrogates, or excessive nesting. The string-input verifier caps the outer envelope at 2 MiB. Both signatures are checked before the payload is interpreted. On failure no authenticated record is returned. Public APIs and file/network entry points still need a complete production resource-limit audit.

## Key representation finding

On the tested versions, Node/OpenSSL's default ML-DSA PKCS#8 output contains a seed and expanded private key. Python cryptography rejected this encoding. Cross-verification using SPKI public keys worked. The experiment instead exchanges ML-DSA's 32-byte seed through native `raw-seed` (Node) and `from_seed_bytes` (Python) APIs, with an explicit `format` and canonical Base64 `value`. P-256 keeps PEM/PKCS#8. Public keys use PEM/SPKI in both languages. No hand-written key conversion or cryptographic primitive is introduced.

The seed is a private key, not a harmless identifier. Operational test keys are mode-0600 temporary local files removed with all test effects after each scenario. Production key encryption, KMS/HSM support, rotation and revocation are outside this prototype. Loading a raw seed expands the key; the benchmark includes that cost on every signature to reflect this implementation.

## Preserved limits

Authorization action/policy digests, definition digests, receipt digests and related comparison rules remain SHA-256 to isolate the signature change. SHA-384 protects the new signed-message identifier and public-key fingerprints. Therefore this experiment establishes interoperability and measured behavior for post-quantum signatures, not uniform ML-DSA security-category strength for the entire execution system.

The gate still distinguishes policy decision, eligibility, outcome, retained authorization, and unsigned observed receipt. Local fsync acknowledgment is not replicated storage or proof of survival after hardware loss. Legacy records are not retroactively quantum-resistant. Transport encryption, third-party identity and the distribution supply chain are not covered by the signature experiment.
