// v3 record contract. Shared v2 record semantics are copied deliberately; v2 stays fixed.
'use strict';
const crypto = require('node:crypto');
const {assertRecordJson, canonicalize} = require('./bounded-json.cjs');
const PROFILE = 'sha384-jcs-v1';
const HASH = /^sha384:[a-f0-9]{96}$/;
function digest(value) { return 'sha384:' + crypto.createHash('sha384').update(canonicalize(value)).digest('hex'); }
const RECORD_FIELDS = ["envelope_id", "request_id", "intent", "authority_scope", "policy_version", "requested_policy_version", "policy_digest", "evidence_mask", "decision", "reason_code", "timestamp", "action", "action_digest", "evidence", "boundary", "build_hash", "external_effects", "digest_profile"];
const REASONS = new Set(["POLICY_SATISFIED", "DENY_FAST", "E_INTENT_REQUIRED", "E_POLICY_VERSION_MISMATCH", "E_EVIDENCE_MISSING", "E_EVIDENCE_INVALID", "E_EVALUATOR_INTERNAL"]);
function fields(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) throw new TypeError(`invalid ${label} fields`);
}
function text(value) { return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 1024; }
function objectOrNull(value) { return value === null || (typeof value === "object" && !Array.isArray(value)); }

function validateRecord(record) {
  assertRecordJson(record);
  if (record.digest_profile !== PROFILE) throw new TypeError("invalid digest_profile");
  fields(record, RECORD_FIELDS, "authorization record");
  for (const field of ["envelope_id", "request_id", "authority_scope", "policy_version"]) {
    if (!text(record[field])) throw new TypeError(`invalid ${field}`);
  }
  for (const field of ["intent", "requested_policy_version", "build_hash"]) {
    if (record[field] !== null && !text(record[field])) throw new TypeError(`invalid ${field}`);
  }
  if (!HASH.test(record.policy_digest)) throw new TypeError("invalid policy_digest");
  if (record.evidence_mask !== null && !(Number.isInteger(record.evidence_mask) && record.evidence_mask >= 0 && record.evidence_mask <= 0xffffffff)) throw new TypeError("invalid evidence_mask");
  if (!["ALLOWED", "DENIED"].includes(record.decision) || !REASONS.has(record.reason_code)) throw new TypeError("invalid decision or reason");
  if ((record.decision === "ALLOWED") !== (record.reason_code === "POLICY_SATISFIED")) throw new TypeError("inconsistent decision and reason");
  if (record.decision === "ALLOWED" && (record.intent === null || record.evidence_mask === null)) throw new TypeError("allowed record lacks intent or evidence");
  if (typeof record.timestamp !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.timestamp) || record.timestamp.startsWith("0000") || !Number.isFinite(Date.parse(record.timestamp)) || new Date(record.timestamp).toISOString() !== record.timestamp) throw new TypeError("invalid timestamp");
  if (!objectOrNull(record.action) || !objectOrNull(record.evidence)) throw new TypeError("action and evidence must be objects or null");
  if (record.action_digest !== (record.action === null ? null : digest(record.action))) throw new TypeError("action_digest mismatch");
  if (!["evaluation", "client-dispatch", "server-handler"].includes(record.boundary) || record.external_effects !== false) throw new TypeError("invalid authorization boundary");
}


module.exports = {PROFILE, digest, validateRecord};
