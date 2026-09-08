/** Opt-in v3 hybrid proofs. Importing this module never changes v2 defaults. */
import proof from './proof.cjs';
import record from './record.cjs';
export const SUITE = proof.SUITE;
export const signProofV3 = proof.sign;
export const verifyProofV3 = proof.verify;
export const generateHybridKeys = proof.generateKeys;
export const actionDigestV3 = record.digest;
export {HYBRID_PROFILE} from './profile.mjs';
export {openLocalKeyStore, recoverLocalKeyLock} from './local-keys.mjs';
export {retainVerificationMaterial} from './archive-material.mjs';
