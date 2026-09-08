# Owner contract review — accepted by Mike Wilson

Status: accepted and authorized by Mike Wilson on 2026-09-08. This is the SOW's M1 contract review. Mike is the selected reviewer and acceptance owner; this record will describe owner review, not external specialist certification. Full release acceptance and publication are later decisions.

## What the build now does

Both SDK governors can use an explicitly configured proof provider. Their default remains v2. The hybrid provider signs one exact authorization payload with both P-256 and ML-DSA-65; both signatures and the configured trusted key pair are mandatory. SHA-384 connects the effective action, policy, tool definition, authorization and receipt references.

The controlled local MCP server exercises both existing report routes. A required signing, evidence or authorization-storage failure prevents execution. A receipt-storage failure after execution is reported as a storage failure without pretending the action did not happen. Evidence expiry and key changes are checked synchronously after the last awaited precondition and before dispatch.

## Key and retention behavior

New active signing keys expire after one calendar year. Rotation retains public-key history and removes retired private keys from the current on-disk state. Revocation persists across restart and invalidates pending attempts. A process cannot silently continue with old keys after an uncertain rotation write. Cooperating processes cannot open the key store concurrently; a stale writer lock requires explicit crash recovery.

The private file uses OS ownership and mode-0600 protection in a mode-0700 directory. Its private-key values are plaintext; this build does not promise encrypted custody, secure deletion of old filesystem blocks, or managed-runtime memory zeroization. Host/administrator compromise and restoration of an old complete filesystem remain outside the guarantee.

Keep each proof and its verification material for seven years after creation. Key history covers at least seven years after that key's last permitted signing date. The reference retains public trust snapshots and policy artifacts separately from private keys. There is no automatic deletion, seven-year security guarantee, trusted timestamp service, or proof that a record predates compromise. Annual security review and key rotation are the accepted operating policy.

## Approved public format freeze

The reviewed implementation retained draft identifiers. Approval authorizes the following final identifiers:

| Element | Final identifier / rule |
|---|---|
| Authorization envelope | `vella_proof_bundle_v3` |
| Authorization media type | `application/vnd.vella.authorization.v3+json` |
| Signature-policy media type | `application/vnd.vella.signature-policy.v3+json` |
| Required suite | `p256+ml-dsa-65`; neither component is optional |
| Digest profile | `sha384-jcs-v1` |
| Execution receipt | `vella_execution_receipt_v2`; unsigned observation, with SHA-384 references |
| Signing bytes and interpretation | Exact contract in `PROOF-CONTRACT-DRAFT.md`, replacing its draft identifiers with the values above |
| Adoption | Opt-in; existing v1/v2 proof verification remains separate and unchanged in meaning |

Changing these identifiers changes the signed bytes. Final vectors, migration tests and performance measurements must be regenerated after the change. The first stable release will not accept the private draft format as an alias for v3.

## Review record to complete

Review the format/claim boundary, portable local key handling, revocation/rollback semantics and the evidence in `ACCEPTANCE.md`. Record **accepted**, **changes requested**, or **not assessed** for the contract. Include any specific concern or requested change. Acceptance does not certify the cryptographic primitives or close the remaining resource, platform, packaging or rollout requirements.

Known work still ahead: move the reviewed hybrid modules into supported package entry points, finalize package versions/dependencies, qualify all public verifier routes and installed artifacts, run the matched sustained tests and 30-minute soak/resource plan, complete the hosted platform matrix, and deliver migration/rollback and release evidence.

## Completed review record

Mike Wilson: **accepted**. User instruction: “Reviewed and authorized.” Recorded 2026-09-08. M1 is closed; continuation through the remaining SOW work is authorized. The review is owner acceptance, not external specialist certification. Candidate release acceptance and package publication remain separate.
