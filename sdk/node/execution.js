/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { randomUUID } from "node:crypto";
import { createGovernor } from "./governor.js";
import proofV2 from "./proof-v2.cjs";
import { snapshotProofProfile } from "./proof-profile.js";

export function immutableJson(value) {
  proofV2.assertJson(value);
  const copy = JSON.parse(JSON.stringify(value));
  function freeze(item) {
    if (item && typeof item === "object") { for (const child of Object.values(item)) freeze(child); Object.freeze(item); }
    return item;
  }
  return freeze(copy);
}

function interrupted(signal) { if (signal?.aborted) throw new Error("CANCELLED"); }
function guardedCall(call, signal) {
  interrupted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("CANCELLED"));
    signal?.addEventListener("abort", abort, { once: true });
    let pending;
    try { interrupted(signal); pending = call(); }
    catch (error) { signal?.removeEventListener("abort", abort); reject(error); return; }
    Promise.resolve(pending).then(resolve, reject).finally(() => signal?.removeEventListener("abort", abort));
  });
}

/** Mandatory-proof gate. Dependencies and prepared action are operator-owned. */
export function createExecutionGate({ policy, signingKey, publicKey, keyProvider, proofProfile, evidenceProvider, proofSink, boundary = "server-handler", buildHash = null, timeoutMs = 30000, observe, governor }) {
  const profile = snapshotProofProfile(proofProfile);
  governor ??= createGovernor(policy, { proofProfile: profile });
  if (proofSink?.proofProfileId !== undefined && proofSink.proofProfileId !== profile.id) throw new TypeError("proof sink profile mismatch");
  if ((keyProvider ? typeof keyProvider.capture !== "function" : !signingKey || !publicKey) || typeof evidenceProvider?.resolve !== "function" || typeof proofSink?.retainAuthorization !== "function" || typeof proofSink?.retainReceipt !== "function") throw new TypeError("signing, trusted evidence and retention dependencies are required");
  if (!["server-handler", "client-dispatch"].includes(boundary)) throw new TypeError("invalid execution boundary");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new TypeError("timeoutMs must be 1..300000");
  const policyVersion = governor.policyVersion;
  const policyDigest = governor.policyDigest;
  if (typeof policyVersion !== "string" || !profile.isDigest(policyDigest) || (governor.proofProfileId !== undefined && governor.proofProfileId !== profile.id)) throw new TypeError("invalid governor identity");

  return Object.freeze({ policyVersion, policyDigest, proofProfileId: profile.id, actionDigest: profile.digest, async execute({ action: inputAction, intent, authorityScope, requestId: suppliedRequestId = randomUUID(), signal: callerSignal, precondition, invoke }) {
    const attemptStart = performance.now();
    const requestId = typeof suppliedRequestId === "string" && suppliedRequestId && Buffer.byteLength(suppliedRequestId) <= 1024 ? suppliedRequestId : randomUUID();
    const attemptId = randomUUID();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    if (callerSignal?.aborted) controller.abort();
    const timer = setTimeout(onAbort, timeoutMs);
    const signal = controller.signal;
    const timings = {};
    let action, digest, proof, authorizationId, keySession, eligibility = false, started = false;
    let decision = null, reason = "INVALID_ACTION", outcome = "not_started", value;
    let retainedAuthorization = false, retainedReceipt = false;
    const emit = (event) => { try { observe?.(Object.freeze(event)); } catch { /* Telemetry must not alter enforcement. */ } };
    const stage = async (name, call) => {
      const start = performance.now();
      try { return await guardedCall(call, signal); }
      finally { timings[name] = performance.now() - start; }
    };
    try {
      interrupted(signal);
      if (requestId !== suppliedRequestId || typeof invoke !== "function" || typeof precondition !== "function" || typeof intent !== "string" || !intent || typeof requestId !== "string" || !requestId || Buffer.byteLength(requestId) > 1024) throw new Error("INVALID_ACTION");
      profile.assertJson(inputAction);
      action = immutableJson(inputAction);
      if (!action || Array.isArray(action) || typeof action !== "object" || Object.keys(action).length !== 6 || !["server", "tool", "definition_digest", "principal", "resource", "arguments"].every(k => Object.hasOwn(action, k))) throw new Error("INVALID_ACTION");
      if (![action.server, action.tool, action.principal?.id, action.resource?.id, action.resource?.version].every(v => typeof v === "string" && v.length > 0 && Buffer.byteLength(v) <= 1024) || !profile.isDigest(action.definition_digest) || !action.arguments || Array.isArray(action.arguments) || typeof action.arguments !== "object") throw new Error("INVALID_ACTION");
      digest = profile.digest(action);
      const binding = immutableJson({ requestId, attemptId, action, actionDigest: digest, policyVersion, policyDigest, intent, authorityScope: authorityScope ?? null });
      reason = "EVIDENCE_UNAVAILABLE";
      const evidence = immutableJson(await stage("evidence", () => evidenceProvider.resolve(binding)));
      if (!evidence || Object.keys(evidence).length !== 2 || !Number.isInteger(evidence.mask) || evidence.mask < 0 || evidence.mask > 0xffffffff || !evidence.references || typeof evidence.references !== "object" || Array.isArray(evidence.references)) throw new Error("EVIDENCE_UNAVAILABLE");
      try { keySession = keyProvider ? keyProvider.capture() : { signingKey, publicKey }; }
      catch { keySession = null; }
      const proofEvidence = { ...evidence.references, attempt_id: attemptId, ...(keySession?.audit === undefined ? {} : { signing_key: immutableJson(keySession.audit) }) };
      reason = "EVALUATION_UNAVAILABLE";
      const start = performance.now();
      const result = governor.govern({ intent, authorityScope, evidenceMask: evidence.mask, requestId, action,
        evidence: proofEvidence, boundary, buildHash, proof: { signingKey: keySession?.signingKey ?? {} } });
      const governMs = performance.now() - start;
      timings.evaluate = Number.isFinite(result?.latencyUs) ? result.latencyUs / 1000 : governMs;
      timings.prepare_and_sign = Math.max(0, governMs - timings.evaluate);
      if (!["ALLOWED", "DENIED"].includes(result?.decision)) throw new Error("EVALUATION_UNAVAILABLE");
      decision = result.decision;
      reason = result.reasonCode;
      if (decision !== "ALLOWED") throw new Error("POLICY_DENIED");
      reason = "SIGNING_UNAVAILABLE";
      if (!keySession?.signingKey || !keySession?.publicKey || (keyProvider && typeof keySession.assertCurrent !== "function")) throw new Error("SIGNING_UNAVAILABLE");
      proof = immutableJson(result.proofBundle);
      const verifyStart = performance.now();
      const verification = profile.verify(proof, keySession.publicKey);
      timings.verify = performance.now() - verifyStart;
      const authenticated = verification.authenticated;
      if (!verification.ok || authenticated.action_digest !== digest || authenticated.request_id !== requestId || authenticated.policy_digest !== policyDigest || authenticated.decision !== "ALLOWED" || authenticated.evidence?.attempt_id !== attemptId || authenticated.boundary !== boundary || authenticated.intent !== intent.trim().toUpperCase() || (authorityScope !== undefined && authenticated.authority_scope !== authorityScope) || authenticated.policy_version !== policyVersion || authenticated.evidence_mask !== evidence.mask || profile.digest(authenticated.evidence) !== profile.digest(proofEvidence)) throw new Error("SIGNING_UNAVAILABLE");
      authorizationId = authenticated.envelope_id;
      reason = "RETENTION_UNAVAILABLE";
      const ack = await stage("retain_authorization", () => proofSink.retainAuthorization({ attemptId, bundle: proof }));
      if (ack?.payloadHash !== proof.payload_hash || ack?.durability !== "file-and-directory-fsync") throw new Error("RETENTION_UNAVAILABLE");
      retainedAuthorization = true;
      reason = "EVIDENCE_CHANGED";
      const currentEvidence = immutableJson(await stage("revalidate_evidence", () => evidenceProvider.resolve(binding)));
      if (profile.digest(currentEvidence) !== profile.digest(evidence)) throw new Error("EVIDENCE_CHANGED");
      reason = "PRECONDITION_FAILED";
      if (await stage("precondition", () => precondition(action)) !== true) throw new Error("PRECONDITION_FAILED");
      interrupted(signal);
      reason = "RESULT_UNAVAILABLE";
      value = await stage("invoke", () => {
        interrupted(signal);
        reason = "EVIDENCE_CHANGED";
        const evidenceCheck = evidenceProvider.assertCurrent?.(binding, evidence);
        if (evidenceCheck !== undefined && evidenceCheck !== true) {
          if (typeof evidenceCheck?.then === "function") Promise.resolve(evidenceCheck).catch(() => {});
          throw new Error("synchronous evidence validity check required");
        }
        reason = "KEYS_CHANGED";
        const keyCheck = keySession.assertCurrent?.();
        if (keyCheck !== undefined && keyCheck !== true) {
          if (typeof keyCheck?.then === "function") Promise.resolve(keyCheck).catch(() => {});
          throw new Error("synchronous key validity check required");
        }
        // No await between the final trust check and dispatch.
        eligibility = true; started = true; reason = "RESULT_UNAVAILABLE";
        timings.until_dispatch = performance.now() - attemptStart;
        return invoke(action, { signal, requestId, attemptId });
      });
      outcome = value?.isError === true ? "reported_failure" : "reported_success";
      reason = outcome === "reported_failure" ? "HANDLER_REPORTED_FAILURE" : "COMPLETED";
    } catch {
      if (started) { outcome = "unknown"; value = undefined; reason = signal.aborted ? "CANCELLED_AFTER_DISPATCH" : "RESULT_UNAVAILABLE"; }
      else if (signal.aborted) reason = "CANCELLED_BEFORE_DISPATCH";
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    }
    const receipt = immutableJson({ kind: profile.receiptKind, request_id: requestId, attempt_id: attemptId,
      authorization_id: authorizationId ?? null, authorization_hash: retainedAuthorization ? proof.payload_hash : null,
      action_digest: digest ?? null, boundary, decision, eligible: eligibility, outcome, reason,
      observed_at: new Date().toISOString(), signed: false });
    if (retainedAuthorization) {
      const start = performance.now();
      // A separate bounded attempt records even cancellation/timeout outcomes.
      const receiptController = new AbortController();
      const receiptTimer = setTimeout(() => receiptController.abort(), Math.min(timeoutMs, 5000));
      try {
        const ack = await guardedCall(() => proofSink.retainReceipt({ attemptId, receipt }), receiptController.signal);
        retainedReceipt = ack?.receiptDigest === profile.digest(receipt) && ack?.durability === "file-and-directory-fsync";
      } catch { /* Observed outcome survives a receipt-retention failure. */ }
      finally { clearTimeout(receiptTimer); timings.retain_receipt = performance.now() - start; }
    }
    timings.total = performance.now() - attemptStart;
    const result = { requestId, attemptId, decision, eligible: eligibility, outcome, reason, boundary,
      authorizationRetained: retainedAuthorization, receiptRetained: retainedReceipt, receipt, timings,
      ...(value === undefined ? {} : { value }) };
    emit({ attemptId, decision, outcome, reason, timings: Object.freeze({ ...timings }), receiptRetained: retainedReceipt });
    return result;
  } });
}
