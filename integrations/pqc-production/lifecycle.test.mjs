import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalKeyStore, recoverLocalKeyLock} from './local-keys.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {retainVerificationMaterial} from './archive-material.mjs';
import {HYBRID_PROFILE} from './profile.mjs';
import proof from './proof.cjs';
import contract from './record.cjs';
import {createGovernor} from '../../sdk/node/governor.js';
import {createExecutionGate} from '../../sdk/node/execution.js';
import {createLocalProofSink} from '../../sdk/node/local-proof-sink.js';
import {createOperatorEvidenceProvider} from '../../sdk/node/operator-evidence.js';

const policy = {policyVersion: 'reports-pq-test', defaultScope: 'reports', evidenceBits: {AUTHN: 1, AUTHZ: 2, FRESHNESS: 4, APPROVAL: 8}, scopes: {reports: {intents: {EXPORT_REPORT: 15}}}};
function action(id = 'one') { return {server: 'test', tool: 'exportReport', definition_digest: contract.digest({revision: '1'}),
  principal: {id: 'operator'}, resource: {id: id, version: 'absent'}, arguments: {id, content: 'local report'}}; }
async function fixture(t, now = Date.now) {
  const root = await fs.promises.mkdtemp(join(tmpdir(), 'vella-pq-keys-'));
  const directory = join(root, 'keys'), proofs = join(root, 'proofs');
  await fs.promises.mkdir(proofs, {mode: 0o700});
  let store = await openLocalKeyStore({directory, initialize: true, now});
  t.after(async () => { try { store.close(); } finally { await fs.promises.rm(root, {recursive: true, force: true}); } });
  return {root, directory, proofs, get store() { return store; }, async reopen() { store.close(); store = await openLocalKeyStore({directory, now}); return store; }};
}
function input(id = 'one') { return {intent: 'EXPORT_REPORT', evidenceMask: 15, authorityScope: 'reports', action: action(id)}; }
function providerFor(actionValue) {
  const expiresAt = Date.now() + 60000;
  return createOperatorEvidenceProvider({loadState: () => ({
    session: {id: 'session', principalId: 'operator', revoked: false, expiresAt},
    permissions: [{id: 'permission', principalId: 'operator', server: actionValue.server, tool: actionValue.tool, resourceId: actionValue.resource.id, revoked: false, expiresAt}],
    approval: {id: 'approval', principalId: 'operator', actionDigest: contract.digest(actionValue), policyDigest: contract.digest(policy), revoked: false, expiresAt},
  })});
}
function gate(f, extra = {}) { return createExecutionGate({policy, proofProfile: HYBRID_PROFILE, keyProvider: f.store,
  proofSink: createLocalProofSink({directory: f.proofs, proofProfile: HYBRID_PROFILE}), evidenceProvider: providerFor(action()), ...extra}); }

test('rotation is durable, retires private keys, and preserves explicitly scoped historical verification', async t => {
  const f = await fixture(t);
  await f.store.rotate();
  const first = f.store.capture();
  const gov = createGovernor(policy, {proofProfile: HYBRID_PROFILE});
  const result = gov.govern({...input(), proof: {signingKey: first.signingKey}});
  assert.equal(result.decision, 'ALLOWED');
  assert.equal(first.publicKey.verify(result.proofBundle).ok, true);
  const current = await f.store.rotate();
  assert.throws(first.assertCurrent, /KEYS_CHANGED/);
  assert.equal(current.history[0].status, 'retired');
  const bytes = await fs.promises.readFile(join(f.directory, 'state.json'), 'utf8');
  assert.equal((bytes.match(/raw-seed/g) ?? []).length, 1, 'only active private key retained');
  assert.equal(JSON.stringify(current).includes('PRIVATE KEY'), false, 'metadata does not export secrets');
  const reopened = await f.reopen();
  assert.equal(reopened.status().revision, 2);
  const archived = reopened.verifyHistorical(result.proofBundle, {keySetId: first.keySetId, policy: 'report-current-trust-state'});
  assert.equal(archived.ok, true);
  assert.equal(archived.keyStatus, 'retired');
  assert.equal(archived.trustedForNewExecution, false);
  assert.throws(() => reopened.verifyHistorical(result.proofBundle, {keySetId: first.keySetId}), /EXPLICIT_ARCHIVE/);
  assert.equal((await fs.promises.stat(f.directory)).mode & 0o777, 0o700);
  assert.equal((await fs.promises.stat(join(f.directory, 'state.json'))).mode & 0o777, 0o600);
});

test('revocation survives restart; keys cannot be reused under a new identifier', async t => {
  const f = await fixture(t), pair = proof.generateKeys(proof.SUITE);
  await f.store.rotate({keys: pair});
  const original = f.store.capture();
  await f.store.revoke(original.keySetId);
  assert.throws(original.assertCurrent);
  assert.throws(() => f.store.capture());
  await f.reopen();
  assert.equal(f.store.status().history[0].status, 'revoked');
  await assert.rejects(f.store.rotate({keys: pair}), /KEY_REUSE_REJECTED/);
  assert.equal(f.store.status().revision, 2);
  await f.store.rotate();
  assert.doesNotThrow(() => f.store.capture());
});

test('annual expiry and seven years of verification material after the last permitted signing date', async t => {
  let now = Date.UTC(2026, 8, 8);
  const f = await fixture(t, () => now);
  const state = await f.store.rotate();
  assert.equal(state.history[0].notAfter, Date.UTC(2027, 8, 8));
  assert.equal(state.history[0].retentionTargetUntil, Date.UTC(2034, 8, 8));
  const snapshot = f.store.capture();
  now = state.history[0].notAfter;
  assert.throws(snapshot.assertCurrent);
  assert.throws(() => f.store.capture());
  now -= 1;
  assert.throws(() => f.store.capture(), /CLOCK_REGRESSED/);
  assert.throws(() => f.store.status(), /UNAVAILABLE/);
});

test('invalid key pair never replaces the active pair', async t => {
  const f = await fixture(t);
  await f.store.rotate();
  const before = f.store.capture(), pair = proof.generateKeys(proof.SUITE);
  pair.publicKeys = proof.generateKeys(proof.SUITE).publicKeys;
  await assert.rejects(f.store.rotate({keys: pair}), /KEY_PAIR_MISMATCH/);
  assert.doesNotThrow(before.assertCurrent);
  assert.equal(f.store.status().revision, 1);
});

test('permissions and symlink checks reject unsafe key files', async t => {
  const f = await fixture(t);
  await f.store.rotate(); f.store.close();
  const statePath = join(f.directory, 'state.json');
  await fs.promises.chmod(statePath, 0o644);
  await assert.rejects(openLocalKeyStore({directory: f.directory}), /KEY_FILE_UNSAFE/);
  await fs.promises.chmod(statePath, 0o600);
  await fs.promises.rename(statePath, join(f.directory, 'original.json'));
  await fs.promises.symlink('original.json', statePath);
  await assert.rejects(openLocalKeyStore({directory: f.directory}));
});

test('error after persisted rotation blocks old snapshots; restart reconciles durable state', async t => {
  const f = await fixture(t);
  await f.store.rotate(); const before = f.store.capture();
  const rename = fs.promises.rename;
  fs.promises.rename = async (...args) => { await rename(...args); throw new Error('injected post-rename failure'); };
  try { await assert.rejects(f.store.rotate(), /post-rename/); }
  finally { fs.promises.rename = rename; }
  assert.throws(before.assertCurrent, /UNAVAILABLE/);
  assert.throws(() => f.store.capture(), /UNAVAILABLE/);
  await f.reopen();
  assert.equal(f.store.status().revision, 2);
  assert.notEqual(f.store.capture().keySetId, before.keySetId);
});

test('hybrid gate retains SHA-384 proof and receipt and invokes the exact approved action once', async t => {
  const f = await fixture(t); await f.store.rotate();
  let calls = 0;
  const result = await gate(f).execute({action: action(), intent: 'EXPORT_REPORT', precondition: () => true, invoke: a => { calls++; assert.deepEqual(a, action()); return 'done'; }});
  assert.equal(calls, 1); assert.equal(result.outcome, 'reported_success');
  assert.equal(result.authorizationRetained, true); assert.equal(result.receiptRetained, true);
  assert.match(result.receipt.authorization_hash, /^sha384:/);
  assert.match(result.receipt.action_digest, /^sha384:/);
  assert.equal(result.receipt.kind, HYBRID_PROFILE.receiptKind);
});

for (const change of ['rotate', 'revoke', 'close']) {
  test(`key ${change} during final precondition stops dispatch`, async t => {
    const f = await fixture(t); await f.store.rotate(); let calls = 0;
    const result = await gate(f).execute({action: action(), intent: 'EXPORT_REPORT',
      precondition: async () => { if (change === 'rotate') await f.store.rotate(); else if (change === 'revoke') await f.store.revoke(f.store.capture().keySetId); else f.store.close(); return true; },
      invoke: () => { calls++; }});
    assert.equal(calls, 0); assert.equal(result.decision, 'ALLOWED'); assert.equal(result.eligible, false);
    assert.equal(result.reason, 'KEYS_CHANGED'); assert.equal(result.authorizationRetained, true);
  });
}

test('unavailable signer preserves allowed policy result and causes no effect', async t => {
  const f = await fixture(t); let calls = 0;
  const result = await gate(f).execute({action: action(), intent: 'EXPORT_REPORT', precondition: () => true, invoke: () => { calls++; }});
  assert.equal(result.decision, 'ALLOWED'); assert.equal(result.reason, 'SIGNING_UNAVAILABLE');
  assert.equal(calls, 0); assert.equal(result.authorizationRetained, false);
});

test('legacy hash approval cannot authorize the new profile and mismatched sink rejects configuration', async t => {
  const f = await fixture(t); await f.store.rotate(); let calls = 0;
  assert.throws(() => gate(f, {proofSink: createLocalProofSink({directory: f.proofs})}), /profile mismatch/);
  const invalid = action(); invalid.definition_digest = 'sha256:' + '1'.repeat(64);
  const result = await gate(f).execute({action: invalid, intent: 'EXPORT_REPORT', precondition: () => true, invoke: () => { calls++; }});
  assert.equal(calls, 0); assert.equal(result.reason, 'INVALID_ACTION');
});

test('an old closed handle cannot release another live store handle', async t => {
  const f = await fixture(t), old = f.store;
  await f.reopen(); old.close();
  await assert.rejects(openLocalKeyStore({directory: f.directory}), /ALREADY_OPEN/);
});

test('asynchronous final key checks cannot accidentally permit dispatch', async t => {
  const f = await fixture(t); await f.store.rotate(); let calls = 0;
  const session = f.store.capture();
  const keyProvider = {capture: () => ({...session, assertCurrent: async () => true})};
  const result = await gate(f, {keyProvider}).execute({action: action(), intent: 'EXPORT_REPORT', precondition: () => true, invoke: () => { calls++; }});
  assert.equal(calls, 0); assert.equal(result.reason, 'KEYS_CHANGED'); assert.equal(result.eligible, false);
});

test('cross-process writer exclusion and explicit crash recovery preserve the durable revision', async t => {
  const f = await fixture(t); await f.store.rotate(); f.store.close();
  const moduleUrl = new URL('./local-keys.mjs', import.meta.url).href;
  const code = `const {openLocalKeyStore}=await import(process.argv[1]); const store=await openLocalKeyStore({directory:process.argv[2]}); process.stdout.write('ready\\n'); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, moduleUrl, f.directory], {stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => child.kill('SIGKILL'));
  await once(child.stdout, 'data');
  await assert.rejects(openLocalKeyStore({directory: f.directory}), /KEY_STORE_LOCKED/);
  await assert.rejects(recoverLocalKeyLock({directory: f.directory, expectedPid: child.pid, expectedRevision: 1, confirmStopped: true}), /STILL_ALIVE/);
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  await assert.rejects(openLocalKeyStore({directory: f.directory}), /KEY_STORE_LOCKED/);
  await assert.rejects(recoverLocalKeyLock({directory: f.directory, expectedPid: child.pid, expectedRevision: 0, confirmStopped: true}), /REVISION_CHANGED/);
  await recoverLocalKeyLock({directory: f.directory, expectedPid: child.pid, expectedRevision: 1, confirmStopped: true});
  await f.reopen(); assert.equal(f.store.status().revision, 1);
});

for (const stage of ['authorization', 'receipt']) {
  test(`hybrid ${stage} retention failure preserves the correct execution boundary`, async t => {
    const f = await fixture(t); await f.store.rotate(); let calls = 0;
    const sink = createLocalProofSink({directory: f.proofs, proofProfile: HYBRID_PROFILE});
    const proofSink = {...sink, [stage === 'authorization' ? 'retainAuthorization' : 'retainReceipt']: async () => { throw new Error('storage unavailable'); }};
    const result = await gate(f, {proofSink}).execute({action: action(), intent: 'EXPORT_REPORT', precondition: () => true, invoke: () => { calls++; return 'done'; }});
    assert.equal(result.decision, 'ALLOWED'); assert.equal(result.receiptRetained, false);
    assert.equal(calls, stage === 'authorization' ? 0 : 1);
    assert.equal(result.authorizationRetained, stage === 'receipt');
    assert.equal(result.outcome, stage === 'authorization' ? 'not_started' : 'reported_success');
  });
}

for (const algorithm of ['ecdsa-p256-sha256', 'ml-dsa-65']) {
  test(`hybrid gate rejects a provider omitting ${algorithm}`, async t => {
    const f = await fixture(t); await f.store.rotate(); let calls = 0;
    const session = f.store.capture();
    const keyProvider = {capture: () => ({...session, signingKey: {sign(record) {
      const bundle = session.signingKey.sign(record); delete bundle.signatures[algorithm]; return bundle;
    }}})};
    const result = await gate(f, {keyProvider}).execute({action: action(), intent: 'EXPORT_REPORT', precondition: () => true, invoke: () => { calls++; }});
    assert.equal(calls, 0); assert.equal(result.decision, 'ALLOWED'); assert.equal(result.reason, 'SIGNING_UNAVAILABLE');
    assert.equal(result.authorizationRetained, false);
  });
}

test('changed evidence after proof retention stops the hybrid call', async t => {
  const f = await fixture(t); await f.store.rotate(); let calls = 0, resolves = 0;
  const base = providerFor(action());
  const evidenceProvider = {async resolve(binding) { const evidence = await base.resolve(binding); if (++resolves === 2) evidence.references.approval_id = 'different'; return evidence; }};
  const result = await gate(f, {evidenceProvider}).execute({action: action(), intent: 'EXPORT_REPORT', precondition: () => true, invoke: () => { calls++; }});
  assert.equal(calls, 0); assert.equal(result.reason, 'EVIDENCE_CHANGED'); assert.equal(result.authorizationRetained, true);
});

test('approval expiry during an awaited precondition stops dispatch', async t => {
  const f = await fixture(t); await f.store.rotate(); let now = 1000, calls = 0;
  const expiresAt = 2000, target = action();
  const evidenceProvider = createOperatorEvidenceProvider({now: () => now, loadState: () => ({
    session: {id: 's', principalId: 'operator', expiresAt, revoked: false},
    permissions: [{id: 'p', principalId: 'operator', server: target.server, tool: target.tool, resourceId: target.resource.id, expiresAt, revoked: false}],
    approval: {id: 'a', principalId: 'operator', actionDigest: contract.digest(target), policyDigest: contract.digest(policy), expiresAt, revoked: false},
  })});
  const result = await gate(f, {evidenceProvider}).execute({action: target, intent: 'EXPORT_REPORT', precondition: async () => { now = expiresAt; return true; }, invoke: () => { calls++; }});
  assert.equal(calls, 0); assert.equal(result.reason, 'EVIDENCE_CHANGED'); assert.equal(result.decision, 'ALLOWED'); assert.equal(result.authorizationRetained, true);
});

test('retained policy material snapshots its input before asynchronous storage', async t => {
  const f = await fixture(t); await f.store.rotate(); const supplied = structuredClone(policy), expected = structuredClone(policy);
  const pending = retainVerificationMaterial({directory: f.proofs, policy: supplied, keyStore: f.store, profile: HYBRID_PROFILE});
  supplied.policyVersion = 'mutated';
  const ack = await pending;
  assert.equal(ack.policyDigest, contract.digest(expected));
  const name = `policy.${ack.policyDigest.slice('sha384:'.length)}.json`;
  assert.deepEqual(JSON.parse(await fs.promises.readFile(join(ack.directory, name), 'utf8')), expected);
});
