export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Decision = "ALLOWED" | "DENIED";
export type Boundary = "evaluation" | "client-dispatch" | "server-handler";
export type EvidenceMask = number | string | string[] | null;
export interface Policy {
  policyVersion: string;
  defaultScope: string;
  evidenceBits: Record<string, number>;
  scopes: Record<string, { intents: Record<string, number>; allowUnknownIntents?: boolean; defaultRequiredMask?: number }>;
}
export interface ProofBundleV2 {
  kind: "vella_proof_bundle_v2";
  payload_type: "application/vnd.vella.authorization.v2+json";
  payload: string;
  signature_alg: "ecdsa-p256-sha256";
  signature: string;
  key_id: string;
  payload_hash: string;
}
export interface AuthorizationRecord {
  envelope_id: string; request_id: string; intent: string | null; authority_scope: string;
  policy_version: string; requested_policy_version: string | null; policy_digest: string;
  evidence_mask: number | null; decision: Decision; reason_code: string; timestamp: string;
  action: JsonObject | null; action_digest: string | null; evidence: JsonObject | null;
  boundary: Boundary; build_hash: string | null; external_effects: false;
}
export type VerificationResult =
  | { ok: true; format: "v2"; errors: string[]; warnings: string[]; authenticated: AuthorizationRecord; computed: { payload_hash: string; key_id: string } }
  | { ok: false; format: "v2"; errors: string[]; warnings: string[] };
export interface GovernInput {
  intent?: string | null; evidenceMask?: EvidenceMask; authorityScope?: string; policyVersion?: string;
  proof?: { signingKey: string }; action?: JsonObject | null; evidence?: JsonObject | null;
  requestId?: string; boundary?: Boundary; buildHash?: string | null;
}
export interface GovernResult { decision: Decision; reasonCode: string; latencyUs: number; proofBundle?: ProofBundleV2 | null; proofError?: string }
export interface Governor { readonly policyVersion: string; readonly policyDigest: string; govern(input?: GovernInput): GovernResult }
export const DEFAULT_POLICY: Readonly<Policy>;
export function govern(input?: GovernInput): GovernResult;
export function createGovernor(policy?: Policy): Governor;
export function createEvaluator(policy?: Policy): { readonly policyVersion: string; evaluate(input?: { intent_id?: string; intent?: string; evidence_mask?: EvidenceMask; authority_scope_id?: string; policy_version?: string }): { decision: Decision; reason_code: string } };
export function actionDigest(value: Json): string;
export function verifyProofV2(bundle: unknown, publicKey: string): VerificationResult;

export interface EffectiveAction extends JsonObject {
  server: string; tool: string; definition_digest: string;
  principal: JsonObject & { id: string }; resource: JsonObject & { id: string; version: string }; arguments: JsonObject;
}
export interface EvidenceBinding {
  requestId: string; attemptId: string; action: EffectiveAction; actionDigest: string;
  policyVersion: string; policyDigest: string; intent: string; authorityScope: string | null;
}
export interface ResolvedEvidence { mask: number; references: JsonObject }
export interface EvidenceProvider { resolve(binding: EvidenceBinding): ResolvedEvidence | Promise<ResolvedEvidence> }
export type Outcome = "not_started" | "reported_success" | "reported_failure" | "unknown";
export interface ExecutionReceipt {
  kind: "vella_execution_receipt_v1"; request_id: string; attempt_id: string; authorization_id: string | null;
  authorization_hash: string | null; action_digest: string | null; boundary: Boundary; decision: Decision | null;
  eligible: boolean; outcome: Outcome; reason: string; observed_at: string; signed: false;
}
export interface RetentionAck { durability: "file-and-directory-fsync"; path?: string }
export interface ProofSink {
  retainAuthorization(input: { attemptId: string; bundle: ProofBundleV2 }): Promise<RetentionAck & { payloadHash: string }>;
  retainReceipt(input: { attemptId: string; receipt: ExecutionReceipt }): Promise<RetentionAck & { receiptDigest: string }>;
}
export interface ExecutionContext { signal: AbortSignal; requestId: string; attemptId: string }
export interface ExecutionResult<T = unknown> {
  requestId: string; attemptId: string; decision: Decision | null; eligible: boolean; outcome: Outcome; reason: string;
  boundary: Boundary; authorizationRetained: boolean; receiptRetained: boolean; receipt: ExecutionReceipt;
  timings: Record<string, number>; value?: T;
}
export interface ExecutionGate {
  readonly policyVersion: string; readonly policyDigest: string;
  execute<T>(input: { action: EffectiveAction; intent: string; authorityScope?: string; requestId?: string; signal?: AbortSignal;
    precondition(action: EffectiveAction): boolean | Promise<boolean>;
    invoke(action: EffectiveAction, context: ExecutionContext): T | Promise<T> }): Promise<ExecutionResult<T>>;
}
export function createExecutionGate(options: {
  policy?: Policy; signingKey: string; publicKey: string; evidenceProvider: EvidenceProvider; proofSink: ProofSink;
  boundary?: "client-dispatch" | "server-handler"; buildHash?: string | null; timeoutMs?: number; governor?: Governor;
  observe?: (event: { attemptId: string; decision: Decision | null; outcome: Outcome; reason: string; timings: Readonly<Record<string, number>>; receiptRetained: boolean }) => void;
}): ExecutionGate;
export function createLocalProofSink(options: { directory: string }): ProofSink;
export function createOperatorEvidenceProvider(options: { loadState(): JsonObject | Promise<JsonObject>; now?: () => number }): EvidenceProvider;
