# Migrating to v2 proofs — release preparation

These changes are unreleased. Package metadata still identifies the existing release baseline, 1.0.3; that published version does not contain this implementation. Do not publish these changes under that version or move an existing release tag.

The owner approved a new exact-byte envelope with separate legacy verification. The development SDK's high-level `govern` now emits `vella_proof_bundle_v2` when signing succeeds. This changes proof output and therefore requires a major release under the repository's compatibility policy. The public release version, announcement and rollout date remain pending. The existing ICD's notice commitment remains in effect.

## Application changes

1. Upgrade consumers before producers. Use a v2-aware verifier; select a trusted public key outside the record.
2. Read the authenticated record returned by the new verifier. V2 moves decision fields into the Base64 payload; do not treat unverified decoded content as authoritative.
3. Pass the effective `action`, evidence references, request identifier and available build identity to a policy-bound governor. The embedded SDK still does not validate the truth of evidence, retain proofs or execute actions.
4. A policy `ALLOWED` result can still accompany `proofBundle: null` / `proof_bundle: None` when optional signing fails. Mandatory-proof integrations must stop before execution unless signing and the required retention acknowledgment succeed.
5. Test all required evidence inputs and custom policies. Invalid masks, non-text identifiers and policy-name collisions that previously coerced or overwrote values now reject. Both SDKs use the same explicitly defined whitespace set. See [input validation](../../spec/input-validation.md).

New APIs are `createGovernor(policy)` in Node and `create_governor(policy)` in Python. They snapshot the policy, expose its version/digest and offer evaluation with optional signing. Existing `createEvaluator` / `create_evaluator` remain evaluation-only. Construct a new governor to activate a new policy; no global policy reload is introduced.

## Retained legacy records

V1 records retain their original bytes and format. Existing v1 hashing/signing procedures remain in separate legacy helpers and verifier branches. Historical flat test vectors still have their expected outcomes. No historical proof is silently reissued or upgraded.

V1 does not authenticate every visible field. Metadata including `kind`, `exported_at` and `key_id` was excluded from the signed envelope; algorithm labels were outside that signature. Key-ID checks do not make a field signed. Node's v1 serializer also omitted many nested keys; Python's v1 JSON representation differed for nested values, Unicode and some numbers. An old proof may verify in one implementation and fail another. A success only establishes that verifier's historical claim.

The format dispatcher now rejects unknown formats and routes v2-looking records exclusively to v2 verification. Direct legacy helpers retain historical hash rules for explicit archival interpretation. Legacy verification emits a limitation warning. Do not use v1 proofs to establish exact MCP action binding, transferable permission or execution success.

A rollback can restore the prior application/package version, but retained v2 records still require a v2-capable verifier. Keep both verifier paths available during migration. Release packages, immutable pins and end-to-end rollback procedures are part of the later release milestone.

## Running repository verifiers

Keep the repository directory layout intact. Node v2 verification loads `sdk/node/proof-v2.cjs`. Python v2 verification requires the SDK's Python modules, `cryptography` and `rfc8785`. The shell v2 verifier additionally requires Python and calls the Python structural helper, while checking the signature with OpenSSL. Set `VELLA_VERIFY_PYTHON` to select that Python interpreter.

Portable installed verification entry points and the supported-runtime package matrix remain part of the distribution milestone; copying a single verifier script is not sufficient for v2.
