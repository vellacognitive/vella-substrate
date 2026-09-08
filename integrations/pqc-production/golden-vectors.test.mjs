import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyProofV3, SUITE} from '../../sdk/node/pqc/index.js';

test('frozen public v3 vectors remain verifiable by both runtimes', () => {
  const fixtures=JSON.parse(readFileSync(new URL('../../spec/pqc/public-vectors-v3.json',import.meta.url),'utf8'));
  assert.equal(fixtures.vectors.length,4);
  assert.equal(JSON.stringify(fixtures).includes('PRIVATE KEY'),false);
  assert.equal(JSON.stringify(fixtures).includes('privateKeys'),false);
  const requests=fixtures.vectors.map(vector=>({op:'verify',bundle:vector.bundle,keys:vector.publicKeys,suite:SUITE}));
  const python=spawnSync(process.env.PQC_PYTHON ?? 'python3',[fileURLToPath(new URL('./bridge.py',import.meta.url))],{
    encoding:'utf8',input:JSON.stringify(requests),env:{...process.env,PYTHONPATH:fileURLToPath(new URL('../../sdk/python',import.meta.url))}});
  assert.equal(python.status,0,python.stderr);
  const verified=JSON.parse(python.stdout);
  fixtures.vectors.forEach((vector,i)=>{
    const node=verifyProofV3(vector.bundle,vector.publicKeys,SUITE);
    assert.equal(node.ok,true);assert.equal(verified[i].ok,true);
    assert.deepEqual(node.authenticated,verified[i].authenticated);
  });
});
