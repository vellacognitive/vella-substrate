import type {AuthorizationRecord, Json, JsonObject, KeyProvider, KeySession, Policy, ProofProfile} from '../index.js';
export type HybridSuite = 'p256+ml-dsa-65';
export const SUITE: HybridSuite;
export interface HybridPublicKeys { 'ecdsa-p256-sha256': string; 'ml-dsa-65': string }
export interface HybridPrivateKeys { 'ecdsa-p256-sha256': string; 'ml-dsa-65': {format: 'raw-seed'; value: string} }
export interface HybridKeyPair {privateKeys: HybridPrivateKeys; publicKeys: HybridPublicKeys}
export interface AuthorizationRecordV3 extends AuthorizationRecord {digest_profile: 'sha384-jcs-v1'}
export interface ProofBundleV3 {
  kind: 'vella_proof_bundle_v3'; payload_type: 'application/vnd.vella.authorization.v3+json';
  suite: HybridSuite; digest_profile: 'sha384-jcs-v1'; payload: string;
  keys: HybridPublicKeys; signatures: HybridPublicKeys; payload_hash: string;
}
export type VerificationResultV3 =
  | {ok: true; format: 'vella_proof_bundle_v3'; suite: HybridSuite; authenticated: AuthorizationRecordV3; errors: string[]; warnings: string[]}
  | {ok: false; format: 'vella_proof_bundle_v3'; errors: string[]; warnings: string[]};
export const HYBRID_PROFILE: Readonly<ProofProfile>;
export function generateHybridKeys(suite: HybridSuite): HybridKeyPair;
export function signProofV3(record: AuthorizationRecordV3, privateKeys: HybridPrivateKeys, suite: HybridSuite): ProofBundleV3;
export function verifyProofV3(bundle: unknown, publicKeys: HybridPublicKeys, suite: HybridSuite): VerificationResultV3;
export function actionDigestV3(value: Json): string;
export interface KeyHistoryEntry {
  readonly id: string; readonly publicKeys: Readonly<HybridPublicKeys>; readonly keyIds: Readonly<HybridPublicKeys>;
  readonly activatedAt: number; readonly notAfter: number; readonly retentionTargetUntil: number;
  readonly status: 'active' | 'retired' | 'revoked'; readonly changedAt: number;
}
export interface PublicKeyRegistry {
  readonly kind: 'vella_local_hybrid_keys_v1'; readonly revision: number; readonly activeId: string | null;
  readonly history: readonly KeyHistoryEntry[];
}
export interface HybridKeySession extends KeySession {
  readonly revision: number; readonly keySetId: string;
  readonly signingKey: {sign(record: AuthorizationRecordV3): ProofBundleV3};
  readonly publicKey: {verify(bundle: unknown): VerificationResultV3};
}
export interface LocalHybridKeyStore extends KeyProvider {
  status(): PublicKeyRegistry;
  rotate(options?: {keys?: HybridKeyPair}): Promise<PublicKeyRegistry>;
  revoke(id: string): Promise<PublicKeyRegistry>;
  capture(): HybridKeySession;
  verifyHistorical(bundle: unknown, options: {keySetId: string; policy: 'report-current-trust-state'}):
    {ok: boolean; authenticated?: AuthorizationRecordV3; keyStatus?: 'active' | 'expired' | 'retired' | 'revoked'; trustedForNewExecution?: false; errors: string[]; warnings: string[]};
  close(): void;
}
export function openLocalKeyStore(options: {directory: string; initialize?: boolean; now?: () => number}): Promise<LocalHybridKeyStore>;
export function recoverLocalKeyLock(options: {directory: string; expectedPid: number; expectedRevision: number; confirmStopped: true}): Promise<void>;
export function retainVerificationMaterial(options: {directory: string; policy: Policy | JsonObject; keyStore: LocalHybridKeyStore; profile: ProofProfile}): Promise<unknown>;
