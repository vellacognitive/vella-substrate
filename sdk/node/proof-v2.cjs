/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
"use strict";

const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");

const KIND = "vella_proof_bundle_v2";
const PAYLOAD_TYPE = "application/vnd.vella.authorization.v2+json";
const ALGORITHM = "ecdsa-p256-sha256";
const MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const REASONS = new Set(["POLICY_SATISFIED", "DENY_FAST", "E_INTENT_REQUIRED", "E_POLICY_VERSION_MISMATCH", "E_EVIDENCE_MISSING", "E_EVIDENCE_INVALID", "E_EVALUATOR_INTERNAL"]);
const RECORD_FIELDS = ["envelope_id", "request_id", "intent", "authority_scope", "policy_version", "requested_policy_version", "policy_digest", "evidence_mask", "decision", "reason_code", "timestamp", "action", "action_digest", "evidence", "boundary", "build_hash", "external_effects"];
const BUNDLE_FIELDS = ["kind", "payload_type", "payload", "signature_alg", "signature", "key_id", "payload_hash"];
const HASH = /^sha256:[a-f0-9]{64}$/;

function assertJson(value, depth = 0, ancestors = new Set()) {
  if (depth > MAX_DEPTH) throw new TypeError("JSON nesting exceeds 32 levels");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new TypeError("unsupported JSON number");
    return;
  }
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const low = value.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError("unpaired Unicode surrogate");
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError("unpaired Unicode surrogate");
    }
    return;
  }
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("unsupported or cyclic JSON value");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("JSON objects must be plain records");
  ancestors.add(value);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError("JSON symbol keys are unsupported");
  if (Array.isArray(value)) {
    if (Object.getOwnPropertyNames(value).length !== value.length + 1) throw new TypeError("JSON arrays must be dense without extra properties");
    for (let i = 0; i < value.length; i++) {
      const property = Object.getOwnPropertyDescriptor(value, String(i));
      if (!property || !Object.hasOwn(property, "value")) throw new TypeError("JSON array accessors and holes are unsupported");
      assertJson(property.value, depth + 1, ancestors);
    }
  } else {
    if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) throw new TypeError("JSON hidden properties are unsupported");
    for (const key of Object.keys(value)) {
      assertJson(key, depth + 1, ancestors);
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !Object.hasOwn(property, "value")) throw new TypeError("JSON accessors are unsupported");
      assertJson(property.value, depth + 1, ancestors);
    }
  }
  ancestors.delete(value);
}

// RFC 8785 serialization over the explicitly bounded JSON domain above.
function canonicalize(value) {
  assertJson(value);
  function encode(item) {
    if (item === null || typeof item !== "object") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(",")}}`;
  }
  return encode(value);
}

function hash(bytes) { return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`; }
function digest(value) { return hash(canonicalize(value)); }

// Parse the authenticated bytes without reserializing them. Reject duplicate
// object keys, including escaped spellings of the same key, before interpretation.
function parseJson(text) {
  let pos = 0;
  const space = () => { while (/[\x20\t\r\n]/.test(text[pos] ?? "!")) pos++; };
  function string() {
    const start = pos++;
    while (pos < text.length) {
      const char = text[pos++];
      if (char === "\\") { pos++; continue; }
      if (char === '"') return JSON.parse(text.slice(start, pos));
    }
    throw new TypeError("unterminated JSON string");
  }
  function value(depth) {
    if (depth > MAX_DEPTH) throw new TypeError("JSON nesting exceeds 32 levels");
    space();
    if (text[pos] === '"') return string();
    if (text[pos] === "{" || text[pos] === "[") {
      const object = text[pos++] === "{";
      const close = object ? "}" : "]";
      const entries = [];
      const keys = new Set();
      space();
      if (text[pos] === close) { pos++; return object ? {} : []; }
      while (true) {
        space();
        let key;
        if (object) {
          if (text[pos] !== '"') throw new TypeError("expected JSON key");
          key = string();
          if (keys.has(key)) throw new TypeError("duplicate JSON key");
          keys.add(key);
          space();
          if (text[pos++] !== ":") throw new TypeError("expected colon");
        }
        const item = value(depth + 1);
        entries.push(object ? [key, item] : item);
        space();
        const delimiter = text[pos++];
        if (delimiter === close) return object ? Object.fromEntries(entries) : entries;
        if (delimiter !== ",") throw new TypeError("expected JSON delimiter");
      }
    }
    const token = /^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(pos));
    if (!token) throw new TypeError("invalid JSON value");
    pos += token[0].length;
    return JSON.parse(token[0]);
  }
  const result = value(0);
  space();
  if (pos !== text.length) throw new TypeError("trailing JSON content");
  assertJson(result);
  return result;
}

function fields(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) throw new TypeError(`invalid ${label} fields`);
}
function text(value) { return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 1024; }
function objectOrNull(value) { return value === null || (typeof value === "object" && !Array.isArray(value)); }

function validateRecord(record) {
  assertJson(record);
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

function pae(type, bytes) { return Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${bytes.length} `), bytes]); }
function keyId(key) { return `key_${crypto.createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16)}`; }
function p256(key) {
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new TypeError("key must use P-256");
}
function decode64(value, maximum) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new TypeError("invalid base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maximum || bytes.toString("base64") !== value) throw new TypeError("invalid base64 encoding or length");
  return bytes;
}

function signV2(record, signingKey) {
  validateRecord(record);
  const bytes = Buffer.from(JSON.stringify(record), "utf8");
  if (bytes.length > MAX_BYTES) throw new TypeError("payload exceeds 1 MiB");
  const key = crypto.createPrivateKey(signingKey);
  p256(key);
  const message = pae(PAYLOAD_TYPE, bytes);
  return {
    kind: KIND, payload_type: PAYLOAD_TYPE, payload: bytes.toString("base64"), signature_alg: ALGORITHM,
    signature: crypto.sign("sha256", message, { key, dsaEncoding: "ieee-p1363" }).toString("base64"),
    key_id: keyId(crypto.createPublicKey(key)), payload_hash: hash(message),
  };
}

function verifyV2(bundle, publicKey) {
  try {
    fields(bundle, BUNDLE_FIELDS, "v2 bundle");
    if (bundle.kind !== KIND || bundle.payload_type !== PAYLOAD_TYPE || bundle.signature_alg !== ALGORITHM) throw new TypeError("unsupported v2 format or algorithm");
    const bytes = decode64(bundle.payload, MAX_BYTES);
    const signature = decode64(bundle.signature, 64);
    if (signature.length !== 64) throw new TypeError("signature must have 64 bytes");
    const key = crypto.createPublicKey(publicKey);
    p256(key);
    if (bundle.key_id !== keyId(key)) throw new TypeError("key_id mismatch");
    const message = pae(PAYLOAD_TYPE, bytes);
    if (bundle.payload_hash !== hash(message)) throw new TypeError("payload_hash mismatch");
    if (!crypto.verify("sha256", message, { key, dsaEncoding: "ieee-p1363" }, signature)) throw new Error("invalid signature");
    const record = parseJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
    validateRecord(record);
    return { ok: true, format: "v2", errors: [], warnings: [], authenticated: record, computed: { payload_hash: bundle.payload_hash, key_id: bundle.key_id } };
  } catch (error) {
    return { ok: false, format: "v2", errors: [error instanceof Error ? error.message : String(error)], warnings: [] };
  }
}

module.exports = { KIND, PAYLOAD_TYPE, ALGORITHM, MAX_BYTES, canonicalize, digest, assertJson, parseJson, validateRecord, signV2, verifyV2 };
