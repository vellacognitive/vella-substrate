# Opt-in v3 hybrid proofs — SDK 2.1.0

Target runtime: Node 24.20+ within 24.x on Linux/macOS. Native ML-DSA support is required; unsupported runtimes reject the hybrid operation. Default SDK imports and v2 behavior retain their existing runtime requirements.

```js
import {createGovernor} from '@vellacognitive/vella-sdk';
import {HYBRID_PROFILE, openLocalKeyStore} from '@vellacognitive/vella-sdk/pqc/index.js';

// Run as the operator, outside any agent-accessible tool.
const keys = await openLocalKeyStore({directory: './operator-keys', initialize: true});
try {
  if (keys.status().activeId === null) await keys.rotate();
  const governor = createGovernor(undefined, {proofProfile: HYBRID_PROFILE});
  const result = governor.govern({intent: 'EXECUTE_CHANGE', evidenceMask: 1,
    proof: {signingKey: keys.capture().signingKey}});
  // An evaluation proof alone does not authorize an external effect.
  console.log(result.decision, result.proofBundle?.kind);
} finally { keys.close(); }
```

Use the same `HYBRID_PROFILE` in the governor, execution gate and local proof sink. Supply the key store as the gate's `keyProvider`. Every authorization requires both P-256 and ML-DSA-65 signatures. Key generation, direct signing and direct verification require the explicit suite argument `p256+ml-dsa-65`; independently supply trusted public keys. Envelope metadata cannot choose or weaken the operator's profile.

Public APIs are exported from `pqc/index.js` with matching TypeScript declarations. Other files in this directory are implementation details except the packaged `vella-verify-v3` command:

```sh
vella-verify-v3 proof.json public-trust.json KEY_SET_ID p256+ml-dsa-65
```

The public trust registry comes from `keys.status()` or retained `verification-material/public-trust.REVISION.json`. It must be operator-owned and not group/world writable. Successful historical verification reports the supplied trust snapshot; it never grants new execution authority or proves a pre-compromise signing time.

Local custody is a single cooperating writer on a POSIX filesystem: directory mode 0700, state and lock mode 0600, plaintext private material protected by OS ownership. Rotation and revocation flush file and directories before publishing the revision. Stop the reference server before a separate process changes keys. A stale lock requires `recoverLocalKeyLock({directory, expectedPid, expectedRevision, confirmStopped: true})`; live writers cannot be displaced. Keep public keys, policy artifacts and proofs after rotation. Do not restore an old key state as rollback.

Operate with annual key rotation/security review and seven-year proof retention. These are operator targets, not a security lifetime, timestamp, backup, encryption-at-rest or host-compromise guarantee. Review the repository's frozen `spec/pqc/PROOF-CONTRACT.md` and migration runbook before adoption. Candidate workload/platform qualification is recorded separately in `spec/pqc/ACCEPTANCE.md`.
