import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client, StdioClientTransport} from './mcp-dependencies.mjs';
import {openLocalKeyStore} from './local-keys.mjs';
import {HYBRID_PROFILE} from './profile.mjs';
import {describeGovernedTool} from '../mcp-server/index.js';
import {reportPolicy, reportRegistration, reportSchema} from '../mcp-server/example/report-workflow.mjs';
import {withAdmissionLimit} from './admission.mjs';
import proof from './proof.cjs';

const META = 'com.vellacognitive/governance';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vella-pq-mcp-'));
  const config = {operatorUid: process.getuid(), serverId: 'pq-reference', reportDirectory: join(root, 'reports'), proofDirectory: join(root, 'proofs'), keyDirectory: join(root, 'keys'), evidenceStatePath: join(root, 'evidence.json')};
  for (const path of [config.reportDirectory, config.proofDirectory]) await mkdir(path, {mode: 0o700});
  const keys = await openLocalKeyStore({directory: config.keyDirectory, initialize: true});
  const state = await keys.rotate(); keys.close();
  const publicKeys = state.history[0].publicKeys;
  await writeFile(config.evidenceStatePath, '{}', {mode: 0o600});
  const configPath = join(root, 'config.json'); await writeFile(configPath, JSON.stringify(config), {mode: 0o600});
  const client = new Client({name: 'pq-review-client', version: '0.0.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
  const transport = new StdioClientTransport({command: process.execPath, args: [fileURLToPath(new URL('./reference-server.mjs', import.meta.url)), configPath]});
  t.after(async () => { try { await client.close(); } finally { await rm(root, {recursive: true, force: true}); } });
  await client.connect(transport); await client.listTools();
  async function approve(args, name = 'exportReport', {legacy = false} = {}) {
    const principalId = `local-uid:${config.operatorUid}`, expiresAt = Date.now() + 60000;
    const action = {server: config.serverId, tool: name, definition_digest: describeGovernedTool({...reportRegistration(config.serverId, name), digest: HYBRID_PROFILE.digest}).definitionDigest,
      principal: {id: principalId}, resource: {id: `report:${args.reportId}`, version: 'absent'}, arguments: reportSchema.parse(args)};
    const state = {session: {id: 'session', principalId, expiresAt, revoked: false},
      permissions: [{id: 'permission', principalId, server: config.serverId, tool: name, resourceId: action.resource.id, expiresAt, revoked: false}],
      approval: {id: 'approval', principalId, actionDigest: legacy ? 'sha256:' + '0'.repeat(64) : HYBRID_PROFILE.digest(action), policyDigest: HYBRID_PROFILE.digest(reportPolicy), expiresAt, revoked: false}};
    await writeFile(config.evidenceStatePath, JSON.stringify(state), {mode: 0o600});
  }
  return {config, client, publicKeys, approve};
}

test('native stdio: unapproved calls stop, both report routes require hybrid proof, retained files reconcile', async t => {
  const f = await fixture(t);
  let result = await f.client.callTool({name: 'exportReport', arguments: {reportId: 'unapproved', content: 'blocked'}});
  assert.equal(result._meta[META].outcome, 'not_started');
  for (const [i, name] of ['exportReport', 'ExportReport'].entries()) {
    const args = {reportId: `approved-${i}`, content: 'hybrid report'};
    await f.approve(args, name);
    result = await f.client.callTool({name, arguments: args});
    assert.equal(result._meta[META].outcome, 'reported_success');
    assert.equal(result._meta[META].receiptRetained, true);
    assert.equal(await readFile(join(f.config.reportDirectory, `${args.reportId}.txt`), 'utf8'), args.content);
  }
  const files = (await readdir(f.config.proofDirectory)).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 4);
  const archive = join(f.config.proofDirectory, 'verification-material');
  const material = await readdir(archive);
  const policyFile = material.find(name => name.startsWith('policy.'));
  assert.equal(HYBRID_PROFILE.digest(JSON.parse(await readFile(join(archive, policyFile), 'utf8'))), HYBRID_PROFILE.digest(reportPolicy));
  const publicTrust = await readFile(join(archive, material.find(name => name.startsWith('public-trust.'))), 'utf8');
  assert.equal(publicTrust.includes('PRIVATE KEY'), false);
  assert.equal(publicTrust.includes('raw-seed'), false);
  for (const name of files.filter(n => n.endsWith('.authorization.json'))) {
    const bundle = JSON.parse(await readFile(join(f.config.proofDirectory, name), 'utf8'));
    const verification = proof.verify(bundle, f.publicKeys, proof.SUITE);
    assert.equal(verification.ok, true);
    assert.match(verification.authenticated.action.definition_digest, /^sha384:/);
    const receipt = JSON.parse(await readFile(join(f.config.proofDirectory, name.replace('.authorization.', '.receipt.')), 'utf8'));
    assert.equal(receipt.authorization_hash, bundle.payload_hash);
    assert.equal(receipt.action_digest, verification.authenticated.action_digest);
  }
  assert.equal((await readdir(f.config.reportDirectory)).length, 2);
});

test('legacy approval and edited action cannot authorize a hybrid MCP call', async t => {
  const f = await fixture(t), args = {reportId: 'binding', content: 'original'};
  await f.approve(args, 'exportReport', {legacy: true});
  let result = await f.client.callTool({name: 'exportReport', arguments: args});
  assert.equal(result._meta[META].outcome, 'not_started');
  await f.approve(args);
  result = await f.client.callTool({name: 'exportReport', arguments: {...args, content: 'changed'}});
  assert.equal(result._meta[META].outcome, 'not_started');
  assert.deepEqual(await readdir(f.config.reportDirectory), []);
});

test('admission accepts eight, rejects eight, creates no queue, and recovers capacity', async () => {
  let release, effects = 0;
  const ready = new Promise(resolve => { release = resolve; });
  const limited = withAdmissionLimit({execute: async () => { await ready; effects++; return {outcome: 'reported_success'}; }}, {capacity: 8, receiptKind: HYBRID_PROFILE.receiptKind});
  const pending = Array.from({length: 16}, () => limited.execute({}));
  assert.equal(limited.status().inFlight, 8); assert.equal(limited.status().rejected, 8);
  const rejected = await Promise.all(pending.slice(8));
  assert.ok(rejected.every(r => r.reason === 'CAPACITY_EXCEEDED' && !r.eligible && r.outcome === 'not_started'));
  assert.equal(effects, 0);
  release(); await Promise.all(pending);
  assert.equal(effects, 8); assert.equal(limited.status().inFlight, 0);
  await limited.execute({}); assert.equal(effects, 9);
});
