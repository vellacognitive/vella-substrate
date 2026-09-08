# Independent protocol review brief

Prepared for reviewer selection; not sent externally. Owner and reviewer must agree access, confidentiality, fees, and timing. This is not a request to approve a released product.

## Decision requested at M1

Determine whether the proposed typed P-256 + ML-DSA-65 authorization envelope, digest profile, trust policy, and key-lifecycle design are suitable to freeze as a public contract. Recommend necessary changes before SDK/provider and MCP integration are finalized. A later review must examine that integrated implementation before release acceptance.

Read `PROOF-CONTRACT-DRAFT.md`, `THREAT-AND-HASH-MAP.md`, `IMPLEMENTATION.md`, both schemas, and the private implementation in `integrations/pqc-production/`. The public vectors contain public keys and signed synthetic records only. No operator private key or real report is needed.

## Review questions

1. Does requiring both signatures over the same exact typed message and protected key/suite descriptor achieve the intended composition property under the selected trust assumptions? Examine chosen-message, substitution, cross-protocol and downgrade cases; do not treat test success as a cryptographic argument.
2. Should Vella adopt an existing composite-signature construction instead? Compare the actual message representative and encoding, not just the component algorithm names. Check current FIPS 204 potential errata against selected provider versions.
3. Do SHA-384 canonical action/policy/definition bindings and the new proof identifiers support the proposed claim? Identify any external reference or retained legacy hash that narrows it. Evidence lifetime remains an owner input.
4. Are payload semantics, exact bytes, Unicode/numeric handling, duplicate-key rules, byte/depth/node limits and object-API constraints adequate? Review positive controls for adversarial signed-record fixtures.
5. Is local portable seed custody appropriate for the selected deployment? Evaluate directory/file ownership, symlink handling, permissions, atomic activation, key-pair consistency, backup, exposure and compromise handling. At-rest encryption and external services are not implemented by the seed interchange format.
6. Is the proposed single-process immutable trust revision plus synchronous final validity check sufficient for the stated rotation/revocation boundary? Identify remaining clock, process and filesystem assumptions.
7. Are archival trust results, rollback, and the absence of a trusted signing timestamp described honestly? Ensure old proofs cannot be used as new permission tokens.

## Proposed key/trust state contract for review

One operator-controlled manifest identifies a revision, fixed hybrid suite, digest profile, active key-set ID, activation/expiration times, and the two public-key fingerprints. The private file holds one complete key pair using the reviewed interchange format. Private files are created exclusively with mode 0600 under an operator-owned mode-0700 directory. The implementation must validate actual file ownership/mode/type and bounded content before importing; parent-path integrity is an operator assumption.

Activation validates that each private key derives its configured public key, both signatures work, and the revision is valid. Only then atomically replace the process's immutable active snapshot. Revisions cannot be reused in that process, and a revoked revision cannot be reactivated. Persist operator state before acknowledging activation so a restart cannot silently revive an old key set; define restart reconciliation and test interruption points. Cross-process atomic rotation is not promised.

Each call captures a complete key/trust revision. After awaited evidence, proof retention and action precondition checks, validate that the revision is still active and unexpired immediately before the synchronous dispatch call. A change stops that attempt; it does not rewrite its retained authorization or trigger an automatic retry. Calls already dispatched before a revocation cannot be undone. The chosen clock and source of truth must be identified.

Historical verification receives an explicit archival trust policy, separate from permission to execute now. Retired/revoked-key handling is reported with the applied policy. No private key needs to be retained merely to verify old public signatures. Backup/restore must not roll the active trust registry backward unnoticed; without an external monotonic anchor, operator restoration of an old complete filesystem remains outside the guarantee.

## Expected reviewer output

An attributable report tied to an immutable source/package manifest, findings with concrete failure paths and severity, requested contract changes, and a disposition on the stated scope. Track each fix and retest. No unresolved issue permitting signature substitution, downgrade, unauthorized dispatch, or an invalid security claim may be closed as an accepted production pass. The report must state which cryptographic, implementation, custody and platform questions it did not assess.

The implementation author cannot self-sign this independent-review requirement. No reviewer has been appointed and no independent approval is claimed.
