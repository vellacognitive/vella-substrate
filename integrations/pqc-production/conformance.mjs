import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import proof from './proof.cjs';
import contract from './record.cjs';
import bounded from './bounded-json.cjs';
import v2 from '../../sdk/node/proof-v2.cjs';
import {createGovernor} from '../../sdk/node/governor.js';
import {HYBRID_PROFILE} from './profile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const python = process.env.PQC_PYTHON ?? 'python3';
function py(requests) {
  const result = spawnSync(python, [resolve(here, 'bridge.py')], {encoding: 'utf8',
    env: {...process.env, PYTHONPATH: resolve(here, '../../sdk/python')}, input: JSON.stringify(requests), maxBuffer: 16 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
let assertions = 0;
function check(ok, label) { assert.equal(ok, true, label); assertions++; }
const policy = {policyVersion: 'pq-review-1', defaultScope: 'reports', evidenceBits: {AUTHN: 1, AUTHZ: 2, FRESHNESS: 4, APPROVAL: 8}, scopes: {reports: {intents: {EXPORT_REPORT: 15}}}};
const action = {server: 'local-reports', tool: 'exportReport', definition_digest: contract.digest({revision: '1'}),
  principal: {id: 'operator'}, resource: {id: 'report:review', version: 'absent'},
  arguments: {content: 'café 😀', values: [1, 0.000001, null, true], nested: {'10': 10, '2': 2}}};
const record = {envelope_id: 'env_review', request_id: 'req_review', intent: 'EXPORT_REPORT', authority_scope: 'reports',
  policy_version: 'pq-review-1', requested_policy_version: null, policy_digest: contract.digest(policy), evidence_mask: 15,
  decision: 'ALLOWED', reason_code: 'POLICY_SATISFIED', timestamp: '2026-09-08T00:00:00.000Z',
  action, action_digest: contract.digest(action), evidence: {provider: 'operator', attempt_id: 'review'},
  boundary: 'server-handler', build_hash: null, external_effects: false, digest_profile: contract.PROFILE};
const origins = [proof.generateKeys(proof.SUITE), py([{op: 'generate', suite: proof.SUITE}])[0]];
const vectors = [];
for (const [origin, keys] of origins.entries()) {
  const governor = createGovernor(policy, {proofProfile: HYBRID_PROFILE});
  const input = {intent: 'EXPORT_REPORT', evidenceMask: 15, action, authorityScope: 'reports', proof: {signingKey: {sign: record => proof.sign(record, keys.privateKeys, proof.SUITE)}}};
  const nodeGoverned = governor.govern(input);
  const pythonGoverned = py([{op: 'govern', policy, keys: keys.privateKeys, input: {intent: input.intent, evidence_mask: 15, action, authority_scope: 'reports'}}])[0];
  check(nodeGoverned.decision === 'ALLOWED' && pythonGoverned.result.decision === 'ALLOWED', 'actual SDK provider decisions');
  check(governor.policyDigest === pythonGoverned.policyDigest && governor.policyDigest === contract.digest(policy), 'actual SDK provider policy identity');
  for (const bundle of [nodeGoverned.proofBundle, pythonGoverned.result.proof_bundle]) {
    check(proof.verify(bundle, keys.publicKeys, proof.SUITE).ok, 'actual governor proof verifies in Node');
    check(py([{op: 'verify', bundle, keys: keys.publicKeys, suite: proof.SUITE}])[0].ok, 'actual governor proof verifies in Python');
  }
  const failure = py([{op: 'govern', policy, keys: {}, input: {intent: input.intent, evidence_mask: 15}}])[0].result;
  check(failure.decision === 'ALLOWED' && failure.proof_bundle === null, 'Python signing failure preserves decision');
  const producers = [proof.sign(record, keys.privateKeys, proof.SUITE), py([{op: 'sign', record, keys: keys.privateKeys, suite: proof.SUITE}])[0]];
  for (const [producer, bundle] of producers.entries()) {
    vectors.push({origin: origin ? 'python' : 'node', producer: producer ? 'python' : 'node', bundle, publicKeys: keys.publicKeys});
    check(proof.verify(bundle, keys.publicKeys, proof.SUITE).ok, 'Node accepts valid proof');
    check(py([{op: 'verify', bundle, keys: keys.publicKeys, suite: proof.SUITE}])[0].ok, 'Python accepts valid proof');
    check(!v2.verifyV2(bundle, keys.publicKeys['ecdsa-p256-sha256']).ok, 'legacy v2 rejects draft');
    const negatives = [];
    for (const field of ['kind', 'payload_type', 'suite', 'digest_profile', 'payload', 'payload_hash']) {
      negatives.push({...structuredClone(bundle), [field]: bundle[field] + 'changed'});
    }
    for (const alg of ['ecdsa-p256-sha256', 'ml-dsa-65']) {
      const missing = structuredClone(bundle); delete missing.signatures[alg]; negatives.push(missing);
      const corrupt = structuredClone(bundle); const sig = Buffer.from(corrupt.signatures[alg], 'base64'); sig[0] ^= 1; corrupt.signatures[alg] = sig.toString('base64'); negatives.push(corrupt);
      const wrongId = structuredClone(bundle); wrongId.keys[alg] = 'sha384:' + 'f'.repeat(96); negatives.push(wrongId);
    }
    negatives.push({...structuredClone(bundle), unknown: true});
    negatives.push(JSON.stringify(bundle).replace('{', '{"kind":"duplicate",'));
    negatives.push(JSON.stringify(bundle).replace('{', '{"\\u006bind":"duplicate",'));
    negatives.push({...structuredClone(bundle), payload: 'a'.repeat(2 * 1024 * 1024)});
    const results = py(negatives.map(b => ({op: 'verify', bundle: b, keys: keys.publicKeys, suite: proof.SUITE})));
    negatives.forEach((bad, i) => {
      const node = proof.verify(bad, keys.publicKeys, proof.SUITE);
      check(!node.ok && !Object.hasOwn(node, 'authenticated'), 'Node rejects changed proof');
      check(!results[i].ok && !Object.hasOwn(results[i], 'authenticated'), 'Python rejects changed proof');
    });
    for (const required of [undefined, 'ml-dsa-65']) {
      check(!proof.verify(bundle, keys.publicKeys, required).ok, 'explicit required profile');
      check(!py([{op: 'verify', bundle, keys: keys.publicKeys, suite: required}])[0].ok, 'Python explicit required profile');
    }
    const wrong = origins[1 - origin].publicKeys;
    check(!proof.verify(bundle, wrong, proof.SUITE).ok, 'wrong trusted keys');
    check(!py([{op: 'verify', bundle, keys: wrong, suite: proof.SUITE}])[0].ok, 'Python wrong trusted keys');
  }
}

// Independent raw signer creates correctly signed malformed payloads. Never exported.
function rawSign(payload) {
  const keys = origins[0];
  const shape = structuredClone(vectors[0].bundle);
  const descriptor = {kind: proof.KIND, payload_type: proof.TYPE, suite: proof.SUITE, digest_profile: proof.PROFILE, keys: shape.keys};
  const pae = (t, b) => Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(t)} ${t} ${b.length} `), b]);
  const message = Buffer.concat([pae(proof.TYPE, payload), pae(proof.CONTEXT, Buffer.from(v2.canonicalize(descriptor)))]);
  shape.payload = payload.toString('base64');
  shape.payload_hash = 'sha384:' + crypto.createHash('sha384').update(message).digest('hex');
  shape.signatures['ecdsa-p256-sha256'] = crypto.sign('sha256', message, {key: keys.privateKeys['ecdsa-p256-sha256'], dsaEncoding: 'ieee-p1363'}).toString('base64');
  const pqKey = crypto.createPrivateKey({key: Buffer.from(keys.privateKeys['ml-dsa-65'].value, 'base64'), format: 'raw-seed', asymmetricKeyType: 'ml-dsa-65'});
  shape.signatures['ml-dsa-65'] = crypto.sign(null, message, pqKey).toString('base64');
  return shape;
}
const raw = JSON.stringify(record);
const malformed = [Buffer.from('\ufeff' + raw), Buffer.concat([Buffer.from(raw), Buffer.from([255])]),
  Buffer.from(raw + ' null'), Buffer.from(raw.replace('{', '{"intent":"duplicate",')),
  Buffer.from(raw.replace('{', '{"\\u0069ntent":"duplicate",'))];
for (const change of [{policy_digest: 'sha256:' + '1'.repeat(64)}, {action_digest: 'sha384:' + '0'.repeat(96)},
  {evidence_mask: 1.5}, {evidence_mask: true}, {intent: null}, {external_effects: true}, {boundary: 'elsewhere'},
  {reason_code: 'DENY_FAST'}, {timestamp: '2026-02-30T00:00:00.000Z'}, {digest_profile: 'sha256'}, {extra: 1}]) {
  malformed.push(Buffer.from(JSON.stringify({...record, ...change})));
}
const signedBad = malformed.map(rawSign);
const badResults = py(signedBad.map(bundle => ({op: 'verify', bundle, keys: origins[0].publicKeys, suite: proof.SUITE})));
signedBad.forEach((bundle, i) => {
  check(!proof.verify(bundle, origins[0].publicKeys, proof.SUITE).ok, 'Node rejects authenticated malformed record');
  check(!badResults[i].ok, 'Python rejects authenticated malformed record');
});
// Raw signer also supplies a positive control with noncanonical whitespace/order.
const rawGood = rawSign(Buffer.from(JSON.stringify(record, null, 2)));
check(proof.verify(rawGood, origins[0].publicKeys, proof.SUITE).ok, 'raw positive control');
check(py([{op: 'verify', bundle: rawGood, keys: origins[0].publicKeys, suite: proof.SUITE}])[0].ok, 'Python raw positive control');

const nested = n => { let value = null; for (let i = 0; i < n; i++) value = [value]; return value; };
const domain = [
  [true, {z: 1.0, a: {'10': 10, '2': 2}, text: '😀 café', float: 1e-7}],
  [true, 'x'.repeat(65536)], [false, 'x'.repeat(65537)],
  [true, '😀'.repeat(16384)], [false, '😀'.repeat(16385)],
  [true, Array(4096).fill(null)], [false, Array(4097).fill(null)],
  [true, Object.fromEntries(Array.from({length: 256}, (_, i) => [`k${i}`, i]))],
  [false, Object.fromEntries(Array.from({length: 257}, (_, i) => [`k${i}`, i]))],
  [true, nested(32)], [false, nested(33)],
  [false, [Array(4096).fill(0), Array(4096).fill(0), Array(4096).fill(0), Array(4096).fill(0)]],
  [false, '\ud800'], [false, 9007199254740992],
  [false, Array(17).fill('x'.repeat(65536))],
];
const domainResults = py(domain.map(([, value]) => ({op: 'digest', value})));
domain.forEach(([expected, value], i) => {
  let ok = true, digest;
  try { digest = contract.digest(value); } catch { ok = false; }
  check(ok === expected, `Node domain case ${i}`);
  check(domainResults[i].ok === expected, `Python domain case ${i}`);
  if (expected) check(domainResults[i].digest === digest, 'cross-language SHA-384 digest parity');
});
let getterCalls = 0;
const accessor = {get data() { getterCalls++; return 1; }};
for (const value of [accessor, new Proxy({}, {ownKeys() { getterCalls++; return []; }}), [, 1], new Date(), NaN, Infinity]) {
  assert.throws(() => contract.digest(value)); assertions++;
}
check(getterCalls === 0, 'object preflight does not invoke getters/proxies');
assert.throws(() => bounded.parse('['.repeat(10000) + '0' + ']'.repeat(10000))); assertions++;
check(!py([{op: 'digest', text: '['.repeat(10000) + '0' + ']'.repeat(10000)}])[0].ok, 'Python depth preflight');
if (process.env.PQC_PUBLIC_VECTORS) writeFileSync(process.env.PQC_PUBLIC_VECTORS, JSON.stringify({kind: 'pqc-production-review-vectors', vectors}, null, 2) + '\n');
console.log(JSON.stringify({kind: 'pqc-production-contract-checks', assertions, publicVectors: vectors.length, allPassed: true,
  node: process.version, scope: 'Draft SDK-provider/proof/domain/key interoperability; gate/CLI tests are separate; owner review pending'}, null, 2));
