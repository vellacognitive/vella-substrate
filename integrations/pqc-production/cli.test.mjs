import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {openLocalKeyStore} from './local-keys.mjs';
import {HYBRID_PROFILE} from './profile.mjs';
import {createGovernor} from '../../sdk/node/governor.js';
import {DEFAULT_POLICY} from '../../sdk/node/policy.js';
import proof from './proof.cjs';

test('Node, Python and shell CLIs verify retired keys without claiming execution authority; downgrade and corrupt signatures reject', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vella-pq-cli-'));
  const keys = await openLocalKeyStore({directory: join(root, 'keys'), initialize: true});
  t.after(async () => { keys.close(); await rm(root, {recursive: true, force: true}); });
  await keys.rotate(); const session = keys.capture();
  const governor = createGovernor(DEFAULT_POLICY, {proofProfile: HYBRID_PROFILE});
  const result = governor.govern({intent: 'EXECUTE_CHANGE', evidenceMask: 1, proof: {signingKey: session.signingKey}});
  const wrongContext = governor.govern({intent: 'EXECUTE_CHANGE', evidenceMask: 1, evidence: {signing_key: {key_set_id: 'wrong-set', key_revision: 1}}, proof: {signingKey: session.signingKey}}).proofBundle;
  assert.equal(result.decision, 'ALLOWED'); assert.ok(result.proofBundle);
  await keys.rotate();
  const trustPath = join(root, 'trust.json'), bundlePath = join(root, 'proof.json');
  await writeFile(trustPath, JSON.stringify(keys.status()), {mode: 0o600});
  await writeFile(bundlePath, JSON.stringify(result.proofBundle), {mode: 0o600});
  const wrongContextPath = join(root, 'wrong-context.json');
  await writeFile(wrongContextPath, JSON.stringify(wrongContext), {mode: 0o600});
  assert.equal(keys.verifyHistorical(wrongContext, {keySetId: session.keySetId, policy: 'report-current-trust-state'}).ok, false);
  const python = process.env.PQC_PYTHON ?? 'python3';
  const commands = [[process.execPath, fileURLToPath(new URL('./verify-cli.mjs', import.meta.url))],
    [python, fileURLToPath(new URL('./verify_cli.py', import.meta.url))],
    ['/bin/sh', fileURLToPath(new URL('./verify-cli.sh', import.meta.url))]];
  for (const [command, script] of commands) {
    let checked = spawnSync(command, [script, bundlePath, trustPath, session.keySetId, proof.SUITE], {encoding: 'utf8', env: {...process.env, PQC_PYTHON: python}});
    assert.equal(checked.status, 0, checked.stderr + checked.stdout);
    const report = JSON.parse(checked.stdout); assert.equal(report.ok, true); assert.equal(report.keyStatus, 'retired'); assert.equal(report.trustedForNewExecution, false);
    checked = spawnSync(command, [script, bundlePath, trustPath, session.keySetId, 'ml-dsa-65'], {encoding: 'utf8', env: {...process.env, PQC_PYTHON: python}});
    assert.equal(checked.status, 1); assert.equal(JSON.parse(checked.stdout).ok, false);
    checked = spawnSync(command, [script, wrongContextPath, trustPath, session.keySetId, proof.SUITE], {encoding: 'utf8', env: {...process.env, PQC_PYTHON: python}});
    assert.equal(checked.status, 1); assert.equal(JSON.parse(checked.stdout).ok, false);
  }
  const corrupted = structuredClone(result.proofBundle); delete corrupted.signatures['ecdsa-p256-sha256'];
  await writeFile(bundlePath, JSON.stringify(corrupted), {mode: 0o600});
  for (const [command, script] of commands) {
    const checked = spawnSync(command, [script, bundlePath, trustPath, session.keySetId, proof.SUITE], {encoding: 'utf8', env: {...process.env, PQC_PYTHON: python}});
    assert.equal(checked.status, 1); assert.equal(JSON.parse(checked.stdout).ok, false);
  }
});
