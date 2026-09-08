/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { randomUUID } from "node:crypto";
import { createGovernor } from "./governor.js";
import proofV2 from "./proof-v2.cjs";

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
export function createExecutionGate({ policy, signingKey, publicKey, evidenceProvider, proofSink, boundary = "server-handler", buildHash = null, timeoutMs = 30000, observe, governor = createGovernor(policy) }) {
  if (!signingKey || !publicKey || typeof evidenceProvider?.resolve !== "function" || typeof proofSink?.retainAuthorization !== "function" || typeof proofSink?.retainReceipt !== "function") throw new TypeError("signing, trusted evidence and retention dependencies are required");
  if (!["server-handler", "client-dispatch"].includes(boundary)) throw new TypeError("invalid execution boundary");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new TypeError("timeoutMs must be 1..300000");
  const policyVersion = governor.policyVersion;
  const policyDigest = governor.policyDigest;
  if (typeof policyVersion !== "string" || !/^sha256:[0-9a-f]{64}$/.test(policyDigest)) throw new TypeError("invalid governor identity");

  return Object.freeze({ policyVersion, policyDigest, async execute({ action: inputAction, intent, authorityScope, requestId: suppliedRequestId = randomUUID(), signal: callerSignal, precondition, invoke }) {
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
    let action, digest, proof, authorizationId, eligibility = false, started = false;
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
      action = immutableJson(inputAction);
      if (!action || Array.isArray(action) || typeof action !== "object" || Object.keys(action).length !== 6 || !["server", "tool", "definition_digest", "principal", "resource", "arguments"].every(k => Object.hasOwn(action, k))) throw new Error("INVALID_ACTION");
      if (![action.server, action.tool, action.principal?.id, action.resource?.id, action.resource?.version].every(v => typeof v === "string" && v.length > 0 && Buffer.byteLength(v) <= 1024) || !/^sha256:[0-9a-f]{64}$/.test(action.definition_digest) || !action.arguments || Array.isArray(action.arguments) || typeof action.arguments !== "object") throw new Error("INVALID_ACTION");
      digest = proofV2.digest(action);
      const binding = immutableJson({ requestId, attemptId, action, actionDigest: digest, policyVersion, policyDigest, intent, authorityScope: authorityScope ?? null });
      reason = "EVIDENCE_UNAVAILABLE";
      const evidence = immutableJson(await stage("evidence", () => evidenceProvider.resolve(binding)));
      if (!evidence || Object.keys(evidence).length !== 2 || !Number.isInteger(evidence.mask) || evidence.mask < 0 || evidence.mask > 0xffffffff || !evidence.references || typeof evidence.references !== "object" || Array.isArray(evidence.references)) throw new Error("EVIDENCE_UNAVAILABLE");
      reason = "EVALUATION_UNAVAILABLE";
      const start = performance.now();
      const result = governor.govern({ intent, authorityScope, evidenceMask: evidence.mask, requestId, action,
        evidence: { ...evidence.references, attempt_id: attemptId }, boundary, buildHash, proof: { signingKey } });
      const governMs = performance.now() - start;
      timings.evaluate = Number.isFinite(result?.latencyUs) ? result.latencyUs / 1000 : governMs;
      timings.prepare_and_sign = Math.max(0, governMs - timings.evaluate);
      if (!["ALLOWED", "DENIED"].includes(result?.decision)) throw new Error("EVALUATION_UNAVAILABLE");
      decision = result.decision;
      reason = result.reasonCode;
      if (decision !== "ALLOWED") throw new Error("POLICY_DENIED");
      reason = "SIGNING_UNAVAILABLE";
      proof = immutableJson(result.proofBundle);
      const verifyStart = performance.now();
      const verification = proofV2.verifyV2(proof, publicKey);
      timings.verify = performance.now() - verifyStart;
      const authenticated = verification.authenticated;
      if (!verification.ok || authenticated.action_digest !== digest || authenticated.request_id !== requestId || authenticated.policy_digest !== policyDigest || authenticated.decision !== "ALLOWED" || authenticated.evidence?.attempt_id !== attemptId || authenticated.boundary !== boundary || authenticated.intent !== intent.trim().toUpperCase() || (authorityScope !== undefined && authenticated.authority_scope !== authorityScope) || authenticated.policy_version !== policyVersion || authenticated.evidence_mask !== evidence.mask || proofV2.digest(authenticated.evidence) !== proofV2.digest({ ...evidence.references, attempt_id: attemptId })) throw new Error("SIGNING_UNAVAILABLE");
      authorizationId = authenticated.envelope_id;
      reason = "RETENTION_UNAVAILABLE";
      const ack = await stage("retain_authorization", () => proofSink.retainAuthorization({ attemptId, bundle: proof }));
      if (ack?.payloadHash !== proof.payload_hash || ack?.durability !== "file-and-directory-fsync") throw new Error("RETENTION_UNAVAILABLE");
      retainedAuthorization = true;
      reason = "EVIDENCE_CHANGED";
      const currentEvidence = immutableJson(await stage("revalidate_evidence", () => evidenceProvider.resolve(binding)));
      if (proofV2.digest(currentEvidence) !== proofV2.digest(evidence)) throw new Error("EVIDENCE_CHANGED");
      reason = "PRECONDITION_FAILED";
      if (await stage("precondition", () => precondition(action)) !== true) throw new Error("PRECONDITION_FAILED");
      interrupted(signal);
      eligibility = true;
      reason = "RESULT_UNAVAILABLE";
      value = await stage("invoke", () => { interrupted(signal); started = true; timings.until_dispatch = performance.now() - attemptStart; return invoke(action, { signal, requestId, attemptId }); });
      outcome = value?.isError === true ? "reported_failure" : "reported_success";
      reason = outcome === "reported_failure" ? "HANDLER_REPORTED_FAILURE" : "COMPLETED";
    } catch {
      if (started) { outcome = "unknown"; value = undefined; reason = signal.aborted ? "CANCELLED_AFTER_DISPATCH" : "RESULT_UNAVAILABLE"; }
      else if (signal.aborted) reason = "CANCELLED_BEFORE_DISPATCH";
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    }
    const receipt = immutableJson({ kind: "vella_execution_receipt_v1", request_id: requestId, attempt_id: attemptId,
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
        retainedReceipt = ack?.receiptDigest === proofV2.digest(receipt) && ack?.durability === "file-and-directory-fsync";
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
