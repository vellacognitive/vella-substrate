# VELLA Standalone Verifiers

These verifiers validate VELLA proof bundles independently of the SDK.

## What verification proves

A passing verification confirms:
- Envelope canonical hash matches bundle contents
- ECDSA P-256 signature over `envelope_hash` is valid for the supplied public key
- Bundle integrity hash (`sha256_bundle`) matches signed fields
- `key_id` (if present) matches the supplied public key

## What verification does not prove

- Whether the policy itself was correct
- Whether caller-side enforcement was bypassed after decision issuance
- Whether a decision should have been requested in the first place

## Usage

```bash
node verify/verify.js test-vectors/valid/allowed-decision-v1.json examples/example-signing.pub
python verify/verify.py test-vectors/valid/allowed-decision-v1.json examples/example-signing.pub
bash verify/verify.sh test-vectors/valid/allowed-decision-v1.json examples/example-signing.pub
```
