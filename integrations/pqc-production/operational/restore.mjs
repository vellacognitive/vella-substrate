// Synthetic verifier-only restore rehearsal. Never accepts production directories.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';
import {mkdtemp, mkdir, readFile, writeFile, readdir, cp, rm, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

assert.equal(process.argv.length, 3, 'supply one isolated installed application path');
const app = resolve(process.argv[2]), require = createRequire(join(app, 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)));
const operator = await load('@vellacognitive/vella-mcp-server/pqc/operator');
const pq = await load('@vellacognitive/vella-sdk/pqc/index.js');
const verifier = require.resolve('@vellacognitive/vella-sdk/pqc/verify-cli.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = await mkdtemp(join(tmpdir(), 'vella-restore-'));
const source = join(root, 'producer'), backup = join(root, 'backup'), restored = join(root, 'restored');
const trustPath = join(root, 'independent-public-trust.json');
let client;

// Only walks newly generated fixture directories; refuses links/special files.
async function inventory(directory, prefix = '') {
  const files = {};
  for (const entry of (await readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name, path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await inventory(path, `${name}/`));
    else {
      assert.ok(entry.isFile(), 'archive contains a link or special file');
      const bytes = await readFile(path);
      files[name] = {bytes: bytes.length, sha256: hash(bytes)};
    }
  }
  return files;
}
function verify(path, keySetId) {
  const result = spawnSync(process.execPath, [verifier, path, trustPath, keySetId, pq.SUITE], {encoding: 'utf8', timeout: 10000});
  assert.ifError(result.error);
  return {status: result.status, value: JSON.parse(result.stdout)};
}

try {
  await mkdir(source, {mode: 0o700});
  const f = await operator.setup(source);
  const attempts = [];
  let registry = f.registry;
  const requests = [
    {reportId: 'ascii', content: 'a'.repeat(1024)},
    {reportId: 'unicode-bmp', content: 'é'.repeat(4096)},
    {reportId: 'unicode-supplementary', content: '😀'.repeat(2048)},
  ];
  client = await operator.connect(f.configPath);
  for (const [index, args] of requests.entries()) {
    if (index === 2) {
      await client.close(); client = undefined;
      const keys = await pq.openLocalKeyStore({directory: f.config.keyDirectory});
      try { registry = await keys.rotate(); } finally { keys.close(); }
      client = await operator.connect(f.configPath);
    }
    await operator.approveBatch(f.config, [args]);
    const response = await client.callTool({name: 'exportReport', arguments: args});
    const result = response._meta['com.vellacognitive/governance'];
    assert.equal(result.outcome, 'reported_success');
    assert.equal(result.authorizationRetained, true);
    assert.equal(result.receiptRetained, true);
    attempts.push({args, result, keySetId: registry.activeId});
  }
  await client.close(); client = undefined;
  // Independent public trust is captured from the operator, not accepted from backup.
  await writeFile(trustPath, JSON.stringify(registry), {mode: 0o600, flag: 'wx'});
  const manifest = {...await inventory(f.config.reportDirectory, 'reports/'), ...await inventory(f.config.proofDirectory, 'proofs/')};
  await mkdir(backup, {mode: 0o700});
  await cp(f.config.reportDirectory, join(backup, 'reports'), {recursive: true, errorOnExist: true, force: false});
  await cp(f.config.proofDirectory, join(backup, 'proofs'), {recursive: true, errorOnExist: true, force: false});
  assert.deepEqual(await inventory(backup), manifest, 'backup must match producer inventory');
  assert.equal(Object.keys(manifest).length, 12, '3 reports, 6 attempt records, policy and 2 public trust revisions');
  assert.deepEqual((await readdir(backup)).sort(), ['proofs', 'reports']);
  assert.equal(registry.history.length, 2);
  assert.equal(registry.history.find(entry => entry.id === attempts[0].keySetId).status, 'retired');
  // Simulate losing the producer, including its private keys. Only public archive remains.
  await rm(source, {recursive: true, force: true});
  const start = performance.now();
  await cp(backup, restored, {recursive: true, errorOnExist: true, force: false});
  async function audit() {
    assert.deepEqual(await inventory(restored), manifest, 'restored inventory must match independent manifest');
    for (const {args, result, keySetId} of attempts) {
      const authPath = join(restored, 'proofs', `${result.attemptId}.authorization.json`);
      const checked = verify(authPath, keySetId);
      assert.equal(checked.status, 0);
      assert.equal(checked.value.ok, true);
      assert.equal(checked.value.trustedForNewExecution, false);
      assert.equal(checked.value.authenticated.evidence.attempt_id, result.attemptId);
      assert.equal(checked.value.authenticated.action_digest, result.receipt.action_digest);
      const receipt = JSON.parse(await readFile(join(restored, 'proofs', `${result.attemptId}.receipt.json`), 'utf8'));
      assert.deepEqual(receipt, result.receipt, 'receipt matches independently captured response; remains unsigned');
      assert.equal(receipt.signed, false);
      assert.equal(await readFile(join(restored, 'reports', `${args.reportId}.txt`), 'utf8'), args.content);
    }
  }
  await audit();
  const restoreAndVerifyMs = performance.now() - start;
  const first = attempts[0], authPath = join(restored, 'proofs', `${first.result.attemptId}.authorization.json`);
  const receiptPath = join(restored, 'proofs', `${first.result.attemptId}.receipt.json`);
  const reportPath = join(restored, 'reports', `${first.args.reportId}.txt`);
  async function altered(path, bytes) {
    const original = await readFile(path);
    await writeFile(path, bytes);
    await assert.rejects(audit);
    await writeFile(path, original);
  }
  const originalProof = await readFile(authPath);
  const corrupt = JSON.parse(originalProof); corrupt.payload_hash = 'sha384:' + '0'.repeat(96);
  await writeFile(authPath, JSON.stringify(corrupt));
  assert.equal(verify(authPath, first.keySetId).status, 1, 'cryptographic verifier rejects altered proof');
  await assert.rejects(audit);
  await writeFile(authPath, originalProof);
  await altered(receiptPath, '{}');
  const reportBytes = await readFile(reportPath);
  await rm(reportPath); await assert.rejects(audit); await writeFile(reportPath, reportBytes);
  const extra = join(restored, 'unexpected.json');
  await writeFile(extra, '{}'); await assert.rejects(audit); await rm(extra);
  const retainedTrust = join(restored, 'proofs', 'verification-material', 'public-trust.1.json');
  const trustBytes = await readFile(retainedTrust);
  await rm(retainedTrust); await assert.rejects(audit); await writeFile(retainedTrust, trustBytes);
  await rename(trustPath, trustPath + '.unavailable');
  assert.equal(verify(authPath, first.keySetId).status, 1, 'missing independent trust fails verification');
  await rename(trustPath + '.unavailable', trustPath);
  await audit();
  console.log(JSON.stringify({kind: 'vella-local-restore-rehearsal', allPassed: true, node: process.version,
    installationLockSha256: hash(await readFile(join(app, 'package-lock.json'))),
    sourceSha256: hash(await readFile(new URL(import.meta.url))),
    reports: attempts.length, authorizations: attempts.length, receipts: attempts.length, keySets: registry.history.length,
    restoredFiles: Object.keys(manifest).length, privateKeysRestored: false, producerRemovedBeforeVerification: true,
    restoreAndVerifyMs, independentTrustSha256: hash(await readFile(trustPath)), manifest,
    negativeChecks: ['corrupted proof rejected by verifier and inventory', 'altered unsigned receipt', 'missing report', 'unexpected file', 'missing retained trust', 'missing independent trust'],
    unicodeChecks: requests.map(({reportId, content}) => ({reportId, codeUnits: content.length, utf8Bytes: Buffer.byteLength(content)})),
    scope: 'Synthetic local copy/restore with independent in-memory manifest and operator public trust; no off-host backup, production recovery objective, private-key restore or power-loss qualification'}, null, 2));
} finally { await client?.close(); await rm(root, {recursive: true, force: true}); }
