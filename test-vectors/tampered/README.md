# Tampered Vectors

- `tampered-signature.json`
  - Signature base64 mutated after signing; signature verification must fail
- `tampered-envelope-field.json`
  - Envelope field (`reason_code`) changed after signing; envelope hash check must fail
- `tampered-bundle-hash.json`
  - `sha256_bundle` overwritten; bundle integrity hash check must fail
