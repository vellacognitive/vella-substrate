import proof from './proof.cjs';
import contract from './record.cjs';
import bounded from './bounded-json.cjs';

// Explicit application-owned selection. No environment replacement or downgrade.
export const HYBRID_PROFILE = Object.freeze({
  id: proof.KIND, receiptKind: 'vella_execution_receipt_pq_draft1',
  recordFields: Object.freeze({digest_profile: proof.PROFILE}),
  digest: contract.digest, isDigest: value => typeof value === 'string' && /^sha384:[0-9a-f]{96}$/.test(value),
  assertJson: bounded.assertRecordJson,
  sign: (record, session) => session.sign(record),
  verify: (bundle, session) => session.verify(bundle),
});
