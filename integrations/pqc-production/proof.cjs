// Review implementation only: no released SDK entry point imports this module.
'use strict';
const crypto = require('node:crypto');
const {TextDecoder, types} = require('node:util');
const json = require('./bounded-json.cjs');
const recordContract = require('./record.cjs');
const KIND = 'vella_proof_bundle_pq_draft1';
const TYPE = 'application/vnd.vella.authorization.pq-draft1+json';
const CONTEXT = 'application/vnd.vella.signature-policy.pq-draft1+json';
const SUITE = 'p256+ml-dsa-65';
const PROFILE = recordContract.PROFILE;
const ALGORITHMS = Object.freeze(['ecdsa-p256-sha256', 'ml-dsa-65']);
const LENGTHS = Object.freeze({'ecdsa-p256-sha256': 64, 'ml-dsa-65': 3309});
const HASH = /^sha384:[a-f0-9]{96}$/;
const MAX_ENVELOPE = 2 * 1024 * 1024;

function requireRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 20) throw new Error('E_PQ_RUNTIME: draft requires qualified Node 24.20+ within 24.x');
}

function exact(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('invalid object');
  const names = Reflect.ownKeys(value);
  if (names.length !== fields.length || fields.some(k => !Object.hasOwn(value, k))) throw new TypeError('unexpected fields');
  for (const k of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, k);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('accessors or hidden fields unsupported');
  }
}

function required(suite) { if (suite !== SUITE) throw new TypeError('explicit hybrid profile required'); }
function decode(value, maximum) {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4) throw new TypeError('base64 limit');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maximum || bytes.toString('base64') !== value) throw new TypeError('invalid base64');
  return bytes;
}
function pem(value) {
  if (typeof value !== 'string' || value.length > 8192 || Buffer.byteLength(value) > 8192) throw new TypeError('key input limit');
  return value;
}
function checkKey(algorithm, key) {
  if (algorithm === 'ml-dsa-65' ? key.asymmetricKeyType !== 'ml-dsa-65' : key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new TypeError('key algorithm mismatch');
}
function privateKey(algorithm, input) {
  let key;
  if (algorithm === 'ml-dsa-65') {
    exact(input, ['format', 'value']);
    if (input.format !== 'raw-seed') throw new TypeError('ML-DSA raw-seed required');
    const seed = decode(input.value, 32);
    try {
      if (seed.length !== 32) throw new TypeError('invalid seed length');
      key = crypto.createPrivateKey({key: seed, format: 'raw-seed', asymmetricKeyType: 'ml-dsa-65'});
    } finally { seed.fill(0); }
  } else key = crypto.createPrivateKey(pem(input));
  checkKey(algorithm, key);
  return key;
}
function keyId(key) { return hash(key.export({format: 'der', type: 'spki'})); }
function hash(bytes) { return 'sha384:' + crypto.createHash('sha384').update(bytes).digest('hex'); }
function pae(type, bytes) { return Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${bytes.length} `), bytes]); }
function message(payload, keys) {
  const descriptor = {kind: KIND, payload_type: TYPE, suite: SUITE, digest_profile: PROFILE, keys};
  return Buffer.concat([pae(TYPE, payload), pae(CONTEXT, Buffer.from(json.canonicalize(descriptor)))]);
}

function sign(record, privateKeys, requiredSuite) {
  required(requiredSuite);
  recordContract.validateRecord(record);
  const payload = Buffer.from(json.canonicalize(record));
  exact(privateKeys, ALGORITHMS);
  requireRuntime();
  const loaded = ALGORITHMS.map(alg => privateKey(alg, privateKeys[alg]));
  const keys = Object.fromEntries(ALGORITHMS.map((alg, i) => [alg, keyId(crypto.createPublicKey(loaded[i]))]));
  const bytes = message(payload, keys);
  const signatures = Object.fromEntries(ALGORITHMS.map((alg, i) => [alg,
    crypto.sign(alg === 'ml-dsa-65' ? null : 'sha256', bytes,
      {key: loaded[i], ...(alg === 'ml-dsa-65' ? {} : {dsaEncoding: 'ieee-p1363'})}).toString('base64')]));
  return {kind: KIND, payload_type: TYPE, suite: SUITE, digest_profile: PROFILE,
    payload: payload.toString('base64'), keys, signatures, payload_hash: hash(bytes)};
}

function verify(input, publicKeys, requiredSuite) {
  try {
    required(requiredSuite);
    if (typeof input === 'string') input = json.parse(input, MAX_ENVELOPE);
    exact(input, ['kind', 'payload_type', 'suite', 'digest_profile', 'payload', 'keys', 'signatures', 'payload_hash']);
    if (input.kind !== KIND || input.payload_type !== TYPE || input.suite !== SUITE || input.digest_profile !== PROFILE) throw new TypeError('unsupported interpretation');
    exact(input.keys, ALGORITHMS);
    exact(input.signatures, ALGORITHMS);
    exact(publicKeys, ALGORITHMS);
    if (typeof input.payload_hash !== 'string' || !HASH.test(input.payload_hash)) throw new TypeError('invalid hash');
    for (const alg of ALGORITHMS) if (typeof input.keys[alg] !== 'string' || !HASH.test(input.keys[alg])) throw new TypeError('invalid key identity');
    const payload = decode(input.payload, json.LIMITS.bytes);
    const signatures = Object.fromEntries(ALGORITHMS.map(alg => {
      const signature = decode(input.signatures[alg], LENGTHS[alg]);
      if (signature.length !== LENGTHS[alg]) throw new TypeError('signature length');
      return [alg, signature];
    }));
    const record = json.parse(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(payload));
    recordContract.validateRecord(record);
    const bytes = message(payload, input.keys);
    if (input.payload_hash !== hash(bytes)) throw new TypeError('hash mismatch');
    requireRuntime();
    for (const alg of ALGORITHMS) {
      const key = crypto.createPublicKey(pem(publicKeys[alg]));
      checkKey(alg, key);
      if (input.keys[alg] !== keyId(key)) throw new TypeError('untrusted key');
      if (!crypto.verify(alg === 'ml-dsa-65' ? null : 'sha256', bytes,
        {key, ...(alg === 'ml-dsa-65' ? {} : {dsaEncoding: 'ieee-p1363'})}, signatures[alg])) throw new TypeError('invalid signature');
    }
    return {ok: true, format: KIND, suite: SUITE, authenticated: record,
      errors: [], warnings: ['Review draft; no production or preservation assurance']};
  } catch (error) {
    return {ok: false, format: KIND, errors: [error.message.startsWith('E_PQ_RUNTIME') ? 'E_PQ_RUNTIME' : 'E_PQ_INVALID_PROOF'], warnings: []};
  }
}

function generateKeys(requiredSuite) {
  required(requiredSuite);
  requireRuntime();
  const privateKeys = {}, publicKeys = {};
  for (const alg of ALGORITHMS) {
    const pair = crypto.generateKeyPairSync(alg === 'ml-dsa-65' ? 'ml-dsa-65' : 'ec', alg === 'ml-dsa-65' ? {} : {namedCurve: 'prime256v1'});
    privateKeys[alg] = alg === 'ml-dsa-65'
      ? {format: 'raw-seed', value: pair.privateKey.export({format: 'raw-seed'}).toString('base64')}
      : pair.privateKey.export({format: 'pem', type: 'pkcs8'});
    publicKeys[alg] = pair.publicKey.export({format: 'pem', type: 'spki'});
  }
  return {privateKeys, publicKeys};
}

module.exports = {KIND, TYPE, CONTEXT, SUITE, PROFILE, sign, verify, generateKeys};
