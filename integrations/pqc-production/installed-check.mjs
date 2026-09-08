import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve, join} from 'node:path';
import {mkdtemp, readFile, readdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';

const app = resolve(process.argv[2]), python = process.argv[3];
const require = createRequire(join(app, 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)));
const sdk = await load('@vellacognitive/vella-sdk');
const pq = await load('@vellacognitive/vella-sdk/pqc/index.js');
const operator = await load('@vellacognitive/vella-mcp-server/pqc/operator');
const root = await mkdtemp(join(tmpdir(), 'vella-installed-'));
let client;
try {
  assert.ok(!require.resolve('@vellacognitive/vella-sdk').includes('/work/vella-substrate/'));
  const f = await operator.setup(root);
  client = await operator.connect(f.configPath);
  for (const [index, name] of ['exportReport', 'ExportReport'].entries()) {
    const args = {reportId: `installed-${index}`, content: 'installed-package acceptance'};
    await operator.approveBatch(f.config, [args], name);
    const result = await client.callTool({name, arguments: args});
    assert.equal(result._meta['com.vellacognitive/governance'].outcome, 'reported_success', JSON.stringify(result));
    assert.equal(result._meta['com.vellacognitive/governance'].receipt.kind, 'vella_execution_receipt_v2');
    assert.equal(await readFile(join(f.config.reportDirectory, `${args.reportId}.txt`), 'utf8'), args.content);
  }
  await client.close(); client = undefined;
  const auth = (await readdir(f.config.proofDirectory)).filter(p => p.endsWith('.authorization.json'));
  assert.equal(auth.length, 2);
  const bundlePath = join(f.config.proofDirectory, auth[0]);
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  assert.equal(pq.verifyProofV3(bundle, f.publicKeys, pq.SUITE).ok, true);
  const trustPath = join(f.config.proofDirectory, 'verification-material/public-trust.1.json');
  const args = [bundlePath, trustPath, f.registry.activeId, pq.SUITE];
  const nodeCheck = spawnSync(process.execPath, [require.resolve('@vellacognitive/vella-sdk/pqc/verify-cli.mjs'), ...args], {encoding: 'utf8'});
  assert.equal(nodeCheck.status, 0, nodeCheck.stderr + nodeCheck.stdout);
  const env = {...process.env}; delete env.PYTHONPATH;
  const pyCheck = spawnSync(python, ['-I', '-m', 'vella.pqc.verify_cli', ...args], {encoding: 'utf8', env});
  assert.equal(pyCheck.status, 0, pyCheck.stderr + pyCheck.stdout);
  const shellCheck = spawnSync('/bin/sh', [new URL('../../verify/verify-v3.sh', import.meta.url).pathname, ...args], {encoding:'utf8', env:{...env, VELLA_PYTHON:python}});
  assert.equal(shellCheck.status, 0, shellCheck.stderr + shellCheck.stdout);
  const pyGenerate = spawnSync(python, ['-I', '-c', `import json, vella\nfrom vella.pqc import *\npair=generate_hybrid_keys(SUITE)\nr=vella.create_governor(proof_profile=HybridProfile()).govern(intent='EXECUTE_CHANGE', evidence_mask=1, proof_signing_key=pair['privateKeys'])\nprint(json.dumps({'bundle':r['proof_bundle'],'publicKeys':pair['publicKeys'],'version':vella.__version__,'module':vella.__file__}))`], {encoding: 'utf8', env});
  assert.equal(pyGenerate.status, 0, pyGenerate.stderr);
  const produced = JSON.parse(pyGenerate.stdout);
  assert.equal(produced.version, '2.1.0');
  assert.ok(!produced.module.includes('/work/vella-substrate/'));
  assert.equal(pq.verifyProofV3(produced.bundle, produced.publicKeys, pq.SUITE).ok, true);
  const legacyKeys = generateKeyPairSync('ec', {namedCurve: 'prime256v1', privateKeyEncoding: {type:'pkcs8',format:'pem'}, publicKeyEncoding:{type:'spki',format:'pem'}});
  const legacy = sdk.govern({intent:'EXECUTE_CHANGE',evidenceMask:1,proof:{signingKey:legacyKeys.privateKey}}).proofBundle;
  assert.equal(legacy.kind, 'vella_proof_bundle_v2');
  assert.equal(sdk.verifyProofV2(legacy, legacyKeys.publicKey).ok, true);
  assert.equal(sdk.verifyProofV2(bundle, f.publicKeys['ecdsa-p256-sha256']).ok, false);
  assert.equal(pq.verifyProofV3(legacy, f.publicKeys, pq.SUITE).ok, false);
  const draft = {...bundle, kind:'vella_proof_bundle_pq_draft1'};
  assert.equal(pq.verifyProofV3(draft, f.publicKeys, pq.SUITE).ok, false);
  await writeFile(bundlePath, JSON.stringify(draft));
  const pyReject = spawnSync(python, ['-I','-m','vella.pqc.verify_cli',...args], {encoding:'utf8',env});
  assert.equal(pyReject.status, 1);
  console.log(JSON.stringify({kind:'vella-installed-v3-checks',allPassed:true,node:process.version,sdk:'2.1.0',mcp:'1.1.0',pythonSDK:produced.version,
    checks:['both native MCP routes','Node-produced archive verified by installed Node/Python CLIs','installed Python-produced proof verified by Node','v2 default retained','mixed-format/draft rejection'],sourceCheckoutUsed:false},null,2));
} finally { await client?.close(); await rm(root, {recursive:true,force:true}); }
