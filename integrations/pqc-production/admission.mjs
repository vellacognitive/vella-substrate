import {randomUUID} from 'node:crypto';

/** No queue or retries. Rejected calls never reach evaluation or a protected effect. */
export function withAdmissionLimit(gate, {capacity = 8, receiptKind, boundary = 'server-handler'}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 64 || typeof receiptKind !== 'string') throw new TypeError('invalid admission configuration');
  let inFlight = 0, rejected = 0;
  return Object.freeze({...gate, status: () => Object.freeze({inFlight, rejected, capacity}), async execute(input) {
    if (inFlight >= capacity) {
      rejected++;
      const requestId = typeof input?.requestId === 'string' && input.requestId.length && input.requestId.length <= 1024 && Buffer.byteLength(input.requestId) <= 1024 ? input.requestId : randomUUID();
      const attemptId = randomUUID();
      const receipt = {kind: receiptKind, request_id: requestId, attempt_id: attemptId, authorization_id: null,
        authorization_hash: null, action_digest: null, boundary, decision: null, eligible: false, outcome: 'not_started',
        reason: 'CAPACITY_EXCEEDED', observed_at: new Date().toISOString(), signed: false};
      return {requestId, attemptId, boundary, decision: null, eligible: false, outcome: 'not_started', reason: 'CAPACITY_EXCEEDED',
        authorizationRetained: false, receiptRetained: false, receipt, timings: {total: 0}};
    }
    inFlight++;
    try { return await gate.execute(input); } finally { inFlight--; }
  }});
}
