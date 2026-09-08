/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { immutableJson } from "./execution.js";

/** Local reference provider: state must be controlled by the operator. */
export function createOperatorEvidenceProvider({ loadState, now = Date.now }) {
  if (typeof loadState !== "function") throw new TypeError("loadState is required");
  return Object.freeze({
    assertCurrent(_binding, evidence) {
      const time = now();
      const refs = evidence?.references;
      if (!Number.isFinite(time) || ![refs?.session_expires_at, refs?.permission_expires_at, refs?.approval_expires_at].every(expiry => Number.isSafeInteger(expiry) && expiry > time)) throw new Error("EVIDENCE_EXPIRED");
    },
    async resolve(binding) {
    const state = immutableJson(await loadState());
    const time = now();
    const session = state?.session;
    if (state?.approvals !== undefined && (state.approval !== undefined || !Array.isArray(state.approvals) || state.approvals.length > 64)) throw new Error("APPROVAL_REJECTED");
    const approvals = state?.approvals ?? [state?.approval];
    const matches = approvals.filter(a => a && a.principalId === binding.action.principal.id && a.actionDigest === binding.actionDigest && a.policyDigest === binding.policyDigest);
    const approval = matches.length === 1 ? matches[0] : null;
    const valid = record => record && record.revoked === false && Number.isSafeInteger(record.expiresAt) && record.expiresAt > time;
    if (!Number.isFinite(time) || !valid(session) || typeof session.id !== "string" || !session.id || session.principalId !== binding.action.principal.id) throw new Error("IDENTITY_REJECTED");
    const permission = Array.isArray(state.permissions) && state.permissions.find(p => typeof p.id === "string" && p.id.length > 0 && p.principalId === session.principalId && p.server === binding.action.server && p.tool === binding.action.tool && p.resourceId === binding.action.resource.id && p.revoked === false && Number.isSafeInteger(p.expiresAt) && p.expiresAt > time);
    if (!permission || !valid(approval) || typeof approval.id !== "string" || !approval.id || approval.principalId !== session.principalId || approval.actionDigest !== binding.actionDigest || approval.policyDigest !== binding.policyDigest) throw new Error("APPROVAL_REJECTED");
    return { mask: 15, references: { provider: "local-operator-v1", session_id: session.id, approval_id: approval.id, permission_id: permission.id, permission_expires_at: permission.expiresAt,
      principal_id: session.principalId, action_digest: binding.actionDigest, policy_digest: binding.policyDigest,
      session_expires_at: session.expiresAt, approval_expires_at: approval.expiresAt } };
  } });
}
